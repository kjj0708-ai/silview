// silview.choshg.com에서 실행 (document_start) — 새 탭으로 열릴 때 이미지 전달
if (new URLSearchParams(location.search).get('from_ext')) {
  let delivered = false;

  function deliver() {
    if (delivered) return;
    chrome.storage.local.get('pendingImage').then((data) => {
      const img = data.pendingImage;
      if (!img || delivered) return;
      delivered = true;
      chrome.storage.local.remove('pendingImage');
      // window.postMessage: content script(isolated world) → page(main world) 안전 전달
      // App.tsx의 message 리스너(SILVIEW_EXT_IMAGE)가 수신
      window.postMessage({ type: 'SILVIEW_EXT_IMAGE', payload: img }, '*');
    });
  }

  // React 마운트·이미지 fetch 타이밍 대비 여러 번 재시도
  setTimeout(deliver, 300);
  setTimeout(deliver, 800);
  setTimeout(deliver, 1500);
  setTimeout(deliver, 3000);
}
