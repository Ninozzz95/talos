# TALOS Mobile Composer Durable State Research

Date: 2026-07-22

## Problem statement

The mobile composer already calls real provider adapters and persists chat messages in SQLite, but its draft, selected reasoning effort, and thinking toggle live only in Vue refs. Reloading the application loses those values. The selected model is persisted only as a side effect of sending a message, and the file/context buttons currently emit events that no product owner handles.

The next slice must preserve the current local-first boundary, match the desktop composer interaction contract, and avoid presenting inert controls as working capabilities.

## Primary sources inspected

1. Capacitor Preferences v8: https://capacitorjs.com/docs/apis/preferences
   - Preferences is the supported lightweight key/value store on Android and falls back to localStorage on the web.
   - Values are strings; structured values must be serialized as JSON.
   - The official documentation explicitly says it is not a local database and recommends SQLite for high-write or queryable data.
2. Reka UI Select: https://www.reka-ui.com/docs/components/select
   - The already-pinned Select primitive provides controlled state, managed focus, keyboard navigation, typeahead, disabled items, groups, portals, and viewport constraints.
3. WAI-ARIA Authoring Practices listbox pattern: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
   - Single-select options require one selected state, deterministic focus, arrow navigation, Home/End for longer lists, and concise accessible names.
   - A listbox must not contain nested interactive controls; refresh and Model Lab commands therefore remain outside its option collection.
4. Vue 3 watcher cleanup: https://vuejs.org/api/reactivity-core.html#watch
   - Async reactions need invalidation/cleanup so a late result cannot overwrite a newer scope.
5. VueUse `useDebounceFn`: https://vueuse.org/shared/useDebounceFn/
   - The existing pinned `@vueuse/core@14.3.0` offers bounded debounce with `maxWait`; it is suitable for scheduling draft writes, but an explicit flush boundary is still required before session changes and unmount.

## Upstream decisions

### ADOPT: Capacitor Preferences 8.0.1 for global composer defaults

Keep `model_profile_id`, `effort`, and `thinking` in the existing central mobile settings document. These values are small, low-write preferences and fit the official Preferences contract. No new package is needed.

### ADAPT: existing SQLite repository for per-session drafts

Drafts are session-scoped, can be written repeatedly, and belong beside durable chat state. Reuse the existing `talos_chat_state` table through narrow repository methods. Do not add a second database, schema migration, or ad-hoc localStorage key.

### ADOPT: existing Reka UI 2.10.1 selection primitives

The Settings model selector already uses an AVM-owned wrapper over Reka Select. The quick composer picker keeps the desktop grouped presentation but must preserve APG keyboard/focus behavior and place command buttons outside `role=listbox`.

### ADAPT: Vue watcher invalidation and an AVM-owned flushable draft adapter

Use a small composable around the repository port. It owns debounce, max-wait, explicit flush, and a monotonically increasing scope revision. A late draft read from session A may never overwrite session B.

### REJECT: localStorage

Capacitor explicitly warns that mobile operating systems may clear localStorage. It is not acceptable for a durable local-first draft.

### REJECT: storing drafts in Preferences

Drafts are higher-write and session-queryable data. Capacitor documents Preferences as a lightweight store, not a database. The existing SQLite state table is the correct owner.

### REJECT: enabling file/context controls before their real bridges exist

The current events are unhandled. Until the Vault/file and context slices land, the controls remain visually present for parity but disabled with precise accessible reasons. Model Lab and provider refresh are wired now because real owners already exist.

## Compatibility and rollback

- No database version change: the existing `talos_chat_state` table is reused.
- Existing messages, sessions, provider keys, and theme preferences remain unchanged.
- Malformed composer defaults fail closed to canonical defaults.
- Empty drafts delete their state row instead of retaining unbounded empty records.
- Rollback removes the new repository methods/composable and the `composer_defaults` settings subtree; no data migration is required.

