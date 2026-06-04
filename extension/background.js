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

// ── blob → base64 (서비스 워커 호환: FileReader 사용 불가) ─
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // 청크 단위로 변환 (btoa spread는 큰 배열에서 스택 오버플로)
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

// ── 이미지 우클릭 처리 ───────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'open-in-silview' || !info.srcUrl) return;

  const fileName = (info.srcUrl.split('/').pop() || 'image.jpg').split('?')[0];

  try {
    const res = await fetch(info.srcUrl);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    await chrome.storage.session.set({
      pendingImage: { dataUrl, name: fileName, type: blob.type || 'image/jpeg' }
    });
  } catch {
    // CORS 실패 시 URL 저장
    await chrome.storage.session.set({
      pendingImage: { url: info.srcUrl, name: fileName }
    });
  }

  if (tab?.windowId) chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── 메시지 처리 ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PENDING_IMAGE') {
    chrome.storage.session.get('pendingImage').then((data) => {
      sendResponse(data.pendingImage || null);
      chrome.storage.session.remove('pendingImage');
    });
    return true;
  }

  if (msg.type === 'OPEN_IN_APP') {
    chrome.storage.session.set({ pendingImage: msg.data }).then(() => {
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    });
    return true;
  }
});
