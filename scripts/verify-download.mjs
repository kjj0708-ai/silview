import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const installer = path.join(root, 'release', `실뷰-Setup-${version}.exe`);
const localHash = createHash('sha256').update(readFileSync(installer)).digest('hex');
const expectedSize = statSync(installer).size;
const url = `https://dl.choshg.com/silview/silview-setup-${version}.exe`;
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
if (response.headers.get('content-type')?.includes('text/html')) throw new Error('Download URL returned HTML');
if (!response.headers.get('content-disposition')?.includes(`silview-setup-${version}.exe`)) throw new Error('Download filename does not match this release');
const remoteHash = createHash('sha256');
let size = 0;
for await (const chunk of response.body) { remoteHash.update(chunk); size += chunk.length; }
const checksum = remoteHash.digest('hex');
if (size !== expectedSize || checksum !== localHash) throw new Error('Public installer differs from the tested local installer');
console.log(JSON.stringify({ url, status: response.status, bytes: size, sha256: checksum.toUpperCase(), matchesLocalInstaller: true }, null, 2));
