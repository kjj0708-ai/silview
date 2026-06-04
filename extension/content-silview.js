// silview.choshg.com에서 실행 — 새 탭으로 열릴 때 (?from_ext=1) 이미지 수신
if (new URLSearchParams(location.search).get('from_ext')) {
  let delivered = false;

  function deliver() {
    if (delivered) return;
    chrome.storage.local.get('pendingImage').then((data) => {
      const img = data.pendingImage;
      if (!img || delivered) return;
      delivered = true;
      chrome.storage.local.remove('pendingImage');
      window.dispatchEvent(new CustomEvent('silview-ext-image', { detail: img }));
    });
  }

  // 앱(React)이 준비 신호를 보내면 전달
  window.addEventListener('silview-ready', deliver, { once: true });
  // 신호를 놓칠 경우 대비해 여러 번 재시도
  setTimeout(deliver, 500);
  setTimeout(deliver, 1500);
  setTimeout(deliver, 3000);
}
