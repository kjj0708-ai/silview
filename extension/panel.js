const frame = document.getElementById('frame');
const loading = document.getElementById('loading');
const btnOpenApp = document.getElementById('btnOpenApp');

let currentImageData = null;
let frameReady = false;
let loadingHidden = false;

// ── 로딩 숨김 ────────────────────────────────────────────────
function hideLoading() {
  if (loadingHidden || !loading) return;
  loadingHidden = true;
  loading.style.opacity = '0';
  loading.style.transition = 'opacity 0.3s';
  setTimeout(() => { if (loading) loading.style.display = 'none'; }, 300);
}
setTimeout(hideLoading, 3000);

// ── iframe으로 이미지 전송 ────────────────────────────────────
function sendImageToFrame(data) {
  if (!data || !frame.contentWindow) return false;
  frame.contentWindow.postMessage(
    { type: 'SILVIEW_EXT_IMAGE', payload: data },
    'https://silview.choshg.com'
  );
  return true;
}

// ── storage에 대기 이미지가 있으면 가져와 전송 ───────────────
function consumePending() {
  chrome.storage.local.get('pendingImage').then((data) => {
    const img = data.pendingImage;
    if (!img) return;
    currentImageData = img;
    if (frameReady) {
      sendImageToFrame(img);
      chrome.storage.local.remove('pendingImage');
    }
  });
}

// ── 실뷰(iframe) READY 수신 → 준비완료 표시 후 대기분 전송 ──
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://silview.choshg.com') return;
  if (event.data?.type === 'SILVIEW_READY') {
    frameReady = true;
    hideLoading();
    consumePending();
  }
});

// ── 핵심: 패널이 이미 열려있을 때 새 이미지 우클릭 대응 ─────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pendingImage?.newValue) {
    consumePending();
  }
});

// ── iframe load fallback ──────────────────────────────────────
frame.addEventListener('load', () => setTimeout(hideLoading, 1200));

// ── 앱으로 열기 ──────────────────────────────────────────────
btnOpenApp.addEventListener('click', () => {
  if (currentImageData) {
    chrome.runtime.sendMessage({ type: 'OPEN_IN_APP', data: currentImageData });
  } else {
    chrome.tabs.create({ url: 'https://silview.choshg.com' });
  }
});

// ── 첫 로드 시 대기분 확인 (READY 전이면 frameReady 후 재전송) ─
consumePending();
