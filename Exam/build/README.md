# Сборка PDF «для телефона» из `Exam/Answers`

Склеивает README и все билеты `Exam/Answers/*.md` в один документ и печатает его движком
Markdown Preview Enhanced (пакет `crossnote`) через системный Chrome в PDF с узкой страницей
110×200 мм: при просмотре на телефоне «по ширине» текст получается обычного размера.

Результат: `Exam/RL-exam-answers-phone.pdf` (закладки по всем заголовкам, рабочие ссылки между билетами).

## Запуск

```bash
cd Exam/build
npm install          # один раз
npm run build        # ~2–3 минуты; HTML-экспорт + PDF
npm run html         # только HTML (out/RL-exam-answers.html), для отладки
node check.mjs       # проверка HTML при ширине страницы: переполнения, битые якоря, скриншоты в out/shots
```

Нужен Chrome в WSL (`/usr/bin/google-chrome`); другой путь — через `CHROME_PATH=/path/to/chrome`.

## Что делает `build.mjs`

1. Склеивает файлы в порядке README, 00-osnovy, 01…16; убирает `[TOC]`; ставит разрыв страницы перед каждым файлом.
2. Ссылки `NN-name.md` → якорь `#t-NN-name`, `00-osnovy.md#anchor` → `#anchor`.
3. Широкие Mermaid-схемы (`flowchart LR/TD`) пробует перевернуть и оставляет ту ориентацию, при которой схема крупнее на узкой странице.
4. Экспортирует HTML через crossnote (KaTeX, Mermaid, адмонишены как в MPE), подключает `phone.css`.
5. Открывает HTML в Chrome, ждёт Mermaid и шрифты, запускает `fit.js` (ужимает формулы/таблицы/код, не влезающие по ширине), снимает атрибут `for="html-export"` (иначе Chrome печатает документ в масштабе ~0.7) и печатает PDF.

Файлы: `phone.css` — стили для узкой страницы; `fit.js` — подгонка по ширине; `check.mjs` — проверка; `out/` — промежуточные артефакты (не в git).
