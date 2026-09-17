/** K01: the actual local envelope. No automatic retry of mutations. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type FetchPort = (url: string, init: RequestInit) => Promise<Response>;
export interface ProblemDetails {
  readonly code?: unknown; readonly message?: unknown; readonly title?: unknown;
  readonly explanation?: unknown; readonly action?: unknown; readonly doctorReference?: unknown;
  readonly riprovabile?: unknown; readonly details?: unknown;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
export class TalosApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly problem: Readonly<ProblemDetails> | null;
  constructor(message: string, options: { code?: string; status?: number; problem?: ProblemDetails | null } = {}) {
    super(message);
    this.name = 'TalosApiError'; this.code = options.code || 'INTERNAL_ERROR';
    this.status = options.status || 0;
    this.problem = options.problem ? Object.freeze({ ...options.problem }) : null;
    this.details = options.problem?.details ?? null;
  }
}
export interface RequestOptions<T> {
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  decode?: (value: unknown) => T;
}
export function createApiClient({ fetchImpl, endpoint, signal }: {
  fetchImpl: FetchPort; endpoint: (pathname: string) => string; signal?: AbortSignal;
}) {
  function request<T>(method: HttpMethod, pathname: string, options: RequestOptions<T> & { decode: (value: unknown) => T }): Promise<T | null>;
  function request(method: HttpMethod, pathname: string, options?: RequestOptions<unknown>): Promise<unknown>;
  async function request(method: HttpMethod, pathname: string, options: RequestOptions<unknown> = {}): Promise<unknown> {
    if (pathname !== '/api/v1' && !pathname.startsWith('/api/v1/')) throw new TypeError('Il percorso deve restare sotto /api/v1/');
    const normalized = new URL(pathname, 'https://talos.invalid');
    if (normalized.pathname !== '/api/v1' && !normalized.pathname.startsWith('/api/v1/')) throw new TypeError('Il percorso deve restare sotto /api/v1/');
    const requestSignal = options.signal && signal && options.signal !== signal
      ? AbortSignal.any([options.signal, signal]) : options.signal || signal;
    requestSignal?.throwIfAborted();
    const init: RequestInit = { method, headers: {
      Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers,
    } };
    if (method === 'GET') init.cache = 'no-store';
    if (requestSignal) init.signal = requestSignal;
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const response = await fetchImpl(endpoint(pathname), init);
    if (response.status === 204 && response.ok) return null;
    let envelope: unknown;
    try { envelope = await response.json(); }
    catch { requestSignal?.throwIfAborted(); throw new TalosApiError('Risposta locale non valida', { status: response.status }); }
    requestSignal?.throwIfAborted();
    if (!record(envelope)) throw new TalosApiError('Risposta locale non valida', { status: response.status });
    if (!response.ok || envelope.ok !== true) {
      const problem = record(envelope.error) ? envelope.error : null;
      throw new TalosApiError(text(problem?.message) || 'Richiesta locale non riuscita', {
        code: text(problem?.code) || 'INTERNAL_ERROR', status: response.status, problem,
      });
    }
    if (!Object.hasOwn(envelope, 'data')) throw new TalosApiError('Risposta locale non valida', { status: response.status });
    return options.decode ? options.decode(envelope.data) : envelope.data;
  }
  function get<T>(path: string, options: RequestOptions<T> & { decode: (value: unknown) => T }): Promise<T | null>;
  function get(path: string, options?: RequestOptions<unknown>): Promise<unknown>;
  function get(path: string, options?: RequestOptions<unknown>): Promise<unknown> { return request('GET', path, options); }
  return Object.freeze({ request, get,
    post: (path: string, body: unknown, options?: RequestOptions<unknown>) => request('POST', path, { ...options, body }),
    patch: (path: string, body: unknown, options?: RequestOptions<unknown>) => request('PATCH', path, { ...options, body }),
    delete: (path: string, options?: RequestOptions<unknown>) => request('DELETE', path, options),
  });
}
