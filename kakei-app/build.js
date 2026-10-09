const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const archivePath = path.join(process.cwd(), 'app.tar.gz');
const archive = fs.readFileSync(archivePath);
const archiveHash = crypto.createHash('sha1').update(archive).digest('hex');
console.log(`Kakei. archive: ${archive.length} bytes, sha1=${archiveHash}`);
if (!archive.length) throw new Error('Kakei. source archive is empty.');

const tar = zlib.gunzipSync(archive);
const output = path.join(process.cwd(), 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

function readString(buffer, start, end) {
  return buffer.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
}

let offset = 0;
let extracted = 0;
while (offset + 512 <= tar.length) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;

  const name = readString(header, 0, 100);
  const prefix = readString(header, 345, 500);
  const relative = prefix ? `${prefix}/${name}` : name;
  const type = String.fromCharCode(header[156] || 48);
  const sizeText = readString(header, 124, 136).trim().replace(/\0/g, '');
  const size = parseInt(sizeText || '0', 8);
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;
  const normalized = path.posix.normalize(relative).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error(`Unsafe archive path: ${relative}`);
  }
  const target = path.resolve(output, normalized);
  if (target !== output && !target.startsWith(`${output}${path.sep}`)) {
    throw new Error(`Unsafe output path: ${relative}`);
  }

  if (type === '5') {
    fs.mkdirSync(target, { recursive: true });
  } else if (type === '0' || type === '\0') {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, tar.subarray(dataStart, dataEnd));
    extracted += 1;
  }

  offset = dataStart + Math.ceil(size / 512) * 512;
}

if (extracted < 10) throw new Error(`Unexpected file count: ${extracted}`);
console.log(`Kakei. web app built successfully (${extracted} files).`);
