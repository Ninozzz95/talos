import {
    parseTalosMobileDesignTokens,
    TALOS_THEME_IDENTITY_PALETTE_ROLES,
    talosLayoutTokensFor,
    type TalosMobileDesignTokens,
    type TalosThemeIdentityPaletteRole,
    type TalosThemeTypographyFace,
} from '@talos-mobile/design-tokens'

export type TalosColorScheme = 'light' | 'dark'

/**
 * Frozen mapping from the 16 canonical palette roles to the shadcn-vue
 * semantic CSS variables the reka-nova components consume. Every role maps to
 * at least one variable so no identity color is silently dropped.
 */
export const TALOS_SHADCN_VARIABLE_MAP: Readonly<Record<TalosThemeIdentityPaletteRole, readonly string[]>> = Object.freeze({
    background: ['--background'],
    surface: ['--card', '--popover'],
    surface_muted: ['--muted'],
    surface_elevated: ['--sidebar'],
    text: ['--foreground', '--card-foreground', '--popover-foreground', '--secondary-foreground'],
    text_muted: ['--muted-foreground'],
    border: ['--border', '--sidebar-border'],
    border_strong: ['--input'],
    accent: ['--primary', '--accent', '--sidebar-primary', '--sidebar-accent'],
    accent_text: ['--primary-foreground', '--accent-foreground', '--sidebar-primary-foreground', '--sidebar-accent-foreground'],
    secondary: ['--secondary'],
    success: ['--talos-success'],
    warning: ['--talos-warning'],
    danger: ['--destructive'],
    info: ['--talos-info'],
    focus: ['--ring', '--sidebar-ring'],
})

export const TALOS_RADIUS_SCALE = Object.freeze({ sharp: '0rem', balanced: '0.5rem', soft: '0.75rem' })
export const TALOS_DENSITY_SCALE = Object.freeze({ compact: '0.9', comfortable: '1', spacious: '1.15' })

export type TalosIdentityFieldDisposition =
    | { readonly disposition: 'consumed'; readonly boundary: string }
    | { readonly disposition: 'deferred'; readonly boundary: string }

/**
 * Exact disposition of every top-level identity field in the M1 runtime.
 * `motion_intents` is DEFERRED: M1 validates and exposes the intents as data
 * attributes but never animates them; the motion renderer stays desktop-owned.
 */
export const TALOS_IDENTITY_FIELD_DISPOSITION: Readonly<Record<keyof TalosMobileDesignTokens, TalosIdentityFieldDisposition>> = Object.freeze({
    schema_version: { disposition: 'consumed', boundary: 'parseTalosMobileDesignTokens version gate' },
    id: { disposition: 'consumed', boundary: 'documentElement[data-talos-theme] + poster path prefix' },
    semantic_palette: { disposition: 'consumed', boundary: 'TALOS_SHADCN_VARIABLE_MAP css variables' },
    typography: { disposition: 'consumed', boundary: '--talos-font-ui/display/mono css variables' },
    density: {
        disposition: 'consumed',
        boundary: '--talos-density-scale + --talos-space-page + --talos-space-section + --talos-space-card + --talos-space-control + --talos-space-inline + --talos-icon-size + --talos-touch-target css variables',
    },
    radius: {
        disposition: 'consumed',
        boundary: '--radius + --talos-radius-card + --talos-radius-control css variables',
    },
    assets: { disposition: 'consumed', boundary: 'bundled poster served at assets.poster.path' },
    motion_intents: { disposition: 'deferred', boundary: 'data-talos-motion-* attributes; renderer deferred to a later milestone' },
    accessibility: { disposition: 'consumed', boundary: 'prefers-reduced-motion + :focus-visible ring + contrast tests' },
})

function fontStack(face: TalosThemeTypographyFace): string {
    const quote = (family: string) => (/\s/.test(family) ? `"${family}"` : family)
    return [face.family, ...face.fallback_families].map(quote).join(', ')
}

/**
 * Apply a validated, canonical Telemetry-family identity to the DOM for the
 * requested color scheme. Only accepts identities already parsed by
 * `parseTalosMobileDesignTokens`; callers that hold raw JSON must parse first.
 */
export function applyTalosMobileDesignTokens(
    tokens: TalosMobileDesignTokens,
    scheme: TalosColorScheme,
    target: HTMLElement = document.documentElement,
): void {
    const palette = tokens.semantic_palette[scheme]
    for (const role of TALOS_THEME_IDENTITY_PALETTE_ROLES) {
        const color = palette[role]
        for (const cssVar of TALOS_SHADCN_VARIABLE_MAP[role]) {
            target.style.setProperty(cssVar, color)
        }
    }

    target.style.setProperty('--radius', TALOS_RADIUS_SCALE[tokens.radius])
    target.style.setProperty('--talos-density-scale', TALOS_DENSITY_SCALE[tokens.density])
    const layout = talosLayoutTokensFor(tokens.density, tokens.radius)
    target.style.setProperty('--talos-space-page', layout.page)
    target.style.setProperty('--talos-space-section', layout.section)
    target.style.setProperty('--talos-space-card', layout.card)
    target.style.setProperty('--talos-space-control', layout.control)
    target.style.setProperty('--talos-space-inline', layout.inline)
    target.style.setProperty('--talos-icon-size', layout.icon)
    target.style.setProperty('--talos-touch-target', layout.touchTarget)
    target.style.setProperty('--talos-radius-card', layout.radiusCard)
    target.style.setProperty('--talos-radius-control', layout.radiusControl)
    target.style.setProperty('--talos-font-ui', fontStack(tokens.typography.ui))
    target.style.setProperty('--talos-font-display', fontStack(tokens.typography.display))
    target.style.setProperty('--talos-font-mono', fontStack(tokens.typography.mono))
    // assets.poster is consumed by exposing its canonical local path as a CSS
    // variable the shell renders as a bundled, offline-served background.
    target.style.setProperty('--talos-poster-url', `url("${tokens.assets.poster.path}")`)

    target.setAttribute('data-talos-theme', tokens.id)
    target.classList.toggle('dark', scheme === 'dark')

    // Desktop parity: scope the shared `--talos-*` token vocabulary so ported
    // desktop components (`bg-[var(--talos-panel)]` etc.) resolve identically. The
    // vendored `.talos-shell[data-theme-preset=...]` CSS block matches these.
    target.classList.add('talos-shell')
    target.setAttribute('data-theme-preset', tokens.id)
    target.setAttribute('data-theme-mode', scheme)

    // Deferred: intents are published for a later renderer, never animated in M1.
    for (const [intent, token] of Object.entries(tokens.motion_intents)) {
        target.setAttribute(`data-talos-motion-${intent.replace(/_/g, '-')}`, token)
    }
}

/**
 * Parse raw identity JSON and apply it, failing closed: on any contract error
 * the DOM defaults from style.css remain and the error is returned, not thrown
 * into the caller's render path.
 */
export function bootstrapTelemetryIdentity(
    raw: unknown,
    scheme: TalosColorScheme,
    target: HTMLElement = document.documentElement,
): { applied: true } | { applied: false; error: unknown } {
    try {
        const tokens = parseTalosMobileDesignTokens(raw)
        applyTalosMobileDesignTokens(tokens, scheme, target)
        return { applied: true }
    } catch (error) {
        return { applied: false, error }
    }
}
