import { createBootstrapController } from './bootstrap.js';
import { createEffectScope } from './effect-scope.js';
import { createRouteController } from './route-controller.js';
import { createWorkspaceLayout } from './workspace-layout.js';
import { ACTIONS } from '../state/actions.js';
import { createStore } from '../state/create-store.js';
import { createInitialState } from '../state/initial-state.js';
import { assertStateInvariants } from '../state/invariants.js';
import { reducer } from '../state/reducer.js';
import { createAnnouncementRegion } from '../ui/announcement-region.js';
import { createFocusManager } from '../ui/focus-manager.js';
import { createOverlayManager } from '../ui/overlay-manager.js';
import { createShortcutManager } from '../ui/shortcut-manager.js';

export function createApplication({ root, services }) {
  if (!root || typeof root.replaceChildren !== 'function') throw new TypeError('radice applicazione non valida');
  if (!services?.api) throw new TypeError('servizi applicazione mancanti');
  const documentObj = services.document || root.ownerDocument || globalThis.document;
  const windowObj = documentObj?.defaultView || globalThis.window;
  const store = createStore({ initialState: createInitialState(), reducer, validate: assertStateInvariants });
  const scope = createEffectScope('application');
  const layout = createWorkspaceLayout({ root, documentObj, store });
  const announcements = createAnnouncementRegion({ document: documentObj, root });
  const focusManager = createFocusManager(documentObj);
  const overlayManager = createOverlayManager({
    root,
    focusManager,
    announce: (message) => announcements.announce(message),
    inertExempt: (element) => announcements.owns(element),
  });
  const shortcutManager = createShortcutManager({ target: documentObj, platform: services.platform || 'windows' });
  const bootstrap = createBootstrapController({ store, services, scope });
  const routes = createRouteController({ store, scope, windowObj, host: services.host });
  scope.add(() => shortcutManager.destroy());
  scope.add(() => overlayManager.destroy());
  scope.add(() => announcements.destroy());
  scope.add(() => layout.destroy());
  let started = false;
  let destroyed = false;

  return Object.freeze({
    store,
    routes,
    start() {
      if (destroyed) throw new Error('applicazione già chiusa');
      if (!started) {
        started = true;
        routes.start();
      }
      return bootstrap.start();
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      store.dispatch({ type: ACTIONS.APP_DESTROYED });
      scope.destroy();
      return true;
    },
  });
}
