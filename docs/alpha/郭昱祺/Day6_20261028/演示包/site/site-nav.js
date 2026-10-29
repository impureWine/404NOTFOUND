(function () {
  const items = [
    ['things-organize.html', 'ph:list-bullets', '事情整理'],
    ['emotion-card.html', 'ph:smiley', '情绪命名卡']
  ];
  const current = location.pathname.split('/').pop();
  const link = (href, icon, label, mobile) => {
    const a = document.createElement('a');
    a.href = href;
    a.dataset.extraNav = 'true';
    a.innerHTML = mobile ? label : `<iconify-icon class="text-[18px]" icon="${icon}"></iconify-icon>${label}`;
    if (mobile) a.className = current === href
      ? 'shrink-0 px-3 py-1.5 rounded-full text-[12.5px] bg-brand-soft text-brand-dark'
      : 'shrink-0 px-3 py-1.5 rounded-full text-[12.5px] text-sub bg-mist';
    else a.className = current === href
      ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] bg-brand-soft text-brand-dark'
      : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] text-sub hover:bg-mist hover:text-ink transition';
    if (current === href) a.setAttribute('aria-current', 'page');
    return a;
  };

  const sidebar = document.querySelector('aside nav');
  if (sidebar) {
    const afterGames = Array.from(sidebar.querySelectorAll('a')).find(a => a.getAttribute('href') === 'games.html');
    const divider = sidebar.querySelector('div.pt-3.mt-3.border-t');
    let anchor = afterGames || divider;
    items.forEach(([href, icon, label]) => {
      if (sidebar.querySelector(`a[href="${href}"]`)) return;
      const a = link(href, icon, label, false);
      if (anchor) {
        anchor.insertAdjacentElement(afterGames ? 'afterend' : 'beforebegin', a);
        if (afterGames) anchor = a;
      }
      else sidebar.appendChild(a);
    });
  }

  const mobile = Array.from(document.querySelectorAll('nav')).find(nav => nav.classList.contains('md:hidden'));
  if (mobile) {
    items.forEach(([href, icon, label]) => {
      if (!mobile.querySelector(`a[href="${href}"]`)) mobile.appendChild(link(href, icon, label, true));
    });
  }
})();
