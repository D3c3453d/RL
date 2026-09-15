// Проверка HTML-сборки в Chrome при ширине «телефонной» страницы: переполнения, битые якоря, ошибки KaTeX/Mermaid, скриншоты.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.join(here, 'out/RL-exam-answers.html');
const shots = path.join(here, 'out/shots'); fs.mkdirSync(shots, { recursive: true });
const WIDTH = Math.round((110 - 12) / 25.4 * 96); // текстовая область 98мм в CSS px
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 800, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('file://' + html, { waitUntil: 'load', timeout: 120000 });
await page.evaluate(() => new Promise(r => setTimeout(r, 6000)));
await page.addScriptTag({ path: path.join(here, 'fit.js') });
await page.evaluate(() => document.fonts.ready.then(() => window.__fitBlocks()));
const report = await page.evaluate(() => {
  const root = document.querySelector('.markdown-preview');
  const over = [];
  for (const el of root.querySelectorAll('*')) {
    if (['SVG','G','PATH','TEXT','TSPAN','FOREIGNOBJECT','SPAN'].includes(el.tagName.toUpperCase())) continue;
    if (el.closest('.katex-mathml')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > document.documentElement.clientWidth + 1 || el.scrollWidth > el.clientWidth + 2) {
      over.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 40), w: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth, txt: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').slice(0, 70) });
    }
  }
  const ids = new Set([...root.querySelectorAll('[id]')].map(e => e.id));
  const broken = [...root.querySelectorAll('a[href^="#"]')].map(a => decodeURIComponent(a.getAttribute('href').slice(1))).filter(h => !ids.has(h));
  return {
    width: document.documentElement.clientWidth,
    katexErrors: root.querySelectorAll('.katex-error').length,
    katex: root.querySelectorAll('.katex').length,
    mermaid: root.querySelectorAll('.mermaid').length,
    mermaidSvg: root.querySelectorAll('.mermaid svg').length,
    admonitions: root.querySelectorAll('.admonition').length,
    headings: root.querySelectorAll('h1').length,
    broken: [...new Set(broken)],
    overCount: over.length,
    // только «внешние» элементы, вылезающие за правый край страницы
    over: [...root.querySelectorAll('*')].filter(el => {
      if (['SVG','G','PATH','TEXT','TSPAN','FOREIGNOBJECT','RECT','POLYGON','LINE','MARKER','DEFS','STYLE','LABEL'].includes(el.tagName.toUpperCase())) return false;
      if (el.closest('.katex-mathml')) return false; // скрытый MathML, визуально не виден
      const W = document.documentElement.clientWidth + 1;
      return el.getBoundingClientRect().right > W && !(el.parentElement && el.parentElement !== root && el.parentElement.getBoundingClientRect().right > W);
    }).map(el => ({ tag: el.tagName, cls: el.className?.toString().slice(0, 30), right: Math.round(el.getBoundingClientRect().right), txt: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').slice(0, 60) })).slice(0, 60),
    mermaidShapes: [...root.querySelectorAll('.mermaid svg')].map(s => { const vb = (s.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number); return { ratio: +(vb[2] / vb[3]).toFixed(2), w: Math.round(vb[2]), h: Math.round(vb[3]) }; }),
  };
});
console.log(JSON.stringify(report, null, 1));
const targets = ['t-README', 't-00-osnovy', 'value', 't-04-dqn', 't-09-trpo', 't-15-mcts'];
for (const id of targets) {
  await page.evaluate(id => { const el = document.getElementById(id); el && el.scrollIntoView(); window.scrollBy(0, -10); }, id);
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await page.screenshot({ path: path.join(shots, `${id}.png`) });
}
// диаграмма mermaid и адмонишен крупным планом
for (const [sel, name] of [['.mermaid', 'mermaid1'], ['.admonition', 'admonition1'], ['pre', 'pre1'], ['table', 'table1']]) {
  const el = await page.$(sel);
  if (el) { await el.scrollIntoView(); await el.screenshot({ path: path.join(shots, `${name}.png`) }).catch(e => console.log(name, e.message)); }
}
await browser.close();
