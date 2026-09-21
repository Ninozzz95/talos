import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ALLOWED_SUFFIXES = Object.freeze(['huggingface.co', 'hf.co']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

export class HfImageProxyError extends Error {
  constructor(message, code) { super(message); this.name = 'HfImageProxyError'; this.code = code; }
}

function fail(message, code) { throw new HfImageProxyError(message, code); }

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  return ALLOWED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function privateAddress(address) {
  const normalized = String(address).toLowerCase().replace(/^\[|\]$/gu, '');
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0)) || (a === 198 && b >= 18 && b <= 19)
      || a >= 224;
  }
  if (isIP(normalized) === 6) {
    const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:')
      || (first >= 0xfc00 && first <= 0xfdff) || normalized.startsWith('::ffff:') && privateAddress(normalized.slice(7));
  }
  return true;
}

async function validateRemoteUrl(value, { redirect = false, lookupFn }) {
  let url;
  try { url = value instanceof URL ? new URL(value) : new URL(String(value)); } catch { fail('Hugging Face image URL is invalid', redirect ? 'HF_IMAGE_REDIRECT_REJECTED' : 'HF_IMAGE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || !isAllowedHost(url.hostname)) {
    fail('Hugging Face image host is not allowed', redirect ? 'HF_IMAGE_REDIRECT_REJECTED' : 'HF_IMAGE_HOST_REJECTED');
  }
  let records;
  try { records = await lookupFn(url.hostname, { all: true, verbatim: true }); } catch { fail('Hugging Face image host could not be resolved', 'HF_IMAGE_DNS_FAILED'); }
  const addresses = Array.isArray(records) ? records : [records];
  if (!addresses.length || addresses.some((record) => privateAddress(record?.address ?? record))) fail('Hugging Face image host resolves to a private address', redirect ? 'HF_IMAGE_REDIRECT_REJECTED' : 'HF_IMAGE_PRIVATE_ADDRESS');
  return url;
}

function combinedSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  timer.unref?.();
  const onAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener?.('abort', onAbort, { once: true });
  return { signal: typeof AbortSignal.any === 'function' && externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal, close: () => { clearTimeout(timer); externalSignal?.removeEventListener?.('abort', onAbort); } };
}

async function readLimited(response, maxBytes) {
  const advertised = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(advertised) && advertised > maxBytes) fail('Hugging Face image is too large', 'HF_IMAGE_TOO_LARGE');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (total > maxBytes) { await reader.cancel?.(); fail('Hugging Face image is too large', 'HF_IMAGE_TOO_LARGE'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) fail('Hugging Face image is too large', 'HF_IMAGE_TOO_LARGE');
  return bytes;
}

export async function fetchAllowedHfImage(value, { fetchImpl = fetch, lookupFn = lookup, maxBytes = 4 * 1024 * 1024, timeoutMs = 15_000, signal = null } = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) fail('Hugging Face image proxy configuration is invalid', 'HF_IMAGE_CONFIG_INVALID');
  let url = await validateRemoteUrl(value, { lookupFn, redirect: false });
  const lifecycle = combinedSignal(timeoutMs, signal);
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      let response;
      try { response = await fetchImpl(url, { redirect: 'manual', signal: lifecycle.signal, headers: { Accept: 'image/*' } }); }
      catch (error) { if (lifecycle.signal.aborted) fail('Hugging Face image request timed out or was cancelled', 'HF_IMAGE_ABORTED'); fail('Hugging Face image could not be downloaded', 'HF_IMAGE_UNREACHABLE'); }
      if (response.status >= 300 && response.status < 400) {
        if (redirects === 3) fail('Hugging Face image redirected too many times', 'HF_IMAGE_REDIRECT_REJECTED');
        const location = response.headers?.get?.('location');
        if (!location) fail('Hugging Face image redirect is missing its destination', 'HF_IMAGE_REDIRECT_REJECTED');
        let next;
        try { next = new URL(location, url); } catch { fail('Hugging Face image redirect is invalid', 'HF_IMAGE_REDIRECT_REJECTED'); }
        url = await validateRemoteUrl(next, { lookupFn, redirect: true });
        continue;
      }
      if (!response.ok) fail('Hugging Face image service returned an error', 'HF_IMAGE_UPSTREAM');
      const mimeType = String(response.headers?.get?.('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      if (!ALLOWED_MIME.has(mimeType)) fail('Hugging Face response is not a safe image format', 'HF_IMAGE_MIME_REJECTED');
      const bytes = await readLimited(response, maxBytes);
      return Object.freeze({ bytes, mimeType, sourceUrl: url.toString() });
    }
  } finally { lifecycle.close(); }
  fail('Hugging Face image redirect is invalid', 'HF_IMAGE_REDIRECT_REJECTED');
}
