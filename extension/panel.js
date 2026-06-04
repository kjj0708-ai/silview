const frame = document.getElementById('frame');
const loading = document.getElementById('loading');
const btnOpenApp = document.getElementById('btnOpenApp');

let currentImageData = null;
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
  if (!data || !frame.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: 'SILVIEW_EXT_IMAGE', payload: data },
    'https://silview.choshg.com'
  );
}

// ── storage에서 이미지 가져와 전송 (재시도 가능) ─────────────
function tryFetchAndSend() {
  chrome.storage.local.get('pendingImage').then((data) => {
    if (data.pendingImage) {
      chrome.storage.local.remove('pendingImage');
      currentImageData = data.pendingImage;
      sendImageToFrame(data.pendingImage);
    }
  });
}

// ── 실뷰 READY → 즉시 + 1초 후 재시도 (fetch 지연 대비) ─────
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://silview.choshg.com') return;
  if (event.data?.type === 'SILVIEW_READY') {
    hideLoading();
    tryFetchAndSend();
    setTimeout(tryFetchAndSend, 1000);
    setTimeout(tryFetchAndSend, 2500);
  }
});

// ── iframe load fallback ──────────────────────────────────────
frame.addEventListener('load', () => {
  setTimeout(hideLoading, 1000);
});

// ── 앱으로 열기 ──────────────────────────────────────────────
btnOpenApp.addEventListener('click', () => {
  if (currentImageData) {
    chrome.storage.local.set({ pendingImage: currentImageData }).then(() => {
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    });
  } else {
    chrome.tabs.create({ url: 'https://silview.choshg.com' });
  }
});
