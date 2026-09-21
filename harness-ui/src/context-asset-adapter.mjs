import { createHash } from 'node:crypto';

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/octet-stream']);
const fail = (message, code = 'CTX_ASSET_INVALID') => { throw Object.assign(new Error(message), { code }); };

function identifiers(sessionId, id) {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256
    || typeof id !== 'string' || !id.trim() || id.length > 256 || /[\u0000-\u001f]/u.test(sessionId)
    || /[\u0000-\u001f/\\:]/u.test(id) || id === '.' || id === '..') fail('Invalid session or asset identifier');
}

function validateBytes(bytes, mimeType, expectedHash) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES) fail('Asset byte count is invalid', 'CTX_ASSET_LIMIT');
  if (!MIMES.has(mimeType)) fail('Asset MIME is unsupported', 'CTX_ASSET_MIME');
  if (mimeType.startsWith('image/') && bytes.length > IMAGE_MAX_BYTES) fail('Image exceeds the 5 MiB limit', 'CTX_ASSET_LIMIT');
  const copy = Buffer.from(bytes);
  const signature = mimeType === 'image/png' ? copy.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'image/jpeg' ? copy[0] === 255 && copy[1] === 216 && copy[2] === 255
      : mimeType === 'image/webp' ? copy.toString('ascii', 0, 4) === 'RIFF' && copy.toString('ascii', 8, 12) === 'WEBP'
        : mimeType === 'application/pdf' ? copy.toString('ascii', 0, 5) === '%PDF-' : true;
  if (!signature) fail('Asset bytes do not match declared MIME', 'CTX_ASSET_MIME');
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    try { new TextDecoder('utf-8', { fatal: true }).decode(copy); } catch { fail('Text asset is not valid UTF-8', 'CTX_ASSET_MIME'); }
  }
  const sha256 = createHash('sha256').update(copy).digest('hex');
  if (expectedHash !== undefined && (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedHash) || sha256 !== expectedHash.toLowerCase())) fail('Asset hash does not match its original bytes', 'CTX_ASSET_HASH');
  return { bytes: Uint8Array.from(copy), sha256, mimeType, byteLength: copy.length };
}

export function createContextAssetAdapter({ store, readAsset } = {}) {
  if (!store || typeof store.putBlob !== 'function' || typeof store.readBlob !== 'function' || (readAsset !== undefined && typeof readAsset !== 'function')) fail('Asset store dependencies are invalid');

  async function archiveContextAsset({ sessionId, id, mimeType, bytes, sha256 } = {}) {
    identifiers(sessionId, id);
    if (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(sha256))) fail('Asset reference hash is invalid', 'CTX_ASSET_HASH');
    if (bytes === undefined) {
      if (!readAsset) fail('Original asset is unavailable', 'CTX_ASSET_MISSING');
      const source = await readAsset({ sessionId, id });
      if (!source) fail('Original asset is unavailable', 'CTX_ASSET_MISSING');
      if (source.sessionId !== sessionId || source.id !== id) fail('Asset belongs to another session', 'CTX_ASSET_OWNERSHIP');
      if (source.mimeType !== mimeType) fail('Original MIME does not match asset reference', 'CTX_ASSET_MIME');
      bytes = source.bytes;
      const verified = validateBytes(bytes, mimeType, source.sha256);
      if (sha256 !== undefined && verified.sha256 !== sha256.toLowerCase()) fail('Reference hash does not match original asset', 'CTX_ASSET_HASH');
      sha256 = verified.sha256;
    }
    const checked = validateBytes(bytes, mimeType, sha256);
    const manifest = await store.putBlob({ sessionId, id, bytes: checked.bytes, mimeType, sha256: checked.sha256 });
    if (!manifest || manifest.id !== id || manifest.sha256 !== checked.sha256 || manifest.mimeType !== mimeType || manifest.byteLength !== checked.byteLength) fail('Stored asset manifest differs from original', 'CTX_ASSET_HASH');
    return structuredClone(manifest);
  }

  async function resolveContextAsset({ sessionId, id, modelCapabilities } = {}) {
    identifiers(sessionId, id);
    const source = await store.readBlob({ sessionId, id });
    if (!source) fail('Archived asset is unavailable', 'CTX_ASSET_MISSING');
    if (source.id !== id || (source.sessionId !== undefined && source.sessionId !== sessionId)) fail('Asset belongs to another session', 'CTX_ASSET_OWNERSHIP');
    if (typeof source.sha256 !== 'string') fail('Archived asset hash is missing', 'CTX_ASSET_HASH');
    const checked = validateBytes(source.bytes, source.mimeType, source.sha256);
    const capabilities = modelCapabilities ?? {};
    const supported = capabilities.supportedMimeTypes;
    if ((checked.mimeType.startsWith('image/') && capabilities.vision !== true)
      || (!checked.mimeType.startsWith('image/') && !Array.isArray(supported))
      || (supported !== undefined && (!Array.isArray(supported) || !supported.includes(checked.mimeType)))
      || (capabilities.maxAssetBytes !== undefined && (!Number.isSafeInteger(capabilities.maxAssetBytes) || capabilities.maxAssetBytes < checked.byteLength))) fail('Selected model cannot receive this asset type or size', 'CTX_ASSET_CAPABILITY');
    return { id, ...checked };
  }

  return Object.freeze({ archiveContextAsset, resolveContextAsset });
}
