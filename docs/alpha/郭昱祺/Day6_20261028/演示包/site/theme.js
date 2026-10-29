(function () {
  const themes = {
    pink: { label: '柔和粉', values: ['#c86b8c', '#984762', '#f9eaf0', '#ebcbd8', '200, 107, 140', '#e3a9bd', '#fdf5f8'] },
    mint: { label: '薄荷绿', values: ['#5f8d86', '#4b736c', '#edf4f3', '#dce7e4', '95, 141, 134', '#a7c9c3', '#f4f8f7'] },
    blue: { label: '雾霾蓝', values: ['#557ca8', '#3d5f86', '#eaf1f8', '#cbd9e8', '85, 124, 168', '#a9c0da', '#f3f7fb'] },
    lavender: { label: '薰衣草紫', values: ['#8a76a8', '#685681', '#f1edf6', '#dcd3e8', '138, 118, 168', '#c4b6d8', '#f7f4fa'] }
  };
  const storageKey = 'companion-prototype-theme';

  function applyTheme(name) {
    const selected = themes[name] ? name : 'pink';
    const root = document.documentElement;
    const values = themes[selected].values;
    root.dataset.theme = selected;
    ['--brand', '--brand-dark', '--brand-soft', '--brand-line', '--brand-rgb', '--brand-focus', '--page-bg']
      .forEach((property, index) => root.style.setProperty(property, values[index]));
    try { localStorage.setItem(storageKey, selected); } catch (_) {}
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === selected));
    });
    const status = document.getElementById('theme-status');
    if (status) status.textContent = '当前主色调：' + themes[selected].label;
  }

  let saved = 'pink';
  try { saved = localStorage.getItem(storageKey) || 'pink'; } catch (_) {}
  applyTheme(saved);

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-theme-choice]');
    if (button) applyTheme(button.dataset.themeChoice);
  });

  window.addEventListener('storage', event => {
    if (event.key === storageKey) applyTheme(event.newValue || 'pink');
  });
})();
