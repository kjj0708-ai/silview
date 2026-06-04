const frame = document.getElementById('frame');
const loading = document.getElementById('loading');
const btnOpenApp = document.getElementById('btnOpenApp');

let pendingImageData = null;
let currentImageData = null;
let loadingHidden = false;

// ── 로딩 숨김 (중복 호출 안전) ──────────────────────────────
function hideLoading() {
  if (loadingHidden || !loading) return;
  loadingHidden = true;
  loading.style.opacity = '0';
  loading.style.transition = 'opacity 0.3s';
  setTimeout(() => { if (loading) loading.style.display = 'none'; }, 300);
}

// ── 무조건 fallback: 패널 열린 후 3초면 무조건 숨김 ──────────
setTimeout(hideLoading, 3000);

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
chrome.storage.local.get('pendingImage').then((data) => {
  const imageData = data.pendingImage || null;
  chrome.storage.local.remove('pendingImage');
  if (!imageData) return;
  pendingImageData = imageData;
  currentImageData = imageData;
});

// ── 실뷰 READY 메시지 수신 → 즉시 숨김 ──────────────────────
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://silview.choshg.com') return;
  if (event.data?.type === 'SILVIEW_READY') {
    hideLoading();
    if (pendingImageData) sendImageToFrame(pendingImageData);
  }
});

// ── iframe load 이벤트 → 1초 후 숨김 ────────────────────────
frame.addEventListener('load', () => {
  setTimeout(hideLoading, 1000);
});

// ── 앱으로 열기 ──────────────────────────────────────────────
btnOpenApp.addEventListener('click', () => {
  if (currentImageData) {
    chrome.runtime.sendMessage({ type: 'OPEN_IN_APP', data: currentImageData });
  } else {
    chrome.tabs.create({ url: 'https://silview.choshg.com' });
  }
});
