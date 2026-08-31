import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

/**
 * Durable local store for images produced by an agent run.
 *
 * The workspace copy remains the user-facing Library item. This store is the
 * recovery copy: it is written atomically, carries a small JSON sidecar, and
 * can be reopened by a fresh process after a server restart. No remote URL is
 * retained as the image itself.
 */
export const GENERATED_IMAGE_MIME_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
});

const ID = /^[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export class GeneratedImageStoreError extends Error {
  constructor(message, code = 'TALOS_IMAGE_PERSIST_FAILED') {
    super(message);
    this.name = 'GeneratedImageStoreError';
    this.code = code;
  }
}

function asBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new GeneratedImageStoreError('image bytes are missing or invalid', 'TALOS_IMAGE_PERSIST_INVALID');
}

function validatePromptHash(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SHA256.test(value)) throw new GeneratedImageStoreError('image prompt hash is invalid', 'TALOS_IMAGE_PERSIST_INVALID');
  return value;
}

function validateSource(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 512 || /[\0\r\n]/u.test(value)) {
    throw new GeneratedImageStoreError('image source is invalid', 'TALOS_IMAGE_PERSIST_INVALID');
  }
  return value.trim();
}

function safeId({ bytes, source, promptHash }) {
  const digest = createHash('sha256');
  digest.update(bytes);
  digest.update('\0');
  digest.update(source);
  digest.update('\0');
  digest.update(promptHash ?? '');
  return digest.digest('hex');
}

function parseMetadata(value, id) {
  if (!value || typeof value !== 'object' || value.id !== id || typeof value.mimeType !== 'string' || !Object.hasOwn(GENERATED_IMAGE_MIME_TYPES, value.mimeType) || typeof value.source !== 'string' || (value.promptHash !== null && !SHA256.test(value.promptHash)) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !SHA256.test(value.sha256) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new GeneratedImageStoreError('stored image metadata is invalid', 'TALOS_IMAGE_PERSIST_CORRUPT');
  }
  return structuredClone(value);
}

export function createGeneratedImageStore({ rootDir, fsImpl = {}, now = () => new Date() } = {}) {
  if (typeof rootDir !== 'string' || !rootDir.trim() || !resolve(rootDir)) throw new GeneratedImageStoreError('generated image store root is invalid', 'TALOS_IMAGE_PERSIST_CONFIG_INVALID');
  const fs = { mkdir, readFile, rename, rm, stat, writeFile, ...fsImpl };
  const imageDir = resolve(rootDir);

  const paths = (id, mimeType) => {
    if (typeof id !== 'string' || !ID.test(id)) throw new GeneratedImageStoreError('stored image id is invalid', 'TALOS_IMAGE_PERSIST_INVALID');
    const extension = GENERATED_IMAGE_MIME_TYPES[mimeType];
    return {
      bytes: join(imageDir, `${id}.${extension}`),
      metadata: join(imageDir, `${id}.json`),
    };
  };

  async function persistGeneratedImage({ bytes: rawBytes, mimeType, source, promptHash = null } = {}) {
    const bytes = asBytes(rawBytes);
    if (bytes.byteLength === 0) throw new GeneratedImageStoreError('empty image cannot be saved', 'TALOS_IMAGE_PERSIST_INVALID');
    if (typeof mimeType !== 'string' || !Object.hasOwn(GENERATED_IMAGE_MIME_TYPES, mimeType)) throw new GeneratedImageStoreError('image format is not supported', 'TALOS_IMAGE_PERSIST_INVALID');
    const normalizedSource = validateSource(source);
    const normalizedPromptHash = validatePromptHash(promptHash);
    const id = safeId({ bytes, source: normalizedSource, promptHash: normalizedPromptHash });
    const destination = paths(id, mimeType);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const metadata = {
      schema: 'talos.generated-image.v1', id, mimeType, source: normalizedSource,
      promptHash: normalizedPromptHash, bytes: bytes.byteLength, sha256, createdAt: now().toISOString(),
    };
    await fs.mkdir(imageDir, { recursive: true });
    const temporaryBytes = `${destination.bytes}.tmp-${process.pid}-${randomUUID()}`;
    const temporaryMetadata = `${destination.metadata}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await fs.writeFile(temporaryBytes, bytes, { flag: 'wx' });
      await fs.writeFile(temporaryMetadata, `${JSON.stringify(metadata)}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaryBytes, destination.bytes);
      await fs.rename(temporaryMetadata, destination.metadata);
    } catch (error) {
      await fs.rm(temporaryBytes, { force: true }).catch(() => {});
      await fs.rm(temporaryMetadata, { force: true }).catch(() => {});
      // A deterministic id means a retry of the same response is safe: if a
      // complete pair is already present, reopen and return it instead of
      // pretending that the second write was a new image.
      if (error?.code === 'EEXIST') {
        const existing = await readGeneratedImage(id).catch(() => null);
        if (existing?.sha256 === sha256 && existing.mimeType === mimeType) return existing;
      }
      throw new GeneratedImageStoreError(`image could not be saved safely: ${error?.message ?? String(error)}`);
    }
    return { ...metadata, path: destination.bytes };
  }

  async function readGeneratedImage(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw new GeneratedImageStoreError('stored image id is invalid', 'TALOS_IMAGE_PERSIST_INVALID');
    let metadata;
    try { metadata = parseMetadata(JSON.parse(await fs.readFile(join(imageDir, `${id}.json`), 'utf8')), id); }
    catch (error) {
      if (error instanceof GeneratedImageStoreError) throw error;
      if (error?.code === 'ENOENT') throw new GeneratedImageStoreError('stored image was not found', 'TALOS_IMAGE_PERSIST_NOT_FOUND');
      throw new GeneratedImageStoreError(`stored image metadata could not be read: ${error?.message ?? String(error)}`, 'TALOS_IMAGE_PERSIST_CORRUPT');
    }
    const destination = paths(id, metadata.mimeType);
    let bytes;
    try { bytes = await fs.readFile(destination.bytes); }
    catch (error) { throw new GeneratedImageStoreError(`stored image bytes could not be read: ${error?.message ?? String(error)}`, 'TALOS_IMAGE_PERSIST_CORRUPT'); }
    if (bytes.byteLength !== metadata.bytes || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new GeneratedImageStoreError('stored image checksum does not match', 'TALOS_IMAGE_PERSIST_CORRUPT');
    return { ...metadata, bytes: Buffer.from(bytes), path: destination.bytes };
  }

  async function removeGeneratedImage(id) {
    const metadataPath = join(imageDir, `${id}.json`);
    let metadata;
    try { metadata = parseMetadata(JSON.parse(await fs.readFile(metadataPath, 'utf8')), id); }
    catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    await fs.rm(paths(id, metadata.mimeType).bytes, { force: true });
    await fs.rm(metadataPath, { force: true });
    return true;
  }

  return Object.freeze({ persistGeneratedImage, readGeneratedImage, removeGeneratedImage });
}

