(() => {
  const bridge = window.desktopPet;
  const status = document.querySelector('[data-status]');
  const clickThroughButton = document.querySelector('[data-action="click-through"]');
  let clickThrough = false;

  function render() {
    clickThroughButton.setAttribute('aria-pressed', String(clickThrough));
    status.textContent = clickThrough ? '点击穿透已开启 · Alt+Shift+P 恢复' : '普通交互模式';
  }

  document.querySelector('[data-action="click-through"]').addEventListener('click', () => {
    clickThrough = !clickThrough;
    bridge.setClickThrough(clickThrough);
    render();
  });
  document.querySelector('[data-action="hide"]').addEventListener('click', () => bridge.hide());
  document.querySelector('[data-action="close"]').addEventListener('click', () => bridge.close());
  bridge.onClickThroughChanged(enabled => {
    clickThrough = enabled;
    render();
  });
  render();
})();
