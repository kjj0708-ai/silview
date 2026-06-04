const frame = document.getElementById('frame');
const loading = document.getElementById('loading');
const btnOpenApp = document.getElementById('btnOpenApp');

let pendingImageData = null;
let currentImageData = null; // 앱으로 열기에서 사용

// ── 로딩 숨김 ───────────────────────────────────────────────
function hideLoading() {
  loading.classList.add('hidden');
  setTimeout(() => loading.remove(), 400);
}

// ── 이미지를 iframe으로 전송 ─────────────────────────────────
function sendImageToFrame(data) {
  if (!data || !frame.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: 'SILVIEW_EXT_IMAGE', payload: data },
    'https://silview.choshg.com'
  );
  pendingImageData = null;
}

// ── 백그라운드에서 대기 이미지 요청 ─────────────────────────
chrome.runtime.sendMessage({ type: 'GET_PENDING_IMAGE' }, (imageData) => {
  if (imageData) {
    pendingImageData = imageData;
    currentImageData = imageData;
  }
});

// ── 실뷰가 준비됐다는 메시지 수신 ───────────────────────────
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://silview.choshg.com') return;

  if (event.data?.type === 'SILVIEW_READY') {
    hideLoading();
    if (pendingImageData) sendImageToFrame(pendingImageData);
  }
});

// ── iframe 로드 완료 (fallback 2초 후 로딩 숨김) ────────────
frame.addEventListener('load', () => {
  setTimeout(hideLoading, 2000);
});

// ── 앱으로 열기 버튼 ─────────────────────────────────────────
btnOpenApp.addEventListener('click', () => {
  if (currentImageData) {
    // 현재 이미지를 세션에 저장 후 새 탭 열기
    chrome.runtime.sendMessage({ type: 'OPEN_IN_APP', data: currentImageData });
  } else {
    chrome.tabs.create({ url: 'https://silview.choshg.com' });
  }
});
