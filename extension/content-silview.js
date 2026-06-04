// silview.choshg.com에서 실행 — 새 탭으로 열릴 때 (?from_ext=1) 이미지 수신
if (new URLSearchParams(location.search).get('from_ext')) {
  window.addEventListener('silview-ready', () => {
    chrome.storage.local.get('pendingImage').then((data) => {
      const img = data.pendingImage;
      if (!img) return;
      chrome.storage.local.remove('pendingImage');
      window.dispatchEvent(new CustomEvent('silview-ext-image', { detail: img }));
    });
  }, { once: true });
}
