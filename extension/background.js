// ── 컨텍스트 메뉴 등록 ─────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-in-silview',
    title: '실뷰에서 열기 🖼',
    contexts: ['image']
  });
});

// ── 툴바 버튼 → 사이드 패널 열기 ──────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── blob → base64 (서비스 워커: FileReader 없음) ──────────
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

// ── 이미지 우클릭 → 패널 열기 ───────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'open-in-silview' || !info.srcUrl) return;

  const fileName = (info.srcUrl.split('/').pop() || 'image.jpg').split('?')[0];

  // 먼저 패널 열기 (사용자 제스처 필요하므로 즉시 실행)
  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }

  // 이미지 fetch는 비동기로 처리
  fetch(info.srcUrl)
    .then(res => res.blob())
    .then(blob => blobToDataUrl(blob))
    .then(dataUrl => {
      chrome.storage.local.set({
        pendingImage: { dataUrl, name: fileName, type: 'image/jpeg' }
      });
    })
    .catch(() => {
      // CORS 실패 시 URL 저장
      chrome.storage.local.set({
        pendingImage: { url: info.srcUrl, name: fileName }
      });
    });
});

// ── 메시지 처리 ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PENDING_IMAGE') {
    chrome.storage.local.get('pendingImage').then((data) => {
      sendResponse(data.pendingImage || null);
      chrome.storage.local.remove('pendingImage');
    });
    return true;
  }

  if (msg.type === 'OPEN_IN_APP') {
    chrome.storage.local.set({ pendingImage: msg.data }).then(() => {
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    });
    return true;
  }
});
