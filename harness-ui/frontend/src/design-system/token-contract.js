function freezeGroups(groups) {
  for (const values of Object.values(groups)) Object.freeze(values);
  return Object.freeze(groups);
}

export const TALOS_DESIGN_TOKEN_GROUPS = freezeGroups({
  color: [
    '--talos-background', '--talos-panel', '--talos-panel-soft', '--talos-card',
    '--talos-window-bg', '--talos-text', '--talos-assistant-text', '--talos-muted',
    '--talos-border', '--talos-border-strong', '--talos-accent',
    '--talos-accent-hover', '--talos-accent-soft', '--talos-accent-border',
    '--talos-accent-text', '--talos-secondary', '--talos-success',
    '--talos-warning', '--talos-danger', '--talos-info',
  ],
  typography: [
    '--talos-font-ui', '--talos-font-display', '--talos-font-mono',
    '--talos-font-size-xs', '--talos-font-size-sm', '--talos-font-size-md',
    '--talos-font-size-lg',
  ],
  space: [
    '--talos-space-page', '--talos-space-section', '--talos-space-card',
    '--talos-space-control', '--talos-space-inline', '--talos-space-xs',
    '--talos-space-sm', '--talos-space-md', '--talos-space-lg',
  ],
  radius: ['--talos-radius-card', '--talos-radius-control', '--talos-radius-pill'],
  control: [
    '--talos-touch-target', '--talos-control-height', '--talos-primary-height',
    '--talos-icon-size',
  ],
  motion: [
    '--talos-motion-duration-control', '--talos-motion-duration-surface-enter',
    '--talos-motion-duration-surface-exit', '--talos-motion-duration-tab-change',
    '--talos-motion-ease', '--talos-motion-ease-exit',
  ],
  focus: ['--talos-ring', '--talos-ring-soft', '--talos-focus-width', '--talos-focus-offset'],
  layer: ['--talos-z-app-overlay', '--talos-z-menu', '--talos-z-tooltip'],
});

export const TALOS_REQUIRED_DESIGN_TOKENS = Object.freeze(
  Object.values(TALOS_DESIGN_TOKEN_GROUPS).flat(),
);

export function assertTalosDesignTokens(computedStyle) {
  if (!computedStyle || typeof computedStyle.getPropertyValue !== 'function') {
    throw new TypeError('stile calcolato TALOS non disponibile');
  }
  const missing = TALOS_REQUIRED_DESIGN_TOKENS.filter(
    (name) => !String(computedStyle.getPropertyValue(name) || '').trim(),
  );
  if (missing.length) throw new Error(`Token TALOS mancanti: ${missing.join(', ')}`);
  return true;
}

