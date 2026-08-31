const REVISION = /^[a-f0-9]{40,64}$/iu;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const OFFICIAL_HOSTS = new Set(['huggingface.co']);

export class HfHubError extends Error {
  constructor(message, code = 'HF_HUB_ERROR') { super(message); this.name = 'HfHubError'; this.code = code; }
}

function invalid(message) { throw new HfHubError(message, 'HF_HUB_INVALID'); }
function ensureRepo(repo) { if (typeof repo !== 'string' || !REPO.test(repo)) invalid('repository id is invalid'); return repo; }
function ensureRevision(revision) { if (typeof revision !== 'string' || !REVISION.test(revision)) invalid('revision is invalid'); return revision; }
function ensurePath(path) { if (typeof path !== 'string' || path.trim() === '' || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) invalid('file path is invalid'); return path; }

function extractModelCardImages(readme, { repo, revision }) {
  const images = [];
  let cleaned = String(readme ?? '');
  const resolve = (raw) => {
    try {
      const parsed = new URL(raw, `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/`);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
      return parsed.toString();
    } catch { return null; }
  };
  cleaned = cleaned.replace(/<img\b[^>]*>/giu, (tag) => {
    const source = /\bsrc\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1];
    const alt = /\balt\s*=\s*["']([^"']*)["']/iu.exec(tag)?.[1] ?? '';
    const url = source ? resolve(source) : null;
    if (url) images.push({ alt, url });
    return '';
  });
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/gu, (_match, alt, source) => {
    const url = resolve(source);
    if (url) images.push({ alt, url });
    return '';
  });
  return { readme: cleaned.replace(/\n{3,}/gu, '\n\n').trim(), images };
}

function officialDownloadUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new HfHubError('Hugging Face redirect is invalid', 'HF_REDIRECT_INVALID'); }
  if (parsed.protocol !== 'https:' || ![...OFFICIAL_HOSTS].some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)) && !parsed.hostname.endsWith('.hf.co')) {
    throw new HfHubError('Hugging Face download host is not official', 'HF_REDIRECT_HOST_REJECTED');
  }
  return parsed;
}

export function createHfHubClient({ fetchImpl = fetch, token, baseUrl = 'https://huggingface.co' } = {}) {
  if (typeof fetchImpl !== 'function') throw new HfHubError('fetch implementation is required', 'HF_HUB_MISCONFIGURED');
  const root = new URL(baseUrl);
  if (root.protocol !== 'https:') throw new HfHubError('Hub base URL must use HTTPS', 'HF_HUB_MISCONFIGURED');
  const headers = () => ({ Accept: 'application/json', ...(typeof token === 'string' && token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}) });
  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, root), { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    if (response.ok || (options.redirect === 'manual' && response.status >= 300 && response.status < 400)) return response;
    if (response.status === 401 || response.status === 403) throw new HfHubError('Repository Hugging Face gated o non autorizzato', 'HF_REPOSITORY_GATED');
    if (response.status === 429) throw new HfHubError('Limite richieste Hugging Face raggiunto', 'HF_RATE_LIMITED');
    throw new HfHubError(`Hugging Face HTTP ${response.status}`, 'HF_HUB_UPSTREAM');
  }
  async function searchModels({ query = '', limit = 20, cursor = null, sort = 'downloads', direction = '-1', author = null, filters = [] } = {}) {
    const allowedSort = new Set(['downloads', 'likes', 'created', 'lastModified']);
    const allowedDirection = new Set(['-1', '1']);
    if (typeof query !== 'string' || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 50 || !allowedSort.has(sort) || !allowedDirection.has(String(direction)) || (author !== null && (typeof author !== 'string' || author.length > 100)) || !Array.isArray(filters) || filters.some((filter) => typeof filter !== 'string' || filter.length === 0 || filter.length > 80)) invalid('search parameters are invalid');
    const params = new URLSearchParams({ sort, direction: String(direction), limit: String(limit) });
    params.append('filter', 'gguf');
    for (const filter of filters) params.append('filter', filter);
    if (author?.trim()) params.set('author', author.trim());
    for (const field of ['sha', 'gguf', 'downloads', 'downloadsAllTime', 'likes', 'pipeline_tag', 'tags', 'siblings', 'cardData']) params.append('expand[]', field);
    if (query.trim()) params.set('search', query.trim());
    if (cursor) params.set('cursor', String(cursor));
    const response = await request(`/api/models?${params}`);
    const rows = await response.json();
    const payload = Array.isArray(rows) ? rows : (Array.isArray(rows?.items) ? rows.items : (Array.isArray(rows?.data) ? rows.data : []));
    const items = payload.map((row) => ({ repo: row.id, revision: /^[a-f0-9]{40,64}$/iu.test(row.sha || '') ? row.sha : null, downloads: Number.isFinite(row.downloads) ? row.downloads : null, likes: Number.isFinite(row.likes) ? row.likes : null, gated: row.gated === true, pipelineTag: row.pipeline_tag || null, license: row.cardData?.license || row.license || null, tags: Array.isArray(row.tags) ? row.tags.slice(0, 40) : [] }));
    const nextCursor = rows?.next ?? rows?.next_cursor ?? rows?.nextCursor ?? response.headers.get('x-next-cursor') ?? null;
    return { items, nextCursor: typeof nextCursor === 'string' && nextCursor ? nextCursor : null };
  }
  async function describeModel(repo, revision = 'main') {
    ensureRepo(repo); const rev = revision === 'main' ? revision : ensureRevision(revision);
    const [meta, readme] = await Promise.all([request(`/api/models/${repo}`).then((r) => r.json()), request(`/${repo}/raw/${encodeURIComponent(rev)}/README.md`, { headers: { Accept: 'text/plain' } }).then((r) => r.text()).catch((error) => error.code === 'HF_HUB_UPSTREAM' ? '' : Promise.reject(error))]);
    const revisionResolved = /^[a-f0-9]{40,64}$/iu.test(meta.sha || '') ? meta.sha : rev;
    const card = extractModelCardImages(readme, { repo, revision: revisionResolved });
    return { repo, revision: revisionResolved, gated: meta.gated === true, license: meta.cardData?.license || meta.license || null, readme: card.readme, images: card.images, downloads: meta.downloads ?? null, likes: meta.likes ?? null, pipelineTag: meta.pipeline_tag || null };
  }
  async function listGgufFiles(repo, revision) {
    ensureRepo(repo); ensureRevision(revision);
    const rows = await (await request(`/api/models/${repo}/tree/${encodeURIComponent(revision)}?recursive=true`)).json();
    return (Array.isArray(rows) ? rows : []).filter((row) => row.type === 'file' && typeof row.path === 'string' && row.path.toLowerCase().endsWith('.gguf')).map((row) => ({ path: row.path, sizeBytes: Number(row.size), sha256: row.lfs?.oid || row.oid || null, security: row.security?.status || null }));
  }
  async function pathsInfo(repo, revision, paths) {
    ensureRepo(repo); ensureRevision(revision); if (!Array.isArray(paths) || paths.length === 0 || paths.length > 200 || !paths.every((path) => typeof path === 'string')) invalid('paths are invalid');
    const response = await request(`/api/models/${repo}/paths-info/${encodeURIComponent(revision)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths, expand: true }) });
    const body = await response.json(); const rows = Array.isArray(body) ? body : body.files;
    if (!Array.isArray(rows)) throw new HfHubError('paths-info response is invalid', 'HF_HUB_RESPONSE_INVALID');
    return rows.map((row) => ({ path: row.path, sizeBytes: Number(row.size), sha256: row.lfs?.oid || row.oid || null, security: row.security?.status || null })).filter((row) => Number.isSafeInteger(row.sizeBytes) && row.sizeBytes > 0);
  }
  async function resolveDownload(repo, revision, path) {
    ensureRepo(repo); ensureRevision(revision); ensurePath(path);
    const response = await request(`/${repo}/resolve/${encodeURIComponent(revision)}/${path.split('/').map(encodeURIComponent).join('/')}`, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (!location) throw new HfHubError('Hugging Face did not return a signed download URL', 'HF_RESOLVE_INVALID');
    const url = officialDownloadUrl(location);
    return { url: url.toString(), expiresAt: url.searchParams.get('Expires') ? Number(url.searchParams.get('Expires')) * 1000 : null };
  }
  return Object.freeze({ searchModels, describeModel, listGgufFiles, pathsInfo, resolveDownload });
}
