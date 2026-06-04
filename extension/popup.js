document.getElementById('openSilview').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://silview.choshg.com' });
});

document.getElementById('openImages').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // 현재 페이지의 모든 이미지 src 수집
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => img.src || img.currentSrc)
        .filter(src => src && !src.startsWith('data:') && src.length > 10)
        .filter((v, i, a) => a.indexOf(v) === i) // 중복 제거
        .slice(0, 20);
    }
  });

  const urls = results?.[0]?.result || [];
  if (!urls.length) {
    alert('이미지를 찾을 수 없습니다.');
    return;
  }

  // 첫 번째 이미지를 실뷰에서 열기 (여러 개면 ?images=url1,url2,... 형태로 전달)
  const encoded = encodeURIComponent(urls.join(','));
  chrome.tabs.create({ url: `https://silview.choshg.com/?ext_images=${encoded}` });
});
