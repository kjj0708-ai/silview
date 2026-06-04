// silview.choshg.com에서 실행 — 새 탭으로 열릴 때 (?from_ext=1) 이미지 수신
if (new URLSearchParams(location.search).get('from_ext')) {
  window.addEventListener('silview-ready', () => {
    chrome.runtime.sendMessage({ type: 'GET_PENDING_IMAGE' }, (imageData) => {
      if (!imageData) return;
      window.dispatchEvent(new CustomEvent('silview-ext-image', { detail: imageData }));
    });
  }, { once: true });
}
