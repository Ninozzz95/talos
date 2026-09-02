import { normalizeRoute, routeHref } from '../contracts/routes.js';
import { ACTIONS } from '../state/actions.js';

export function createRouteController({ store, scope, windowObj = globalThis.window, host = {} }) {
  if (!store || !scope) throw new TypeError('dipendenze route mancanti');
  const current = () => normalizeRoute(windowObj?.location?.hash || 'chat');
  const publish = () => store.dispatch({ type: ACTIONS.ROUTE_CHANGED, payload: { route: current() } });
  let started = false;
  return Object.freeze({
    start() {
      if (started) return false;
      started = true;
      publish();
      if (windowObj?.addEventListener) scope.listen(windowObj, 'hashchange', publish);
      return true;
    },
    navigate(route) {
      const normalized = normalizeRoute(route);
      if (windowObj?.location) windowObj.location.hash = routeHref(normalized);
      host.changeView?.(normalized);
      store.dispatch({ type: ACTIONS.ROUTE_CHANGED, payload: { route: normalized } });
      return normalized;
    },
    current,
  });
}

