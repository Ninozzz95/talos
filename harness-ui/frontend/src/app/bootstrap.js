import { ACTIONS } from '../state/actions.js';

function normalizeBootstrapResponse(response) {
  const value = response?.data && typeof response.data === 'object' ? response.data : response;
  return value && typeof value === 'object' ? value : {};
}

export function createBootstrapController({ store, services, scope }) {
  if (!store || !services || !scope) throw new TypeError('dipendenze bootstrap mancanti');
  let pending = null;
  return Object.freeze({
    start() {
      if (pending) return pending;
      const generation = scope.nextGeneration();
      const controller = scope.abortController();
      pending = (async () => {
        try {
          const response = services.bootstrap?.load
            ? await services.bootstrap.load({ signal: controller.signal })
            : await services.api.get('/api/v1/bootstrap', { signal: controller.signal });
          if (!scope.isCurrent(generation)) return false;
          const payload = normalizeBootstrapResponse(response);
          store.dispatch({
            type: ACTIONS.BOOTSTRAP_SUCCEEDED,
            payload: {
              projects: payload.projects,
              sessions: payload.sessions,
              capabilities: payload.capabilities,
              activeProjectId: payload.activeProjectId,
              activeSessionId: payload.activeSessionId,
              observedAt: services.clock?.() ?? Date.now(),
            },
          });
          return true;
        } catch (error) {
          if (controller.signal.aborted || !scope.isCurrent(generation)) return false;
          store.dispatch({ type: ACTIONS.BOOTSTRAP_FAILED, payload: { error: error?.message || 'Avvio non riuscito' } });
          return false;
        }
      })();
      return pending;
    },
  });
}

