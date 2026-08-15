## What changes, for a person

<!-- One or two sentences. Not "refactor X" — what someone using TALOS notices. -->

## Why

<!-- If a measurement decided something, put the numbers here. -->

## Ran on a real phone

<!--
⛔ This is the one that matters. A change is not done when it compiles: it is
done when it ran on a device and someone looked at the screen.

Say WHICH phone, WHICH Android version, and WHAT you saw.
If you could not test on hardware, say that instead — it is a fair answer, and
it tells the reviewer what to check.
-->

- Phone / Android / ROM:
- What I did:
- What I saw:

## The other direction

<!--
If this makes TALOS do something new, show that it does NOT do it when it
shouldn't. Half of the defects in this project were features firing when nobody
asked.
-->

## Gates

- [ ] `npm run typecheck` silent
- [ ] `npx vitest run` green
- [ ] `node scripts/verify-initial-chunk.mjs` ok
- [ ] if a ceiling moved, the reason is written next to the number
