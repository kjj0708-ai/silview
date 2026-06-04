// 컨텍스트 메뉴 등록
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-in-silview',
    title: '실뷰에서 열기 🖼',
    contexts: ['image']
  });
});

// 대기 중인 이미지 데이터 (메모리 저장)
let pendingImage = null;

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'open-in-silview' || !info.srcUrl) return;

  const fileName = info.srcUrl.split('/').pop()?.split('?')[0] || 'image.jpg';

  try {
    // 확장프로그램은 CORS 없이 fetch 가능
    const res = await fetch(info.srcUrl);
    const blob = await res.blob();

    // Blob → base64 변환
    const reader = new FileReader();
    reader.onloadend = () => {
      pendingImage = {
        dataUrl: reader.result,
        name: fileName,
        type: blob.type || 'image/jpeg'
      };
      chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
    };
    reader.readAsDataURL(blob);

  } catch {
    // CORS 실패 시 URL 그대로 전달
    pendingImage = { url: info.srcUrl, name: fileName };
    chrome.tabs.create({ url: 'https://silview.choshg.com/?from_ext=1' });
  }
});

// 팝업에서 현재 탭 이미지 목록 요청 처리
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PENDING_IMAGE') {
    sendResponse(pendingImage);
    pendingImage = null;
    return true;
  }
});
