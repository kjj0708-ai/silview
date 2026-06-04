// ── 컨텍스트 메뉴 등록 ─────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-in-silview',
    title: '실뷰에서 열기 🖼',
    contexts: ['image']
  });
});

// ── 툴바 버튼 클릭 → 사이드 패널 열기 ────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── 이미지 우클릭 처리 ───────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'open-in-silview' || !info.srcUrl) return;

  const fileName = (info.srcUrl.split('/').pop() || 'image.jpg').split('?')[0];

  try {
    // 확장프로그램은 CORS 없이 fetch 가능
    const res = await fetch(info.srcUrl);
    const blob = await res.blob();

    await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        await chrome.storage.session.set({
          pendingImage: { dataUrl: reader.result, name: fileName, type: blob.type || 'image/jpeg' }
        });
        resolve(undefined);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    // CORS 실패 시 URL 그대로 저장
    await chrome.storage.session.set({
      pendingImage: { url: info.srcUrl, name: fileName }
    });
  }

  // 사이드 패널 열기
  if (tab?.windowId) chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── 메시지 처리 ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 패널 또는 콘텐츠 스크립트가 대기 이미지 요청
  if (msg.type === 'GET_PENDING_IMAGE') {
    chrome.storage.session.get('pendingImage', (data) => {
      sendResponse(data.pendingImage || null);
      chrome.storage.session.remove('pendingImage');
    });
    return true;
  }

  // 패널의 "앱으로 열기" → 이미지를 다시 세션에 저장 후 새 탭 열기
  if (msg.type === 'OPEN_IN_APP') {
    chrome.storage.session.set({ pendingImage: msg.data }).then(() => {
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    });
    return true;
  }
});
