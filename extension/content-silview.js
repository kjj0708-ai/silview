// silview.choshg.com (document_start) — 새 탭으로 열릴 때 이미지 전달
if (new URLSearchParams(location.search).get('from_ext')) {
  let delivered = false;

  function deliver() {
    if (delivered) return;
    chrome.storage.local.get('pendingImage').then((data) => {
      const img = data.pendingImage;
      if (!img || delivered) return;
      delivered = true;
      chrome.storage.local.remove('pendingImage');
      // content script(isolated) → page(main): window.postMessage로 안전 전달
      window.postMessage({ type: 'SILVIEW_EXT_IMAGE', payload: img }, '*');
    });
  }

  // App(React)이 준비 신호를 보내면 즉시 전달 (핸드셰이크)
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === 'SILVIEW_READY') deliver();
  });

  // 신호 놓칠 경우 대비 fallback
  setTimeout(deliver, 1000);
  setTimeout(deliver, 2500);
  setTimeout(deliver, 4000);
}
