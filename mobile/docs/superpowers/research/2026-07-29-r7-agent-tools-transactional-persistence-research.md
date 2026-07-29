# Research dossier - transactional Agent Tools persistence

Date: 2026-07-29
Subsystem: TALOS mobile settings / Agent Tools

## Local diagnosis

- `setAgentToolEnabled` mutates the reactive `agent_tools` object before
  awaiting `Preferences.set`;
- a rejected or timed-out bridge write therefore leaves the current screen in
  the new state although durable storage still contains the previous state;
- the panel discards the returned promise with `void`, so it neither catches
  the rejection nor tells the user that persistence failed;
- a native checkbox changes its own DOM state before the change handler runs,
  which can visually disagree with an unchanged reactive source unless the
  component explicitly restores the controlled value;
- overlapping whole-settings writes can lose one toggle unless Agent Tools
  mutations compute and persist in a serialized order.

The defect crosses the data and presentation boundaries: both must share the
same durable truth.

## Current primary sources

1. Capacitor, **Preferences Plugin API**, inspected 2026-07-29:
   <https://capacitorjs.com/docs/apis/preferences>
   - `set` is asynchronous and exposes a promise boundary;
   - values are strings, so TALOS owns validation and snapshot semantics around
     the whole JSON setting.
2. Android Developers, **DataStore**, inspected 2026-07-29:
   <https://developer.android.com/topic/libraries/architecture/datastore>
   - recommended preference updates use an atomic read-modify-write operation;
   - writes are serialized and the operation completes after durable
     persistence;
   - a failed write aborts rather than publishing the candidate state.
3. W3C WAI-ARIA APG, **Switch Pattern**, inspected 2026-07-29:
   <https://www.w3.org/WAI/ARIA/apg/patterns/switch/>
   - a switch has one binary state and its accessible state must stay
     synchronized with the visual state;
   - a native checkbox with `role="switch"` uses its checked state.
4. W3C WAI-ARIA APG, **Alert Pattern**, inspected 2026-07-29:
   <https://www.w3.org/WAI/ARIA/apg/patterns/alert/>
   - an important dynamic failure can be announced with `role="alert"` without
     moving focus;
   - the alert should not disappear automatically.

Exact upstream pin retained:

- `@capacitor/preferences@8.0.1`;
- existing `talosBridgeCall` ten-second native timeout and diagnostic ring.

No dependency is added.

## Upstream decision

**Adapt Android DataStore transaction invariants above the existing Capacitor
adapter.**

- validate a candidate from the latest committed Agent Tools state;
- serialize Agent Tools mutations in call order;
- persist the candidate snapshot before publishing it to reactive state;
- keep a failed candidate out of both memory and durable storage;
- let a later mutation proceed after a failure rather than poisoning the queue;
- keep the checkbox on the committed value while saving;
- disable concurrent UI toggles and expose one localized persistent alert on
  failure.

Rejected alternatives:

- optimistic state with delayed rollback: exposes a false capability window to
  the live tool offer/execution checks;
- swallowing `Preferences.set` rejection: recreates the restart-only surprise;
- direct DataStore migration: adds a native storage system and data migration
  for a local contract defect that can be fixed behind the current adapter;
- automatic retry: a timed-out native call has uncertain completion and no
  idempotency token;
- toast-only failure: can disappear before the user understands which security
  control remained active.

## Security and concurrency constraints

- the tool registry reads only committed state;
- no tool becomes enabled before persistence succeeds;
- failures preserve the prior visible count, switch, model schema offer, and
  executor gate;
- queue failure is isolated to one mutation;
- no raw bridge or storage detail reaches UI copy;
- inputs remain native, labeled switches and stay keyboard operable when not
  saving.
