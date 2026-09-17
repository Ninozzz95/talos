/** CORE-02/03: one JSON transport, no automatic retry or implicit consent. */
export interface RequestOptions { signal?: AbortSignal; }
export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
export interface PublicProblem {
  code: string; message: string; title?: string; explanation?: string; action?: string;
  doctorReference?: string; riprovabile?: boolean;
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly problem: PublicProblem;
  readonly doctorReference?: string;
  constructor(problem: PublicProblem, status: number) {
    super(problem.message); this.name = 'ApiError';
    this.code = problem.code; this.status = status; this.problem = Object.freeze({ ...problem });
    if (problem.doctorReference !== undefined) this.doctorReference = problem.doctorReference;
  }
}
export function isRequestCancelled(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (object(error) && error.name === 'AbortError');
}
export function publicProblem(value: unknown): PublicProblem {
  const source = object(value) ? value : {};
  const problem: PublicProblem = {
    code: typeof source.code === 'string' && source.code ? source.code : 'INTERNAL_ERROR',
    message: typeof source.message === 'string' && source.message ? source.message : 'Richiesta locale non riuscita',
  };
  for (const key of ['title', 'explanation', 'action', 'doctorReference'] as const)
    if (typeof source[key] === 'string') problem[key] = source[key];
  if (typeof source.riprovabile === 'boolean') problem.riprovabile = source.riprovabile;
  return problem;
}
export function createApiClient({
  fetchFn = globalThis.fetch,
  resolvePath = (path: string) => path,
  network = (_connected: boolean) => {},
}: { fetchFn?: typeof fetch; resolvePath?: (path: string) => string; network?: (connected: boolean) => void } = {}) {
  const notifyNetwork = (connected: boolean) => { try { network(connected); } catch { /* Observation never replaces a transport result. */ } };
  async function observedFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const response = await fetchFn(url, init);
      if (!init?.signal?.aborted) notifyNetwork(true);
      return response;
    } catch (error) {
      // Closing a view cancels a read; that is not evidence the server went offline.
      if (!isRequestCancelled(error, init?.signal || undefined)) notifyNetwork(false);
      throw error;
    }
  }
  async function request(method: ApiMethod, path: string, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    options.signal?.throwIfAborted();
    // Serialisation errors are local errors and must not change connection state.
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    const response = await observedFetch(resolvePath(path), {
      method, headers: { Accept: 'application/json', ...(encoded === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(method === 'GET' ? { cache: 'no-store' as const } : {}),
      ...(encoded === undefined ? {} : { body: encoded }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    let envelope: unknown;
    try { envelope = await response.json(); }
    catch (error) {
      options.signal?.throwIfAborted();
      if (isRequestCancelled(error)) throw error;
      throw new ApiError({ code: 'INTERNAL_ERROR', message: 'Risposta locale non valida' }, response.status);
    }
    options.signal?.throwIfAborted();
    if (!response.ok || !object(envelope) || envelope.ok !== true)
      throw new ApiError(publicProblem(object(envelope) ? envelope.error : null), response.status);
    return envelope.data;
  }
  return Object.freeze({ request, observedFetch,
    get: (path: string, options?: RequestOptions) => request('GET', path, undefined, options),
    post: (path: string, body?: unknown, options?: RequestOptions) => request('POST', path, body, options),
  });
}
