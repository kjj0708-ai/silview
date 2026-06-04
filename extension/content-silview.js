// silview.choshg.com (document_start) — 새 탭으로 열릴 때 이미지 전달
const _fromExt = new URLSearchParams(location.search).get('from_ext');
console.log('[SilViewExt] content script loaded, from_ext =', _fromExt);

if (_fromExt) {
  let delivered = false;

  function deliver(src) {
    if (delivered) return;
    chrome.storage.local.get('pendingImage').then((data) => {
      console.log('[SilViewExt] deliver(' + src + '): pendingImage =', data.pendingImage ? 'EXISTS' : 'NULL');
      const img = data.pendingImage;
      if (!img || delivered) return;
      delivered = true;
      chrome.storage.local.remove('pendingImage');
      console.log('[SilViewExt] posting SILVIEW_EXT_IMAGE to page');
      window.postMessage({ type: 'SILVIEW_EXT_IMAGE', payload: img }, '*');
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === 'SILVIEW_READY') {
      console.log('[SilViewExt] received SILVIEW_READY from page');
      deliver('READY');
    }
  });

  setTimeout(() => deliver('1s'), 1000);
  setTimeout(() => deliver('2.5s'), 2500);
  setTimeout(() => deliver('4s'), 4000);
}
