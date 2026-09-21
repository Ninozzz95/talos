# TALOS Theme Engine

TALOS Theme Engine controls the workspace identity through typed, persisted settings. It does not load remote CSS, scripts, arbitrary asset URLs, or video backgrounds. Theme writes pass through `/api/talos/settings`; both Vue and Laravel reject unsupported or unreadable values.

## Preset Registry

TALOS ships with 12 first-party presets. Each preset has forced light and dark variants, locally bundled fonts, a density and radius profile, bounded motion, a procedural background, message surfaces, and window chrome derived from the same semantic tokens.

| Preset | UI font | Density | Radius | Motion | Background |
|---|---|---|---|---|---|
| AVM Forge | Instrument Sans | Compact | Balanced | Normal | DAG Flow |
| Paper Review | Source Serif 4 | Spacious | Balanced | Subtle | Kahn Grid |
| Terminal Operator | JetBrains Mono | Compact | Sharp | Cinematic | Trace Rain |
| Aurora Research | Manrope | Comfortable | Soft | Normal | Signal Mesh |
| Glacier Desk | Instrument Sans | Spacious | Sharp | Subtle | Kahn Grid |
| Ember Incident | Instrument Sans | Compact | Sharp | Cinematic | Trace Rain |
| Atlas Enterprise | Manrope | Comfortable | Balanced | Subtle | Signal Mesh |
| Noir Contrast | Instrument Sans | Compact | Sharp | Subtle | Trace Rain |
| Signal Command | Manrope | Compact | Balanced | Cinematic | Signal Mesh |
| Violet Lab | Sora | Comfortable | Soft | Normal | DAG Flow |
| Claudius Review | Source Serif 4 | Spacious | Soft | Subtle | Kahn Grid |
| Basicus Material | Instrument Sans | Comfortable | Sharp | Normal | Kahn Grid |

`System` color mode follows the operating-system light/dark preference. `Light` and `Dark` force the chosen variant. `System` motion uses the active preset profile while still honoring operating-system reduced motion.

Orbitron is reserved for the TALOS brand. Product text uses Instrument Sans, Manrope, Sora, Source Serif 4, JetBrains Mono, or an explicitly selected system stack. All first-party font assets are bundled locally.

## Semantic Token Contract

Components consume semantic variables instead of raw status colors. The active preset owns the fallback; a validated customization may override only the documented layer.

| Surface | Primary tokens | Owner and fallback |
|---|---|---|
| Workspace canvas | `--talos-background`, `--talos-grid-color`, `--talos-line-a`, `--talos-line-b` | Active preset and forced mode |
| Panels and cards | `--talos-panel`, `--talos-panel-soft`, `--talos-card`, `--talos-border` | Active preset; optional global panel/border override |
| Main text | `--talos-text`, `--talos-muted` | Active preset; optional global text override |
| Composer | `--talos-composer-bg`, `--talos-composer-surface`, `--talos-composer-text`, `--talos-composer-border` | Active preset; optional composer area tokens |
| Messages | `--talos-user`, `--talos-user-text`, `--talos-assistant`, `--talos-assistant-text`, `--talos-system`, `--talos-system-text` | Forced light/dark variant |
| Code | `--talos-code-bg`, `--talos-code-surface`, `--talos-code-text`, `--talos-code-border`, `--talos-code-accent` | Forced variant; optional code area tokens; accent is a decorative header marker and never the sole text/focus signal |
| Status | success, warning, danger, and info foreground/soft/border triples | Derived from the forced variant; never replaced by raw component colors |
| Focus and selection | `--talos-ring`, `--talos-ring-soft`, `--talos-active`, `--talos-accent-text` | Active accent with measured foreground |

Normal-text pairs must meet at least 4.5:1 contrast in both forced light and forced dark modes. Validation covers workspace/panel text, muted text, composer, user/assistant/system messages, errors, statuses, code, window chrome, opaque button fills, transparent/outline button parent surfaces, and every customized area. Missing, transparent, unresolved, or malformed colors fail closed.

Laravel validates the effective merged state, not only fields present in the latest PATCH. A later global customization therefore cannot make an existing area override unreadable. Named themes and imports are checked with the same rule before persistence.

## Customization

The Customize tab exposes controlled values for:

- background, panel, text, accent, secondary, and border
- Instrument Sans, Manrope, JetBrains Mono, system UI, Sora, and Source Serif 4
- compact, comfortable, or spacious density
- sharp, balanced, or soft corners; production card radius remains at most 8px
- procedural effect and bounded effect intensity
- scrollbar colors and width
- chat message scale, composer mode, and advanced-rail preference

The product preview renders message, code, input, status, evidence, chrome, palette, font, and chat layout from the current draft. Preview fallback values are never materialized as overrides: changing only a font persists only that font and leaves every preset color token intact. `Save customization` persists the safe delta, `Discard changes` restores the saved state, `Reset customization` clears only custom theme tokens and named-theme activation, and `Reset to preset` also clears area, mode, motion, animation, and chat-layout overrides.

## Named Themes And Portability

Named themes are stored in `preferences.theme_library`. The Library supports create, duplicate, rename, apply, reload, export, import, and confirmed delete. Applying a named theme gives its chat layout precedence over the previously active layout.

Export uses the versioned `talos_theme_export_v1` envelope. Imports require a supported base preset and a typed token object. Unknown fields, unsafe colors, unreadable global or area pairs, impossible/non-ISO timestamps, duplicate IDs, and over-capacity libraries are rejected with a validation error and no persistence request. Imported data never carries executable CSS or remote assets.

## Motion And Background Controls

UI motion uses semantic intents for surface enter/exit, window open/minimize/restore/focus, disclosure, popover, menu, message insert, activity, feedback, and theme transition. Durations are scaled from one typed baseline and use transform/opacity animation.

The controls are independent:

- `Disable background motion` freezes the procedural canvas but keeps it visible.
- `Disable procedural background` removes the canvas entirely.
- UI animation `Off` disables nonessential interface motion without hiding the background.
- OS reduced motion is a hard override for both UI and background animation.
- Hidden tabs and low-power/data-saver signals pause recurring work.

Theme and motion controls are optimistic only while their settings request is pending. A rejected write restores the last server-backed control state so the switch value cannot disagree with the running workspace.

The canvas caches geometry and palette outside the frame loop, caps FPS and DPR, and redraws a static frame when animation is disabled.

## Advanced Area Tokens

Advanced customization can target sidebar, chat, composer, floating windows, header, buttons, cards, and code. Allowed keys are `background`, `surface`, `text`, `muted`, `border`, and `accent`. Each area is validated together with the effective global customization in both color modes. A non-empty value must be a six-digit hex color; invalid text is reported and never interpreted as a reset.

## Workspace Policy

When `theme_policy_locked` is active, theme writes fail with a controlled 422 response. Empty no-op updates remain safe; attempts to clear or mutate locked theme state are rejected. Malformed legacy values are sanitized on read, and unreadable legacy customization or area tokens are not applied to the workspace.

## Troubleshooting

- If a preset appears unchanged, select it again to clear global and area overrides, or use `Reset to preset`.
- If motion is absent, check UI animation, background motion, procedural background, workspace reduced motion, OS reduced motion, tab visibility, and data-saver state.
- If an enable/disable switch returns to its previous value, the server rejected that settings write; read the visible error before retrying. TALOS does not leave the control in an unpersisted state.
- If import fails, inspect the validation message and confirm `talos_theme_export_v1`, a supported `base_theme`, six-digit hex colors, and readable light/dark pairs.
- If a workspace policy blocks editing, an administrator must unlock theme settings; the client cannot bypass the server policy.
