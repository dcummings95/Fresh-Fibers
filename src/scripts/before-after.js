function initSlider(root) {
  const before = root.querySelector('[data-ba-before]');
  const handle = root.querySelector('[data-ba-handle]');
  let dragging = false;

  function move(clientX) {
    const rect = root.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));
    root.style.setProperty('--pos', `${pct}%`);
    if (before) before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    if (handle) handle.style.left = `${pct}%`;
  }

  root.addEventListener('pointerdown', (e) => {
    dragging = true;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    move(e.clientX);
  });

  root.addEventListener('pointermove', (e) => {
    if (dragging) move(e.clientX);
  });

  ['pointerup', 'pointercancel'].forEach((evt) => {
    root.addEventListener(evt, () => {
      dragging = false;
    });
  });

  root.addEventListener('keydown', (e) => {
    const current = parseFloat(root.style.getPropertyValue('--pos')) || 50;
    if (e.key === 'ArrowLeft') {
      move((root.getBoundingClientRect().left) + (root.getBoundingClientRect().width * Math.max(0, current - 5) / 100));
    } else if (e.key === 'ArrowRight') {
      move((root.getBoundingClientRect().left) + (root.getBoundingClientRect().width * Math.min(100, current + 5) / 100));
    }
  });
}

document.querySelectorAll('[data-ba-slider]').forEach(initSlider);
