// silview.choshg.com에서 실행되는 콘텐츠 스크립트
// 실뷰 앱이 준비됐다는 이벤트를 받으면 백그라운드에서 이미지를 가져와 전달합니다

if (new URLSearchParams(location.search).get('from_ext')) {
  window.addEventListener('silview-ready', () => {
    chrome.runtime.sendMessage({ type: 'GET_PENDING_IMAGE' }, (imageData) => {
      if (!imageData) return;
      window.dispatchEvent(new CustomEvent('silview-ext-image', { detail: imageData }));
    });
  }, { once: true });
}
