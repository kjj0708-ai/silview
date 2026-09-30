const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { version: APP_VERSION } = require('../package.json');
const { IMAGE_EXTENSIONS, commandLinePaths, libraryForPaths, safeFileName, availableExportPath } = require('./library.cjs');

const APP_URL = 'silview-app://app/index.html';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' data: blob: https://us-central1-quick-prompt-kjj.cloudfunctions.net; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon' };

protocol.registerSchemesAsPrivileged([
  { scheme: 'silview-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function start(options = {}) {
  const appRoot = options.appRoot || app.getAppPath();
  app.setName('실뷰');
  app.setAppUserModelId('com.choshg.silview');
  if (options.userData && !app.isPackaged) app.setPath('userData', options.userData);

  let mainWindow = null;
  let currentFiles = new Map();
  const originalPaths = new Set();
  let library = { revision: 0, version: APP_VERSION, files: [], selectedId: null, folderName: null };
  let openQueue = Promise.resolve();
  const pendingPaths = commandLinePaths(process.argv);

  function showWindow() {
    if (!mainWindow || options.testMode) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function reportError(error) {
    const message = error?.message || '이미지를 열지 못했습니다.';
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('silview:error', message);
    console.error(message);
  }

  function mediaFile(url) {
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'silview-app:' || parsed.hostname !== 'app' || !parsed.pathname.startsWith('/media/')) return null;
      return currentFiles.get(parsed.pathname.split('/')[2]) || null;
    } catch { return null; }
  }

  async function openPaths(inputPaths) {
    openQueue = openQueue.catch(() => {}).then(async () => {
      const nativeLibrary = await libraryForPaths(inputPaths);
      if (!nativeLibrary) return;
      const nextFiles = new Map();
      let selectedId = null;
      const files = nativeLibrary.files.map(file => {
        const id = randomUUID();
        nextFiles.set(id, file.path);
        originalPaths.add(path.resolve(file.path).toLowerCase());
        if (path.resolve(file.path).toLowerCase() === path.resolve(nativeLibrary.selectedPath || '').toLowerCase()) selectedId = id;
        return { id, name: file.name, size: file.size, url: `silview-app://app/media/${id}/${encodeURIComponent(file.name)}` };
      });
      currentFiles = nextFiles;
      library = { revision: library.revision + 1, version: APP_VERSION, files, selectedId: selectedId || files[0]?.id || null, folderName: nativeLibrary.folderName };
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('silview:library-changed', library);
      showWindow();
    });
    try { await openQueue; } catch (error) { reportError(error); }
  }

  async function openImages() {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '이미지 열기',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '이미지 파일', extensions: IMAGE_EXTENSIONS }],
    });
    if (!result.canceled) await openPaths(result.filePaths);
  }

  async function openFolder() {
    const result = await dialog.showOpenDialog(mainWindow, { title: '이미지 폴더 열기', properties: ['openDirectory'] });
    if (!result.canceled) await openPaths(result.filePaths);
  }

  async function writeImage(url, targetPath) {
    if (originalPaths.has(path.resolve(targetPath).toLowerCase())) {
      throw new Error('원본을 보존하려면 다른 파일 이름이나 폴더로 저장해 주세요.');
    }
    const originalPath = mediaFile(url);
    if (originalPath) {
      await fs.copyFile(originalPath, targetPath);
      return;
    }
    if (typeof url !== 'string') throw new Error('저장할 이미지가 없습니다.');
    const data = /^data:image\/(?:png|jpe?g|webp|gif|bmp|avif|x-icon);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(url);
    if (!data) throw new Error('저장할 수 없는 이미지 형식입니다.');
    await fs.writeFile(targetPath, Buffer.from(data[1], 'base64'));
  }

  async function saveImage(url, name) {
    if (!mediaFile(url) && !String(url).startsWith('data:image/')) throw new Error('현재 열린 이미지만 저장할 수 있습니다.');
    const fileName = safeFileName(name);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '이미지 저장', defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [{ name: '이미지 파일', extensions: [path.extname(fileName).slice(1) || 'png'] }],
    });
    if (!result.canceled && result.filePath) await writeImage(url, result.filePath);
  }

  async function saveAll(images) {
    if (!Array.isArray(images) || images.length > 10000) throw new Error('저장할 이미지 목록이 올바르지 않습니다.');
    const result = await dialog.showOpenDialog(mainWindow, { title: '이미지를 저장할 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return;
    for (const image of images) {
      const targetPath = await availableExportPath(result.filePaths[0], image.name);
      await writeImage(image.url, targetPath);
    }
  }

  async function printImage(url) {
    if (!mediaFile(url) && !/^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);base64,/.test(String(url))) {
      throw new Error('현재 열린 이미지만 인쇄할 수 있습니다.');
    }
    const escapedUrl = String(url).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const printWindow = new BrowserWindow({ show: false, parent: mainWindow, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>실뷰 인쇄</title><style>html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain}@media print{img{max-height:100vh}}</style></head><body><img src="${escapedUrl}" alt=""></body></html>`)}`);
      await printWindow.webContents.executeJavaScript('new Promise(resolve => { const image = document.querySelector("img"); if (image.complete) resolve(); else { image.onload = resolve; image.onerror = resolve; } })');
      await new Promise(resolve => printWindow.webContents.print({ silent: false, printBackground: true }, () => resolve()));
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  }

  function validateSender(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || !event.senderFrame.url.startsWith('silview-app://app/')) throw new Error('허용되지 않은 요청입니다.');
  }

  function handle(channel, callback) {
    ipcMain.handle(channel, async (event, ...args) => {
      validateSender(event);
      try { return await callback(...args); } catch (error) { reportError(error); return undefined; }
    });
  }

  function externalLink(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) void shell.openExternal(parsed.href);
    } catch { /* Unknown schemes are never launched. */ }
  }

  async function createWindow() {
    let saved = {};
    try { saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'window.json'), 'utf8')); } catch {}
    mainWindow = new BrowserWindow({
      width: Number.isFinite(saved.width) ? Math.max(800, saved.width) : 1280,
      height: Number.isFinite(saved.height) ? Math.max(600, saved.height) : 850,
      minWidth: 800, minHeight: 600, show: false, autoHideMenuBar: true,
      title: `실뷰 ${APP_VERSION}`, icon: path.join(appRoot, 'public', 'silview.ico'),
      backgroundColor: '#15151f',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: !options.testMode },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { externalLink(url); return { action: 'deny' }; });
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
    mainWindow.webContents.on('did-finish-load', () => mainWindow.webContents.send('silview:library-changed', library));
    mainWindow.on('close', () => {
      const bounds = mainWindow.getNormalBounds();
      void fs.mkdir(app.getPath('userData'), { recursive: true }).then(() => fs.writeFile(path.join(app.getPath('userData'), 'window.json'), JSON.stringify({ width: bounds.width, height: bounds.height }))).catch(() => {});
    });
    await mainWindow.loadURL(APP_URL);
    if (saved.maximized) mainWindow.maximize();
    showWindow();
    return mainWindow;
  }

  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) { app.quit(); return null; }
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const paths = commandLinePaths(argv, workingDirectory);
    if (mainWindow) { void openPaths(paths); showWindow(); } else pendingPaths.push(...paths);
  });
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) void openPaths([filePath]); else pendingPaths.push(filePath);
  });
  app.on('window-all-closed', () => app.quit());

  const ready = app.whenReady().then(async () => {
    const assetRoot = path.resolve(appRoot, 'dist-desktop');
    protocol.handle('silview-app', async request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
        if (url.pathname.startsWith('/media/')) {
          const filePath = mediaFile(request.url);
          if (!filePath) return new Response('Not found', { status: 404 });
          const response = await net.fetch(pathToFileURL(filePath).href);
          return new Response(response.body, { status: response.status, headers: { 'Content-Type': IMAGE_TYPES[path.extname(filePath).slice(1).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
        }
        const assetPath = path.resolve(assetRoot, `.${decodeURIComponent(url.pathname)}`);
        const relative = path.relative(assetRoot, assetPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(assetPath).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CSP);
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    handle('silview:library', () => library);
    handle('silview:open-paths', paths => {
      if (!Array.isArray(paths) || paths.length > 1000 || paths.some(value => typeof value !== 'string')) throw new Error('파일 목록이 올바르지 않습니다.');
      return openPaths(paths);
    });
    handle('silview:open-images', openImages);
    handle('silview:open-folder', openFolder);
    handle('silview:save-image', saveImage);
    handle('silview:save-all', saveAll);
    handle('silview:print-image', printImage);
    handle('silview:default-apps', () => shell.openExternal('ms-settings:defaultapps'));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '파일', submenu: [
        { label: '이미지 열기', accelerator: 'Ctrl+O', click: () => void openImages().catch(reportError) },
        { label: '폴더 열기', accelerator: 'Ctrl+Shift+O', click: () => void openFolder().catch(reportError) },
        { type: 'separator' }, { label: '기본 이미지 앱 설정', click: () => void shell.openExternal('ms-settings:defaultapps') },
        { type: 'separator' }, { label: '종료', role: 'quit' },
      ] },
      { label: '보기', submenu: [{ role: 'togglefullscreen', label: '전체 화면' }, { role: 'minimize', label: '최소화' }] },
    ]));
    await createWindow();
    if (pendingPaths.length) await openPaths(pendingPaths.splice(0));
  }).catch(error => { reportError(error); app.quit(); });

  return { ready, openPaths, getWindow: () => mainWindow, getLibrary: () => library };
}

if (require.main === module) start();
module.exports = { start };
