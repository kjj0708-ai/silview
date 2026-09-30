const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
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
