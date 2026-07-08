# TALOS Theme Engine

TALOS Theme Engine controls the visual identity of the workspace through safe, persisted settings. It does not load remote CSS, arbitrary URLs, scripts, or video backgrounds. Every theme value is written through `/api/talos/settings` and sanitized on both the client and the Laravel control plane.

## Presets

TALOS ships with ten first-party presets:

- AVM Forge
- Paper Review
- Terminal Operator
- Aurora Research
- Glacier Desk
- Ember Incident
- Atlas Enterprise
- Noir Contrast
- Signal Command
- Violet Lab

Each preset defines a palette, typography direction, density feel, default procedural background effect, and a static WebP poster preview. Selecting a preset resets personal color overrides so the chosen preset is visible immediately.

## Custom Themes

The Customize tab lets an operator tune controlled tokens:

- background
- panel
- text
- accent
- secondary
- border
- font
- density
- corner radius
- procedural effect
- effect intensity

Edits preview live in the current browser session. `Save customization` persists the override. `Discard changes` drops the unsaved draft. `Reset to preset` clears personal overrides and returns to the active preset.

Operators can also save the current customization as a named theme. Named themes are stored in `preferences.theme_library` with a base preset, safe token set, optional area tokens, and motion mode. The Library tab supports apply, rename, duplicate, delete, export, and import.

## Import And Export

Theme export uses this schema:

```json
{
  "schema": "talos_theme_export_v1",
  "exported_at": "2026-07-08T12:00:00.000Z",
  "theme": {
    "id": "operator-theme",
    "name": "Operator Theme",
    "base_theme": "forge",
    "tokens": {
      "accent": "#31d6c8"
    },
    "motion": "subtle"
  }
}
```

Imports are rejected when the schema is unknown, required fields are missing, colors are not hex values, or unsafe fields are present.

## Motion Controls

TALOS uses procedural DOM/CSS/Canvas effects instead of video backgrounds. Motion modes are:

- `system`: default behavior
- `off`: disables procedural background effects
- `subtle`: lower opacity and slower animation
- `normal`: standard TALOS motion
- `cinematic`: higher contrast and faster motion for demos

The workspace also respects the existing reduced-motion preference by disabling runtime effects when that setting is enabled.

## Advanced Area Tokens

Advanced tokens target specific UI areas without allowing arbitrary CSS:

- sidebar
- chat
- composer
- floating windows
- header
- buttons
- cards and panels
- code blocks

Allowed token keys are background, surface, text, muted, border, and accent. These map to explicit TALOS CSS variables such as `--talos-composer-bg`, `--talos-sidebar`, and `--talos-code-bg`.

## Security

Theme settings are treated as untrusted user input. The system strips secret-like keys and rejects executable styling surfaces. Do not store API keys, tokens, passwords, remote asset URLs, CSS strings, JavaScript, or event handler names inside theme preferences.

Laravel sanitizes the same theme structures accepted by the browser:

- `theme_customization`
- `theme_library`
- `active_custom_theme_id`
- `theme_motion`
- `theme_area_tokens`
- `workspace_default_theme`
- `theme_policy_locked`

When `theme_policy_locked` is active, theme writes fail with a controlled validation response.

## Troubleshooting

If a theme does not appear to change, check whether a saved customization is overriding the preset. Selecting a preset clears `theme_customization`.

If motion is not visible, check `theme_motion`, `reduced_motion`, and browser reduced-motion settings.

If import fails, verify the schema is `talos_theme_export_v1`, colors are six-digit hex values, and the theme object has a safe `id`, `name`, and `base_theme`.
