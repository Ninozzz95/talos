# R7 design - first-bubble memory disclosure

Date: 2026-07-29

## Behavior

For the chronological `messages` currently materialized by the chat store:

- identify the earliest non-system message whose
  `metadata.used_memories` is a non-empty array;
- render the existing `talos-used-memories` pill only inside that message;
- render no pill on later memory-bearing messages;
- preserve the count, localized label, book icon and title of that first
  disclosure;
- when an older page is prepended, recompute the earliest message and move the
  single pill there;
- when no materialized message has memory provenance, render no pill.

The controller continues to persist `used_memories` on every turn where memory
was actually injected. No provider payload, repository, message schema,
export, Memory-station control or selection algorithm changes.

## Security and evidence

- Never infer model use from memory settings alone; a pill requires persisted
  non-empty `used_memories`.
- Never delete, rewrite or coalesce later provenance arrays.
- Never render memory content; retain only the existing count and title list.
- Keep the untrusted provider-context boundary unchanged.

## Accessibility and pagination

- Keep the existing localized visible label and decorative `BookMarked` icon.
- Keep one consistent test id and title grammar.
- A loaded page never exposes duplicate pills.
- Prepending older messages may relocate, but never duplicate, the pill.
- The rule is linear and cached as a Vue computed value, not an O(n) scan per
  rendered row.

## Acceptance

- Unit proof covers two consecutive memory-bearing turns, an earlier plain
  turn, a prepended older memory-bearing page, no-memory input and immutable
  later metadata.
- The real multi-turn browser journey proves memory is injected twice, only
  one pill is visible, reload still shows one, and disabling memory stops the
  next provider injection.
- Existing message actions, calm-thread, pagination, memory-context and store
  suites remain green.
