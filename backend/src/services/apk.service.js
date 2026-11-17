'use strict';
// Reads an Android APK's package name and version from its binary
// AndroidManifest.xml. Same code as the CAS School Server (school-server/server.js).
const zlib = require('zlib');

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip file');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = { method, csize, local };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const lnameLen = buf.readUInt16LE(e.local + 26);
      const lextraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnameLen + lextraLen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip compression in ${name}`);
    },
  };
}

// ── APK version (binary AndroidManifest.xml) ─────────────────────────────────

function apkVersion(buf) {
  const zip = readZip(buf);
  const xml = zip.read('AndroidManifest.xml');
  if (!xml) throw new Error('This file is not an Android app (no AndroidManifest.xml).');
  let strings = [], resIds = [];
  let p = 8; // after the XML chunk header
  while (p < xml.length) {
    const type = xml.readUInt16LE(p), headerSize = xml.readUInt16LE(p + 2), size = xml.readUInt32LE(p + 4);
    if (type === 0x0001) { // string pool
      const count = xml.readUInt32LE(p + 8), flags = xml.readUInt32LE(p + 16), start = xml.readUInt32LE(p + 20);
      const utf8 = (flags & 0x100) !== 0;
      for (let i = 0; i < count; i++) {
        let o = p + start + xml.readUInt32LE(p + headerSize + i * 4);
        if (utf8) {
          o += (xml[o] & 0x80) ? 2 : 1;                 // utf16 length
          let len = xml[o]; o += 1;
          if (len & 0x80) { len = ((len & 0x7f) << 8) | xml[o]; o += 1; }
          strings.push(xml.toString('utf8', o, o + len));
        } else {
          let len = xml.readUInt16LE(o); o += 2;
          if (len & 0x8000) { len = ((len & 0x7fff) << 16) | xml.readUInt16LE(o); o += 2; }
          strings.push(xml.toString('utf16le', o, o + len * 2));
        }
      }
    } else if (type === 0x0180) { // resource ids for attribute names
      for (let o = p + 8; o < p + size; o += 4) resIds.push(xml.readUInt32LE(o));
    } else if (type === 0x0102) { // start element
      const name = strings[xml.readUInt32LE(p + 20)];
      if (name === 'manifest') {
        const attrStart = xml.readUInt16LE(p + 24), attrSize = xml.readUInt16LE(p + 26), attrCount = xml.readUInt16LE(p + 28);
        const out = {};
        for (let i = 0; i < attrCount; i++) {
          const a = p + 16 + attrStart + i * attrSize;
          const nameIdx = xml.readUInt32LE(a + 4);
          const raw = xml.readInt32LE(a + 8);
          const dataType = xml[a + 15];
          const data = xml.readUInt32LE(a + 16);
          const attrName = strings[nameIdx] || '';
          const resId = resIds[nameIdx];
          const value = dataType === 0x03 ? strings[data] : raw >= 0 ? strings[raw] : data;
          if (attrName === 'versionCode' || resId === 0x0101021b) out.versionCode = Number(dataType === 0x10 ? data : value);
          if (attrName === 'versionName' || resId === 0x0101021c) out.versionName = String(value);
          if (attrName === 'package') out.package = String(value);
        }
        return out;
      }
    }
    p += size || 8;
  }
  throw new Error('Could not read the app version.');
}

module.exports = { readZip, apkVersion };
