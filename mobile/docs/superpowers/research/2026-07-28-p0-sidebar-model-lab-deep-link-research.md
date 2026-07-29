# P0 — Sidebar Model Lab deep-link research

Date: 2026-07-28  
Subsystem: TALOS UI / mobile shell navigation  
Lane: `lane/kimi-mobile`

## Local problem and evidence

The owner reports that the sidebar's **Model Lab** button opens generic
Settings instead of Model Lab.

The source path confirms the report:

1. `TalosMobileSidebar.vue` emits the dedicated `openModelLab` event;
2. `App.vue` handles that event with `sidebarNavigate('settings')`;
3. `SettingsScreen.vue` already owns the canonical `tab=models` deep-link
   contract and opens the real Model Lab panel for `/settings?tab=models`;
4. the composer already uses that exact route object.

This is therefore a shell wiring defect, not a missing Model Lab screen or a
router-definition problem. The 2026-07-22 severe engineering audit had already
recorded the same unresolved `AUD-002` finding.

## Current primary upstream

### Vue Router

- Official programmatic-navigation documentation:
  https://router.vuejs.org/guide/essentials/navigation
- Official named-route documentation:
  https://router.vuejs.org/guide/essentials/named-routes
- Project pin: `vue-router@5.2.0`, MIT.

Vue Router accepts a location object containing a route `name` or `path` plus a
`query` object. It performs query encoding and returns a Promise representing
the completed navigation.

Applicable decision: use the installed router directly and navigate to the
existing named `settings` route with `{ tab: 'models' }`. Do not introduce a
second Model Lab route, manual URL concatenation, or a parallel state flag.

## Upstream disposition

**Adopt directly.**

Use the pinned `vue-router@5.2.0` location-object/query contract through the
existing AVM shell navigation helper. The canonical internal destination stays
provider-neutral and product-owned:

```text
route name: settings
query: { tab: "models" }
```

Rejected alternatives:

- a new `/model-lab` route duplicates an established settings subsection and
  risks two lifecycle/initialization paths;
- opening Settings and programmatically clicking the Models category is not
  addressable, reload-safe, or accessible;
- a local boolean bypasses browser/Android back history and persisted route
  behavior.

## Compatibility and security

- No provider, tool, network, persistence schema, or permission boundary
  changes.
- The sidebar still closes on selection.
- Back/reload semantics remain owned by Vue Router and the existing query-aware
  Settings screen.
- Generic Settings navigation remains query-free and unchanged.

