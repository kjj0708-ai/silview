const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'promo.html'), 'utf8');
const { version } = require('../package.json');

test('promo download buttons use the same versioned public installer URL', () => {
  const buttons = [...html.matchAll(/<a[^>]+data-download="windows"[^>]+href="([^"]+)"/g)];
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal(button[1], `https://dl.choshg.com/silview/silview-setup-${version}.exe`);
  }
  assert.ok(html.includes(`Windows 설치형 · ${version}`));
  assert.ok(html.includes('웹에서 바로 쓰기'));
  assert.ok(html.includes('코드 서명되지 않아'));
});

test('promo navigation points to existing sections and explains the desktop menus', () => {
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)];
  for (const [, target] of anchors) assert.ok(html.includes(`id="${target}"`), target);
  for (const text of ['같은 폴더', '100%는 화면 맞춤', '다음 이미지도 같은 배율', '이미지 열기', '폴더 열기', '편집 / 뷰어', '라이브러리', '기본 이미지 앱 설정', '닫기 / 모두 비우기']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes('설치 불필요'));
});

test('local release matches the checksum published on the promo page', t => {
  const installer = path.join(root, 'release', `실뷰-Setup-${version}.exe`);
  if (!fs.existsSync(installer)) { t.skip('Installer is generated only on the Windows release machine'); return; }
  const checksum = createHash('sha256').update(fs.readFileSync(installer)).digest('hex').toUpperCase();
  assert.ok(html.includes(checksum), 'Download page checksum must match the exact released EXE');
});

test('PWA viewer navigation excludes the standalone promo page', () => {
  const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
  assert.ok(config.includes('navigateFallbackDenylist: [/^\\/promo'));
  const excluded = /^\/promo(?:\.html)?(?:[/?]|$)/;
  assert.equal(excluded.test('/promo.html?v=1.0.0'), true);
  assert.equal(excluded.test('/'), false);
});

test('product benefits and real examples appear before installation instructions', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const hero = html.indexOf('id="web"');
  const viewer = html.indexOf('id="viewer"');
  const editor = html.indexOf('id="editor"');
  const download = html.indexOf('id="desktop"');
  const guide = html.indexOf('id="install-guide"');
  assert.ok(hero < viewer && viewer < editor && editor < download && download < guide);
  for (const copy of ['사진은 편하게.', '편집은 간단하게.', '팝업 광고 없이', '모자이크·블러', '화살표·도형·텍스트', '자르기·크기 조절', '제작자 소개 링크']) {
    assert.ok(html.includes(copy), copy);
  }
  for (const unsupported of ['광고 전혀 없음', '광고 떡칠', '복잡한 포토샵', '즉시 실행']) {
    assert.ok(!html.includes(unsupported), unsupported);
  }
});

test('all local page assets exist and screenshots are real image files', () => {
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)];
  for (const [, asset] of assets) {
    assert.ok(fs.existsSync(path.join(root, 'public', asset)), asset);
  }
  for (const name of ['viewer.png', 'editor.png', 'example-after.png']) {
    const png = fs.readFileSync(path.join(root, 'public', 'promo', name));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(png.readUInt32BE(16) >= 1080, name);
    assert.ok(png.readUInt32BE(20) >= 680, name);
  }
});

test('comparison and collapsed guides have accessible progressive enhancement', () => {
  const script = fs.readFileSync(path.join(root, 'public', 'promo', 'promo.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'promo', 'promo.css'), 'utf8');
  assert.ok(html.includes('type="range" id="compare-range"'));
  assert.ok(html.includes('aria-label="편집 후 이미지 표시 비율"'));
  assert.ok(html.includes('for="compare-range"'));
  assert.ok(script.includes("range.addEventListener('input', updateComparison)"));
  assert.ok(script.includes('guide.open = true'));
  assert.ok(script.includes("window.addEventListener('hashchange', revealGuide)"));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(css.includes('@media(max-width:380px)'));
  for (const id of ['install-guide', 'desktop-menus', 'web-difference']) {
    assert.ok(html.includes(`<details id="${id}">`));
  }
});

function demoPage(hash = '') {
  class Details { open = false; }
  class Element { closest() { return { getAttribute: () => '#desktop-menus' }; } }
  const properties = {};
  const rangeEvents = {};
  const pointerEvents = {};
  const documentEvents = {};
  const windowEvents = {};
  const attributes = {};
  const range = { value: '50', addEventListener: (type, callback) => { rangeEvents[type] = callback; }, setAttribute: (name, value) => { attributes[name] = value; } };
  let captured = null;
  const divider = {
    addEventListener: (type, callback) => { pointerEvents[type] = callback; },
    setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; },
  };
  const comparison = { style: { setProperty: (name, value) => { properties[name] = value; } }, querySelector: () => divider, getBoundingClientRect: () => ({ left: 100, width: 400 }) };
  const guides = { 'install-guide': new Details(), 'desktop-menus': new Details() };
  const document = { getElementById: id => ({ comparison, 'compare-range': range, ...guides })[id], addEventListener: (type, callback) => { documentEvents[type] = callback; } };
  const window = { location: { hash }, addEventListener: (type, callback) => { windowEvents[type] = callback; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'promo', 'promo.js'), 'utf8'), { document, window, HTMLDetailsElement: Details, Element });
  return { properties, attributes, range, rangeEvents, pointerEvents, documentEvents, windowEvents, guides, window, Element };
}

test('comparison updates for range input and clamps dragged handle to image edges', () => {
  const page = demoPage();
  assert.equal(page.properties['--compare-position'], '50%');
  page.range.value = '73';
  page.rangeEvents.input();
  assert.equal(page.properties['--compare-position'], '73%');
  assert.equal(page.attributes['aria-valuetext'], '편집 후 이미지 73% 표시');
  page.pointerEvents.pointerdown({ button: 0, pointerId: 7, clientX: 300, preventDefault() {} });
  assert.equal(page.range.value, '50');
  page.pointerEvents.pointermove({ pointerId: 7, clientX: 50 });
  assert.equal(page.range.value, '0');
  page.pointerEvents.pointermove({ pointerId: 7, clientX: 550 });
  assert.equal(page.range.value, '100');
  page.pointerEvents.pointerup({ pointerId: 7 });
  page.pointerEvents.pointermove({ pointerId: 7, clientX: 300 });
  assert.equal(page.range.value, '100', 'Handle must stop moving after release');
});

test('installation and menu guides open for direct, clicked, and changed hashes', () => {
  const page = demoPage('#install-guide');
  assert.equal(page.guides['install-guide'].open, true);
  page.documentEvents.click({ target: new page.Element() });
  assert.equal(page.guides['desktop-menus'].open, true);
  page.guides['desktop-menus'].open = false;
  page.window.location.hash = '#desktop-menus';
  page.windowEvents.hashchange();
  assert.equal(page.guides['desktop-menus'].open, true);
});
