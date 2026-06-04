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
chrome.runtime.sendMessage({ type: 'GET_PENDING_IMAGE' }, (imageData) => {
  if (imageData) {
    pendingImageData = imageData;
    currentImageData = imageData;
  }
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

// ── 초실행관 배너 ────────────────────────────────────────────
(function(){
  let posts=[],idx=0;
  async function init(){
    try{
      const xml=new DOMParser().parseFromString(await(await fetch('https://us-central1-quick-prompt-kjj.cloudfunctions.net/getRss')).text(),'application/xml');
      posts=Array.from(xml.querySelectorAll('item')).slice(0,20).map(e=>({
        title:e.querySelector('title')?.textContent?.trim()||'게시물',
        link:e.querySelector('link')?.textContent?.trim()||'https://choshg.com'
      }));
    }catch{posts=[];}
    render();
    if(posts.length>2)setInterval(()=>{idx=(idx+2)%posts.length;render();},5000);
  }
  function render(){
    const w=document.getElementById('choshg-inner');if(!w||!posts.length)return;
    const v=[0,1].map(i=>posts[(idx+i)%posts.length]);
    w.innerHTML=`<div class="cg-wrap"><span class="cg-title">초실행관의 업무 치트키</span><div class="cg-list">${v.map(p=>`<a class="cg-link" href="${p.link}" target="_blank" rel="noopener"><span class="cg-bullet">▸</span><span class="cg-text">${p.title.length>28?p.title.slice(0,28)+'…':p.title}</span></a>`).join('')}</div></div>`;
  }
  init();
})();

// ── 앱으로 열기 ──────────────────────────────────────────────
btnOpenApp.addEventListener('click', () => {
  if (currentImageData) {
    chrome.runtime.sendMessage({ type: 'OPEN_IN_APP', data: currentImageData });
  } else {
    chrome.tabs.create({ url: 'https://silview.choshg.com' });
  }
});
