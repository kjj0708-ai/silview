(() => {
  const comparison = document.getElementById('comparison');
  const range = document.getElementById('compare-range');
  if (comparison && range) {
    const updateComparison = () => {
      comparison.style.setProperty('--compare-position', `${range.value}%`);
      range.setAttribute('aria-valuetext', `편집 후 이미지 ${range.value}% 표시`);
    };
    range.addEventListener('input', updateComparison);
    updateComparison();
    const divider = comparison.querySelector('.compare-divider');
    if (divider) {
      const moveDivider = event => {
        const bounds = comparison.getBoundingClientRect();
        if (!bounds.width) return;
        range.value = String(Math.round(Math.max(0, Math.min(100,
          (event.clientX - bounds.left) / bounds.width * 100))));
        updateComparison();
      };
      divider.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        divider.setPointerCapture(event.pointerId);
        moveDivider(event);
      });
      divider.addEventListener('pointermove', event => {
        if (divider.hasPointerCapture(event.pointerId)) moveDivider(event);
      });
      const releaseDivider = event => {
        if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
      };
      divider.addEventListener('pointerup', releaseDivider);
      divider.addEventListener('pointercancel', releaseDivider);
    }
  }
  // Preserve direct links to the installation and menu guides.
  const revealGuide = () => {
    const guide = document.getElementById(window.location.hash.slice(1));
    if (guide instanceof HTMLDetailsElement) guide.open = true;
  };
  window.addEventListener('hashchange', revealGuide);
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link) return;
    const guide = document.getElementById(link.getAttribute('href').slice(1));
    if (guide instanceof HTMLDetailsElement) guide.open = true;
  });
  revealGuide();
})();
