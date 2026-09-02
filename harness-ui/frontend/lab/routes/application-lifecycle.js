import { createFrontendBootstrap } from '../../src/main.js';

export async function mountApplicationLifecycleLab(root) {
  const documentObj = root.ownerDocument;
  const windowObj = documentObj.defaultView;
  const mounted = createFrontendBootstrap({
    documentObj,
    windowObj,
    mode: 'phase-2-laboratory',
    services: {
      document: documentObj,
      api: { get: async () => ({ projects: [], sessions: [], capabilities: {} }) },
      host: {},
      persistence: { read: () => null, write: (_key, value) => value, remove() {} },
      clock: () => 1,
      platform: 'windows',
    },
  });
  await mounted.ready;
  documentObj.documentElement.dataset.visualReady = 'true';
  return mounted.destroy;
}

