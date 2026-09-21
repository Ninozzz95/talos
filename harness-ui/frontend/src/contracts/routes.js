export const TALOS_DESKTOP_ROUTES = Object.freeze(['chat', 'diff', 'terminal', 'browser', 'dashboard', 'automations', 'settings']);
const ROUTES = new Set(TALOS_DESKTOP_ROUTES);

export function normalizeRoute(value) {
  const candidate = String(value || '').replace(/^#\/?/u, '').replace(/^\//u, '').split(/[/?]/u)[0];
  return ROUTES.has(candidate) ? candidate : 'chat';
}

export function routeHref(value) {
  return `#/${normalizeRoute(value)}`;
}
