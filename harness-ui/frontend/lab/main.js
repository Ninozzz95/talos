import { createFrontendBootstrap } from '../src/main.js';

const parameters = new URLSearchParams(window.location.search);
const component = parameters.get('component') || 'bootstrap';
if (component === 'bootstrap') {
  createFrontendBootstrap({ documentObj: document, windowObj: window, mode: 'laboratory' });
  document.documentElement.dataset.visualReady = 'true';
} else if (component === 'VirtualList') {
  const { mountVirtualListLab } = await import('./routes/virtual-list.js');
  mountVirtualListLab(document.getElementById('app'));
} else if (component === 'FocusOverlay') {
  const { mountFocusOverlayLab } = await import('./routes/focus-overlay.js');
  mountFocusOverlayLab(document.getElementById('app'));
} else if (component === 'ApplicationLifecycle') {
  const { mountApplicationLifecycleLab } = await import('./routes/application-lifecycle.js');
  await mountApplicationLifecycleLab(document.getElementById('app'));
} else if (component === 'DesignSystem') {
  const { mountDesignSystemLab } = await import('./routes/design-system.js');
  mountDesignSystemLab(document.getElementById('app'));
} else {
  throw new Error(`Componente laboratorio non supportato: ${component}`);
}
