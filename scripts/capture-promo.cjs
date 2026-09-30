// Capture the real desktop UI using isolated, fictional demo files.
// Run after npm run build:desktop-ui: electron scripts/capture-promo.cjs
const { app, dialog, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const root = path.resolve(__dirname, '..');
const { start } = require('../desktop/main.cjs');
const output = path.join(root, 'public', 'promo');

async function waitFor(window, expression) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Capture timed out: ${expression}`);
}
async function click(window, label) {
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
}
async function capture(window, fileName) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    try {
      const screenshot = await window.webContents.capturePage();
      assert.equal(screenshot.isEmpty(), false);
      await fs.writeFile(path.join(output, fileName), screenshot.toPNG());
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`Retrying screenshot after renderer warm-up: ${error.message}`);
    }
  }
}

(async () => {
  console.log('Starting isolated SilView screenshot session');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'silview-promo-'));
  const folder = path.join(profile, '실뷰 예시 이미지');
  await fs.mkdir(folder);
  await fs.copyFile(path.join(output, 'example-landscape.svg'), path.join(folder, '01_조용한 산책.svg'));
  await fs.copyFile(path.join(output, 'example-before.svg'), path.join(folder, '02_공유할 업무 메모.svg'));
  await fs.copyFile(path.join(root, 'public', 'silview-512.png'), path.join(folder, '03_실뷰 아이콘.png'));
  process.argv.push(path.join(folder, '01_조용한 산책.svg'));
  const runtime = start({ appRoot: root, userData: path.join(profile, 'profile'), testMode: true });
  await runtime.ready;
  console.log('Desktop window ready');
  const window = runtime.getWindow();
  window.setContentSize(1280, 820);
  window.showInactive();
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.naturalWidth === 1200');
  console.log('Demo image loaded; capturing viewer');
  await capture(window, 'viewer.png');

  await window.webContents.executeJavaScript('document.querySelector("[aria-label=\\"다음 이미지\\"]").click()');
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.naturalWidth === 1080');
  await click(window, '편집');
  await waitFor(window, 'document.querySelector("canvas.lower-canvas")?.width > 0');
  await new Promise(resolve => setTimeout(resolve, 500));

  // Use the actual editor tools, then position their objects on the demo.
  await click(window, '블러');
  // Fabric receives real pointer events; no application state is replaced.
  const metrics = await window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('canvas.lower-canvas');
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  // Image fit: at 1280x820, the 1080x680 image is fit into the editor viewport.
  const scale = Math.min((metrics.width - 100) / 1080, (metrics.height - 160) / 680) * 0.85;
  const imageLeft = metrics.x + (metrics.width - 1080 * scale) / 2;
  const imageTop = metrics.y + (metrics.height - 680 * scale) / 2;
  function pointerDrag(from, to) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x), y: Math.round(from.y) });
    window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(to.x), y: Math.round(to.y), button: 'left' });
    window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 });
  }
  pointerDrag(
    { x: metrics.x + metrics.width / 2, y: metrics.y + metrics.height / 2 },
    { x: imageLeft + 420 * scale, y: imageTop + 284 * scale },
  );
  await new Promise(resolve => setTimeout(resolve, 500));
  await click(window, '선');
  pointerDrag(
    { x: metrics.x + metrics.width / 2, y: metrics.y + metrics.height / 2 },
    { x: imageLeft + 357 * scale, y: imageTop + 552 * scale },
  );
  await new Promise(resolve => setTimeout(resolve, 300));
  // Deselect to show the resulting annotations, not selection handles.
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(metrics.x + 12), y: Math.round(metrics.y + 12), button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(metrics.x + 12), y: Math.round(metrics.y + 12), button: 'left', clickCount: 1 });
  await capture(window, 'editor.png');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(output, 'example-after.png') });
  await click(window, '저장');
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.src.startsWith("data:image/png")');
  const result = nativeImage.createFromBuffer(await fs.readFile(path.join(output, 'example-after.png')));
  assert.deepEqual(result.getSize(), { width: 1080, height: 680 });
  console.log('PASS: real desktop viewer/editor captures and original-size edited example generated');
  app.exit(0);
})().catch(error => { console.error(error.stack); app.exit(1); });
