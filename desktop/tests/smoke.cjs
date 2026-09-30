const { app, dialog } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
app.disableHardwareAcceleration();

const projectRoot = path.resolve(__dirname, '..', '..');
const appRoot = process.env.SILVIEW_PACKAGED_ROOT ? path.resolve(process.env.SILVIEW_PACKAGED_ROOT) : projectRoot;
const { start } = require(path.join(appRoot, 'desktop', 'main.cjs'));
const outputDirectory = path.join(projectRoot, 'desktop-test-results');
const errors = [];
const captureErrors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  contents.on('did-fail-load', (_event, code, description) => errors.push(`${code}: ${description}`));
});

async function waitFor(window, expression) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}

async function snapshot(window, name) {
  try {
    await fs.writeFile(path.join(outputDirectory, name), (await window.webContents.capturePage()).toPNG());
  } catch (error) {
    captureErrors.push(`${name}: ${error.message || error}`);
  }
}

(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'silview-ui-'));
  const directory = path.join(profile, '한글 사진 폴더');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, '컷 01.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1200"><rect width="400" height="1200" fill="#1e3a8a"/><rect width="400" height="60" fill="#fbbf24"/><rect y="1140" width="400" height="60" fill="#22c55e"/><text x="200" y="620" fill="white" text-anchor="middle" font-size="42">PORTRAIT</text></svg>');
  await fs.copyFile(path.join(appRoot, 'dist-desktop', 'silview-512.png'), path.join(directory, '컷 02.png'));
  await fs.writeFile(path.join(directory, '컷 10.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#166534"/><text x="800" y="420" fill="white" text-anchor="middle" font-size="96">NEXT IMAGE</text></svg>');
  await fs.writeFile(path.join(directory, '설명.txt'), 'Not an image');
  process.argv.push(path.join(directory, '컷 02.png'));
  const runtime = start({ appRoot, userData: path.join(profile, 'profile'), testMode: true });
  await runtime.ready;
  const window = runtime.getWindow();
  window.showInactive();
  assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
  assert.equal(window.webContents.getLastWebPreferences().nodeIntegration, false);
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.alt === "컷 02.png" && document.querySelector("[data-testid=viewer-image]").naturalWidth > 0');
  assert.equal(runtime.getLibrary().files.length, 3);
  console.log('PASS: opening one image loads the same folder and focuses the selected image');

  const original = await fs.readFile(path.join(directory, '컷 02.png'));
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(profile, '복사본.png') });
  await window.webContents.executeJavaScript('window.silviewDesktop.saveImage(document.querySelector("[data-testid=viewer-image]").src, "복사본.png")');
  assert.deepEqual(await fs.readFile(path.join(profile, '복사본.png')), original);
  console.log('PASS: native save copies the exact original image bytes');

  // Exercise the actual native file-dialog IPC behind the visible image-open button.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(directory, '컷 01.svg')] });
  await window.webContents.executeJavaScript('document.querySelector("button[aria-label=\\"이미지 열기\\"]").click()');
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.alt === "컷 01.svg" && document.querySelector("[data-testid=viewer-image]").naturalHeight === 1200');
  assert.equal(runtime.getLibrary().files.length, 3);
  console.log('PASS: in-app image-open loads the same folder without a folder picker');

  const fit = await window.webContents.executeJavaScript('(() => { const image = document.querySelector("[data-testid=viewer-image]").getBoundingClientRect(); const viewport = document.querySelector("[data-testid=viewer-viewport]").getBoundingClientRect(); return image.top >= viewport.top && image.bottom <= viewport.bottom && image.left >= viewport.left && image.right <= viewport.right; })()');
  assert.equal(fit, true);
  await snapshot(window, 'portrait-fit.png');
  console.log('PASS: portrait top and bottom fit on screen at 100%');

  await window.webContents.executeJavaScript('document.querySelector("button[title=확대]").click(); document.querySelector("button[title=확대]").click()');
  await waitFor(window, 'document.querySelector("[data-testid=viewer-zoom]")?.textContent === "140%"');
  await window.webContents.executeJavaScript('document.querySelector("[aria-label=\\"다음 이미지\\"]").click()');
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.alt === "컷 02.png"');
  assert.equal(await window.webContents.executeJavaScript('document.querySelector("[data-testid=viewer-zoom]").textContent'), '140%');
  await snapshot(window, 'zoom-next.png');
  console.log('PASS: next image retains 140% zoom');

  await window.webContents.executeJavaScript('Array.from(document.querySelectorAll("nav button")).find(button => button.textContent.trim() === "편집").click()');
  await waitFor(window, 'document.querySelector("canvas.lower-canvas")?.width > 0');
  await new Promise(resolve => setTimeout(resolve, 500));
  const editedPng = await window.webContents.executeJavaScript('document.querySelector("canvas.lower-canvas").toDataURL("image/png")');
  assert.equal(editedPng.startsWith('data:image/png;base64,'), true);
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(profile, '편집본.png') });
  await window.webContents.executeJavaScript(`window.silviewDesktop.saveImage(${JSON.stringify(editedPng)}, "편집본.png")`);
  assert.deepEqual(await fs.readFile(path.join(profile, '편집본.png')), Buffer.from(editedPng.split(',')[1], 'base64'));
  console.log('PASS: local image editor exports a PNG without a tainted canvas');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(directory, '컷 02.png') });
  await window.webContents.executeJavaScript(`window.silviewDesktop.saveImage(${JSON.stringify(editedPng)}, "편집본.png")`);
  assert.deepEqual(await fs.readFile(path.join(directory, '컷 02.png')), original);
  await waitFor(window, 'document.querySelector("[role=alert]")?.textContent.includes("원본을 보존")');
  console.log('PASS: edited export refuses to overwrite an original image');
  await window.webContents.executeJavaScript('Array.from(document.querySelectorAll("nav button")).find(button => button.textContent.trim() === "뷰어").click()');

  const second = spawn(process.execPath, [path.join(__dirname, 'second-instance.cjs'), path.join(directory, '컷 10.svg')], { env: { ...process.env, SILVIEW_TEST_PROFILE: path.join(profile, 'profile') }, windowsHide: true, stdio: 'pipe' });
  let secondError = '';
  second.stderr.on('data', data => { secondError += data; });
  const secondExit = await new Promise((resolve, reject) => { second.on('error', reject); second.on('exit', resolve); });
  assert.equal(secondExit, 0, secondError);
  await waitFor(window, 'document.querySelector("[data-testid=viewer-image]")?.alt === "컷 10.svg" && document.querySelector("[data-testid=viewer-image]").naturalWidth > 0');
  assert.equal(await window.webContents.executeJavaScript('document.querySelector("[data-testid=viewer-zoom]").textContent'), '140%');
  console.log('PASS: a second Explorer-style launch reuses the window and selects the new file');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(outputDirectory, 'result.json'), JSON.stringify({ passed: true, packagedResources: Boolean(process.env.SILVIEW_PACKAGED_ROOT), folderImageCount: runtime.getLibrary().files.length, tests: ['single-file-folder', 'native-save', 'in-app-open', 'portrait-fit', 'zoom-retained', 'editor-export', 'original-protection', 'second-instance'], errors, captureErrors }, null, 2));
  app.exit(0);
})().catch(async error => {
  console.error(error.stack || error);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'result.json'), JSON.stringify({ passed: false, error: error.stack || String(error), errors }, null, 2));
  app.exit(1);
});
