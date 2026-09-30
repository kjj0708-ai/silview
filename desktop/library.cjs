const fs = require('node:fs/promises');
const path = require('node:path');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'];
const extensionSet = new Set(IMAGE_EXTENSIONS.map(extension => `.${extension}`));

function isImagePath(filePath) {
  return typeof filePath === 'string' && extensionSet.has(path.extname(filePath).toLowerCase());
}

function commandLinePaths(argv, workingDirectory = process.cwd()) {
  return argv.filter(value => typeof value === 'string' && !value.startsWith('-') && isImagePath(value))
    .map(value => path.resolve(workingDirectory, value));
}

async function listFolderImages(directory) {
  const children = await fs.readdir(directory, { withFileTypes: true });
  const images = [];
  for (const child of children) {
    if (!child.isFile() || !isImagePath(child.name)) continue;
    const filePath = path.join(directory, child.name);
    try {
      const stat = await fs.stat(filePath);
      images.push({ path: filePath, name: child.name, size: stat.size });
    } catch { /* A file removed while reading does not prevent opening the folder. */ }
  }
  return images.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' }));
}

async function libraryForPaths(inputPaths) {
  const validPaths = [];
  for (const inputPath of inputPaths) {
    if (typeof inputPath !== 'string' || inputPath.includes('\0')) continue;
    const absolutePath = path.resolve(inputPath);
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory() || (stat.isFile() && isImagePath(absolutePath))) {
        validPaths.push({ path: absolutePath, directory: stat.isDirectory() });
      }
    } catch { /* Invalid command-line and dropped files are ignored. */ }
  }
  if (!validPaths.length) return null;
  const first = validPaths[0];
  const directory = first.directory ? first.path : path.dirname(first.path);
  const files = await listFolderImages(directory);
  return {
    files,
    folderName: path.basename(directory) || directory,
    selectedPath: first.directory ? files[0]?.path ?? null : first.path,
  };
}

function safeFileName(name) {
  const cleaned = String(name || 'image.png').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[ .]+$/, '');
  return cleaned && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? cleaned : `image_${cleaned || 'export.png'}`;
}

async function availableExportPath(directory, name) {
  const fileName = safeFileName(name);
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const candidate = path.join(directory, suffix ? `${stem} (${suffix})${extension}` : fileName);
    try { await fs.access(candidate); } catch { return candidate; }
  }
  throw new Error('저장할 파일 이름을 만들지 못했습니다.');
}

module.exports = { IMAGE_EXTENSIONS, isImagePath, commandLinePaths, listFolderImages, libraryForPaths, safeFileName, availableExportPath };
