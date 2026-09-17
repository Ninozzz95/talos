/** L02/F04: one owner per state domain, with a temporary legacy facade.
 * The facade forwards to the domains; it is not a second copy of server state.
 * Nested Maps/DOM references retain identity during the L02-L20 migration.
 */
export type StateDomain = 'ui' | 'preferences' | 'workspace' | 'session' | 'resources';
export const STATE_OWNERS: Readonly<Record<string, StateDomain>> = Object.freeze({
  view: 'ui', mode: 'ui', settingsSection: 'ui', sessionSelection: 'ui',
  alberoFileTarget: 'ui', reviewFileCorrente: 'ui', imageDraftEpoch: 'ui', imageUploads: 'ui',
  permissions: 'preferences', autonomiaScelta: 'preferences', permessiPerAttrezzo: 'preferences',
  model: 'preferences', showReasoning: 'preferences', effort: 'preferences',
  fallbackProviders: 'preferences', modelloPlanner: 'preferences',
  environment: 'workspace', pendingCustomSession: 'workspace',
  session: 'session', running: 'session', realSession: 'session', queueMode: 'session', sessioneTarget: 'session',
  connessione: 'resources', board: 'resources', modelLab: 'resources',
  catalogoModelli: 'resources', notifiche: 'resources', terminal: 'resources',
});
export function createApplicationState<T extends object>(seed: T, owners = STATE_OWNERS) {
  const domains: Record<StateDomain, Record<string, unknown>> = {
    ui: Object.create(null), preferences: Object.create(null), workspace: Object.create(null),
    session: Object.create(null), resources: Object.create(null),
  };
  const listeners = new Map<StateDomain, Set<(snapshot: Readonly<Record<string, unknown>>) => void>>();
  let disposed = false;
  const facade = Object.assign({}, seed);
  const snapshot = (domain: StateDomain) => Object.freeze({ ...domains[domain] });
  const notify = (domain: StateDomain) => {
    if (disposed) return;
    const list = listeners.get(domain);
    if (!list?.size) return;
    const value = snapshot(domain);
    for (const listener of [...list]) listener(value);
  };
  for (const key of new Set([...Object.keys(owners), ...Object.keys(seed)])) {
    const domain = Object.hasOwn(owners, key) ? owners[key] : undefined;
    if (!domain) throw new TypeError(`State field has no owner: ${key}`);
    domains[domain][key] = Reflect.get(seed, key);
    Object.defineProperty(facade, key, {
      configurable: false, enumerable: true,
      get: () => domains[domain][key],
      set(value: unknown) {
        if (disposed) return;
        if (Object.is(domains[domain][key], value)) return;
        domains[domain][key] = value;
        notify(domain);
      },
    });
  }
  Object.preventExtensions(facade);
  return Object.freeze({
    legacy: facade,
    snapshot,
    /** Explicit invalidation for nested mutations until their feature is migrated. */
    notify,
    subscribe(domain: StateDomain, listener: (snapshot: Readonly<Record<string, unknown>>) => void) {
      if (disposed) return () => {};
      let list = listeners.get(domain);
      if (!list) { list = new Set(); listeners.set(domain, list); }
      list.add(listener);
      return () => { list?.delete(listener); };
    },
    dispose() { disposed = true; listeners.clear(); },
  });
}
