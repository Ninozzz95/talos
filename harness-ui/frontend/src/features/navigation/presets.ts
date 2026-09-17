import type { Preset } from '../../services/workspace-preferences.ts';
/** Presets arrange the current workspace; they never run tools or navigate to a remote page. */
export const LAYOUT_PRESETS = Object.freeze({
  development: { label: 'Sviluppo', inspector: true, prose: 'reading' },
  research: { label: 'Ricerca', inspector: true, prose: 'wide' },
  documents: { label: 'Documenti', inspector: false, prose: 'wide' },
  focus: { label: 'Concentrazione', inspector: false, prose: 'reading' },
} satisfies Record<Preset, { label: string; inspector: boolean; prose: 'reading' | 'wide' }>);
