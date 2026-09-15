// Ужимает блоки, которые не влезают в ширину страницы (длинные формулы, таблицы, код).
// Подключается перед печатью PDF (build.mjs) и при проверке (check.mjs).
(function () {
  function fitBlocks() {
    var root = document.querySelector('.markdown-preview'); if (!root) return;
    var sel = '.katex-display, table, pre, .katex:not(.katex-display .katex)';
    root.querySelectorAll(sel).forEach(function (el) {
      var limit = el.parentElement.clientWidth; if (!limit) return;
      var start = parseFloat(getComputedStyle(el).fontSize), size = start, min = start * 0.55;
      for (var i = 0; i < 6 && el.scrollWidth > limit + 1 && size > min; i++) {
        size = Math.max(min, size * (limit / el.scrollWidth) * 0.97);
        el.style.fontSize = size + 'px';
      }
    });
  }
  window.__fitBlocks = fitBlocks;
  function run() { (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitBlocks); }
  if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
