import { createApplication } from './app/application.js';
import { createApiClient } from './contracts/api-client.js';
import { createHostBridge } from './contracts/host-bridge.js';
import { createPersistence } from './contracts/persistence.js';

function mountPhaseOneFoundation({ documentObj, root, mode }) {
  const surface = documentObj.createElement('section');
  surface.className = 'foundation-surface';
  surface.dataset.talosFrontend = 'phase-1';
  const eyebrow = documentObj.createElement('p');
  eyebrow.className = 'foundation-eyebrow';
  eyebrow.textContent = mode === 'laboratory' ? 'Laboratorio UI · non produzione' : 'TALOS Desktop';
  const heading = documentObj.createElement('h1');
  heading.textContent = 'Fondazioni modulari pronte';
  const copy = documentObj.createElement('p');
  copy.className = 'foundation-copy';
  copy.textContent = 'Build parallela, contratti di trasporto e rollback verificabile. La superficie owner non è stata sostituita.';
  const list = documentObj.createElement('ul');
  list.className = 'foundation-contracts';
  for (const label of ['REST controllato', 'Session stream normalizzato', 'Terminale binario 0/1', 'Asset con integrità SHA-256']) {
    const item = documentObj.createElement('li');
    item.textContent = label;
    list.append(item);
  }
  surface.append(eyebrow, heading, copy, list);
  root.replaceChildren(surface);
  return surface;
}

export function createFrontendBootstrap({ documentObj = globalThis.document, windowObj = globalThis.window, mode = 'strangler', services } = {}) {
  if (!documentObj || !windowObj) throw new TypeError('Documento e finestra sono obbligatori');
  const root = windowObj.__talosHarnessRoot || documentObj.getElementById('app');
  if (!root || typeof root.replaceChildren !== 'function') throw new Error('Radice TALOS non disponibile');

  const previousRuntime = windowObj.__talosHarnessUiRuntime;
  const previousDestroy = windowObj.__talosHarnessDestroy;
  const bridge = services?.host || createHostBridge({ windowObj });
  const legacyFoundation = mode === 'laboratory' && !services;
  const surface = legacyFoundation ? mountPhaseOneFoundation({ documentObj, root, mode }) : null;
  const application = legacyFoundation ? null : createApplication({
    root,
    services: services || {
      document: documentObj,
      api: createApiClient({ fetchImpl: windowObj.fetch?.bind(windowObj), baseUrl: windowObj.__talosHarnessApiBase || '' }),
      host: bridge,
      persistence: createPersistence({ storage: windowObj.localStorage }),
      clock: () => Date.now(),
      platform: 'windows',
    },
  });
  const ready = application ? application.start() : Promise.resolve(true);
  const runtime = Object.freeze({ schema: 'talos.desktop.frontend.v1', phase: application ? 2 : 1, mode, ready, bridge });
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return false;
    destroyed = true;
    application?.destroy();
    surface?.remove();
    if (previousRuntime === undefined) delete windowObj.__talosHarnessUiRuntime;
    else windowObj.__talosHarnessUiRuntime = previousRuntime;
    if (previousDestroy === undefined) delete windowObj.__talosHarnessDestroy;
    else windowObj.__talosHarnessDestroy = previousDestroy;
    return true;
  };
  windowObj.__talosHarnessUiRuntime = runtime;
  windowObj.__talosHarnessDestroy = destroy;
  return Object.freeze({ root, runtime, ready, application, destroy });
}

if (globalThis.document && globalThis.window && !globalThis.document.documentElement.hasAttribute('data-talos-manual-bootstrap')) {
  createFrontendBootstrap();
}
