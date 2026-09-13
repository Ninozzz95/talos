export class TalosApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'TalosApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function resolveApiUrl(pathname, baseUrl = globalThis.window?.__talosHarnessApiBase || '') {
  const path = String(pathname || '');
  if (path !== '/api/v1' && !path.startsWith('/api/v1/')) throw new TypeError('Il percorso deve restare sotto /api/v1/');
  return `${String(baseUrl || '').replace(/\/$/u, '')}${path}`;
}

export function createApiClient({ fetchImpl = globalThis.fetch, baseUrl = globalThis.window?.__talosHarnessApiBase || '' } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch non disponibile');
  async function request(method, pathname, { body, signal, headers = {} } = {}) {
    const options = { method, signal, headers: { accept: 'application/json', ...headers } };
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetchImpl(resolveApiUrl(pathname, baseUrl), options);
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? (payload.error || payload) : {};
      throw new TalosApiError(error.message || `Richiesta non riuscita (${response.status})`, {
        code: error.code || 'API_ERROR', status: response.status, details: error.details ?? null,
      });
    }
    return payload;
  }
  return Object.freeze({
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
    request,
  });
}
