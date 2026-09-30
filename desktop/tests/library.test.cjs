const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { libraryForPaths, commandLinePaths, availableExportPath, safeFileName } = require('../library.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'silview-library-'));
  t.after(async () => {
    if (path.basename(directory).startsWith('silview-library-') && path.dirname(directory) === os.tmpdir()) {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  await fs.mkdir(path.join(directory, '하위 폴더'));
  await Promise.all(['컷 01.png', '컷 02.JPG', '컷 10.png', '메모.txt'].map(name => fs.writeFile(path.join(directory, name), name)));
  await fs.writeFile(path.join(directory, '하위 폴더', '다른 이미지.png'), 'nested');
  return directory;
}

test('opening one Korean filename includes only images in its own folder in natural order', async t => {
  const directory = await fixture(t);
  const selected = path.join(directory, '컷 02.JPG');
  const result = await libraryForPaths([selected]);
  assert.deepEqual(result.files.map(file => file.name), ['컷 01.png', '컷 02.JPG', '컷 10.png']);
  assert.equal(result.selectedPath, selected);
  assert.equal(result.folderName, path.basename(directory));
});

test('Windows launch arguments retain spaces and Korean characters while ignoring flags and executables', () => {
  const workingDirectory = path.resolve('test images');
  assert.deepEqual(commandLinePaths(['실뷰.exe', '--some-flag', '사진 2.PNG', '설명.txt'], workingDirectory), [path.join(workingDirectory, '사진 2.PNG')]);
});

test('export naming preserves existing images and removes path separators', async t => {
  const directory = await fixture(t);
  const target = await availableExportPath(directory, '컷 01.png');
  assert.equal(path.basename(target), '컷 01 (1).png');
  assert.equal(await fs.readFile(path.join(directory, '컷 01.png'), 'utf8'), '컷 01.png');
  assert.equal(safeFileName('../../secret.png').includes('/'), false);
  assert.equal(safeFileName('CON.png'), 'image_CON.png');
});

test('missing and non-image launch files do not replace the active library', async t => {
  const directory = await fixture(t);
  assert.equal(await libraryForPaths([path.join(directory, '없는 사진.png'), path.join(directory, '메모.txt')]), null);
});
