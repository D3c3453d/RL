// Сборка одного PDF «для телефона» из Exam/Answers/*.md движком MPE (crossnote).
// Запуск: cd Exam/build && npm run build
// Результат: Exam/RL-exam-answers-phone.pdf (плюс out/RL-exam-answers.md и .html для отладки)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Notebook } from 'crossnote';

const here = path.dirname(fileURLToPath(import.meta.url));
const ANSWERS = path.resolve(here, '../Answers');
const OUT_DIR = path.resolve(here, 'out');
const NAME = 'RL-exam-answers';
const FINAL_PDF = path.resolve(here, `../${NAME}-phone.pdf`);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const WANT = new Set(process.argv.slice(2)); // html | pdf | screenshots (по умолчанию html+pdf)
if (WANT.size === 0) { WANT.add('html'); WANT.add('pdf'); }

// Порядок: README, основы, билеты по номерам.
const files = ['README.md', ...fs.readdirSync(ANSWERS).filter(f => /^\d\d-.*\.md$/.test(f)).sort()];
const names = files.map(f => f.replace(/\.md$/, ''));

// Размер страницы подобран под экран телефона: при показе «по ширине» текст ~1:1.
const frontMatter = `---
puppeteer:
  width: "110mm"
  height: "200mm"
  margin: { top: "7mm", bottom: "7mm", left: "6mm", right: "6mm" }
  printBackground: true
  outline: true
  timeout: 0
---
`;

function transform(md, name, swap, counter) {
  let out = md;
  // Широкие flowchart LR/TD на узкой странице ужимаются в точку; для отмеченных диаграмм меняем направление.
  out = out.replace(/(```mermaid\s*\n\s*)(flowchart|graph)\s+(LR|TD|TB)\b/g, (m, pre, kw, dir) => {
    const i = counter.n++;
    if (!swap.has(i)) return m;
    return `${pre}${kw} ${dir === 'LR' ? 'TD' : 'LR'}`;
  });
  // Убираем [TOC]: в общем документе он бы разросся на весь сборник.
  out = out.replace(/^\[TOC\]\s*$/gm, '');
  // Ссылки на другие файлы набора -> якоря внутри документа.
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\]\\(${esc}\\.md#([^)]+)\\)`, 'g'), '](#$1)');
    out = out.replace(new RegExp(`\\]\\(${esc}\\.md\\)`, 'g'), `](#t-${n})`);
  }
  return `<a id="t-${name}"></a>\n\n${out.trim()}\n`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const mergedPath = path.join(OUT_DIR, `${NAME}.md`);
function assemble(swap) {
  const counter = { n: 0 };
  const parts = files.map((f, i) => transform(fs.readFileSync(path.join(ANSWERS, f), 'utf8'), names[i], swap, counter));
  const merged = frontMatter + parts.join('\n\n<div style="page-break-before: always"></div>\n\n');
  fs.writeFileSync(mergedPath, merged);
  const left = merged.match(/\]\([^)#]*\.md[^)]*\)/g);
  if (left) console.warn('Непереписанные ссылки на .md:', [...new Set(left)]);
  return counter.n;
}
const nDiagrams = assemble(new Set());
console.log(`Склеено ${files.length} файлов -> ${mergedPath}, flowchart-диаграмм: ${nDiagrams}`);

// Текстовая область страницы в CSS px (96 dpi): 110-12 мм по ширине, 200-14 мм по высоте.
const PAGE_W = Math.round((110 - 12) / 25.4 * 96), PAGE_H = Math.round((200 - 14) / 25.4 * 96);
// Масштаб, с которым диаграмма поместится на страницу (1 = натуральная величина).
const fit = ({ w, h }) => Math.min(1, PAGE_W / w, PAGE_H / h);
async function measureDiagrams(htmlPath) {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: PAGE_W, height: 800 });
    await page.goto('file://' + htmlPath, { waitUntil: 'load', timeout: 120000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 5000)));
    return await page.evaluate(() => [...document.querySelectorAll('.mermaid')].map(m => {
      const s = m.querySelector('svg'); if (!s) return null;
      // только flowchart/graph (у sequenceDiagram направление не меняется)
      const vb = (s.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
      return { w: vb[2], h: vb[3], flow: !!s.querySelector('.nodes, .edgePaths') };
    }));
  } finally { await browser.close(); }
}

const globalCss = fs.readFileSync(path.join(here, 'phone.css'), 'utf8');
const notebook = await Notebook.init({
  notebookPath: OUT_DIR,
  config: {
    chromePath: CHROME,
    puppeteerArgs: ['--no-sandbox', '--disable-gpu'],
    puppeteerWaitForTimeout: 3000,
    mathRenderingOption: 'KaTeX',
    printBackground: true,
    previewTheme: 'github-light.css',
    codeBlockTheme: 'github.css',
    mermaidTheme: 'default',
    enableScriptExecution: false,
    enableExtendedTableSyntax: true,
    enableEmojiSyntax: true,
    globalCss,
  },
});
const engine = notebook.getNoteMarkdownEngine(mergedPath);

const exportHtml = async () => {
  const t = Date.now();
  const html = await engine.htmlExport({ offline: true, runAllCodeChunks: false });
  console.log(`HTML: ${html} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  return html;
};
let html = await exportHtml();
if (!WANT.has('noswap')) {
  // Подбор ориентации диаграмм: пробуем перевернуть широкие, оставляем перевёрнутыми те, что стали крупнее.
  const orig = (await measureDiagrams(html)).filter(Boolean);
  const flows = orig.map((d, i) => ({ ...d, i })).filter(d => d.flow);
  if (flows.length !== nDiagrams) console.warn(`flowchart в HTML: ${flows.length}, в markdown: ${nDiagrams} — индексы могут не совпасть`);
  const candidates = new Set(flows.map((d, k) => (fit(d) < 0.9 ? k : -1)).filter(k => k >= 0));
  if (candidates.size) {
    assemble(candidates);
    html = await exportHtml();
    const swapped = (await measureDiagrams(html)).filter(Boolean).filter(d => d.flow);
    const keep = new Set([...candidates].filter(k => fit(swapped[k]) > fit(flows[k]) * 1.15));
    console.log(`Перевёрнуто диаграмм: ${keep.size} из ${candidates.size} кандидатов; масштабы:`,
      flows.map((d, k) => `${k}:${fit(d).toFixed(2)}${keep.has(k) ? '→' + fit(swapped[k]).toFixed(2) : ''}`).join(' '));
    if (keep.size !== candidates.size) { assemble(keep); html = await exportHtml(); }
  }
}
if (WANT.has('pdf')) {
  // PDF печатаем сами из HTML-экспорта: так можно дождаться Mermaid и шрифтов и запустить fit.js перед печатью.
  const t = Date.now();
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: PAGE_W, height: PAGE_H });
    await page.goto('file://' + html, { waitUntil: 'load', timeout: 0 });
    await page.waitForFunction(() => [...document.querySelectorAll('.mermaid')].every(m => m.querySelector('svg')), { timeout: 120000 });
    // Подгонку по ширине делаем уже в печатной раскладке (таблицы в print-режиме считаются иначе).
    await page.evaluate(() => document.body.removeAttribute('for'));
    await page.emulateMediaType('print');
    await page.addScriptTag({ path: path.join(here, 'fit.js') });
    await page.evaluate(() => document.fonts.ready.then(() => window.__fitBlocks()));
    // (атрибут for="html-export" снят выше: с ним Chrome печатает весь документ в масштабе ~0.7)
    await page.pdf({
      path: FINAL_PDF, width: '110mm', height: '200mm',
      margin: { top: '7mm', bottom: '7mm', left: '6mm', right: '6mm' },
      printBackground: true, outline: true, tagged: true, timeout: 0,
    });
  } finally { await browser.close(); }
  console.log(`PDF: ${FINAL_PDF} (${(fs.statSync(FINAL_PDF).size / 1e6).toFixed(1)} MB, ${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
process.exit(0);
