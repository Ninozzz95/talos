import { selectRuntimePhase } from '../state/selectors.js';

const PHASE_LABELS = Object.freeze({
  booting: 'Preparazione in corso',
  'ready-empty': 'Pronto per una nuova sessione',
  'ready-active': 'Sessione pronta',
  degraded: 'Serve un controllo prima di iniziare',
  offline: 'Applicazione chiusa',
});

export function createWorkspaceLayout({ root, documentObj, store }) {
  if (!root || !documentObj || !store) throw new TypeError('dipendenze layout mancanti');
  const surface = documentObj.createElement('section');
  surface.className = 'application-surface';
  surface.dataset.talosFrontend = 'phase-2';
  const eyebrow = documentObj.createElement('p');
  eyebrow.className = 'foundation-eyebrow';
  eyebrow.textContent = 'Laboratorio UI · non produzione';
  const heading = documentObj.createElement('h1');
  heading.textContent = 'Lifecycle applicativo';
  const status = documentObj.createElement('p');
  status.className = 'runtime-phase';
  surface.append(eyebrow, heading, status);
  root.replaceChildren(surface);
  const unsubscribe = store.subscribe(selectRuntimePhase, (phase) => {
    status.dataset.runtimePhase = phase;
    status.textContent = PHASE_LABELS[phase] || 'Stato non disponibile';
  });
  let destroyed = false;
  return Object.freeze({
    element: surface,
    update() {},
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      unsubscribe();
      surface.remove();
      return true;
    },
  });
}

