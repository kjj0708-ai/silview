// ── 컨텍스트 메뉴 등록 (중복 방지 위해 removeAll 먼저) ────
function setupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-in-silview',
      title: '실뷰 패널에 담기 🖼',
      contexts: ['image']
    });
  });
}
chrome.runtime.onInstalled.addListener(setupMenu);
chrome.runtime.onStartup.addListener(setupMenu);

// ── 툴바 버튼 클릭 시 사이드 패널 자동 열림 ────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

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

// ── 이미지 우클릭 → 사이드 패널에 담기 (누적) ──────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'open-in-silview' || !info.srcUrl) return;

  const fileName = (info.srcUrl.split('/').pop() || 'image.jpg').split('?')[0];

  // 1) 사용자 제스처 안에서 패널 즉시 열기 (await 전에!)
  if (tab && tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }

  // 2) 이미지를 storage에 저장 → 패널이 onChanged로 받아 누적
  fetch(info.srcUrl)
    .then(res => res.blob())
    .then(blob => blobToDataUrl(blob))
    .then(dataUrl => chrome.storage.local.set({
      pendingImage: { dataUrl, name: fileName, type: 'image/jpeg', ts: Date.now() }
    }))
    .catch(() => chrome.storage.local.set({
      pendingImage: { url: info.srcUrl, name: fileName, ts: Date.now() }
    }));
});

// ── 메시지: 앱(새 탭)으로 열기 ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_IN_APP') {
    chrome.storage.local.set({ pendingImage: { ...msg.data, ts: Date.now() } }).then(() => {
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    });
  }
});
