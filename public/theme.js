(function () {
  var root = document.documentElement;
  var KEY = 'theme';

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; }
  }
  function effective() {
    return stored() || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  // Apply before first paint (script is loaded in <head>).
  var s = stored();
  if (s) root.setAttribute('data-theme', s);

  function sync() {
    var dark = effective() === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.textContent = dark ? '☀️' : '🌙';
      b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      b.title = b.getAttribute('aria-label');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = effective() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        sync();
      });
    });
    sync();
  });

  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (!stored()) sync(); };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener && mq.addListener(onChange);
  }
})();
