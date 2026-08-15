# Contributing to TALOS

Thanks for being here. This file is short on ceremony and long on the two or
three things that actually decide whether a change gets merged.

## The one rule that explains all the others

**A change is not done when it compiles. It is done when it has been run on a
real phone and someone looked at the screen.**

TALOS acts on a device: it opens apps, presses buttons in other apps, sends
messages to real people. A unit test can tell you a function returns the right
value; it cannot tell you the button was pressed, the message left the input
field, or the bar came back. Those are the failures that matter here, and they
are only visible on hardware.

⇒ So a pull request says what you ran it on. Not "tested" — *which phone, which
Android version, what you saw*.

## Getting it running

```bash
cd mobile
npm ci
npm run typecheck        # must be silent
npx vitest run           # must be green
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug -PtalosSideBySide
```

`-PtalosSideBySide` builds `ai.talos.dev`, which installs **next to** a release
TALOS instead of replacing it. Use it: it is how you keep a working assistant on
the phone while breaking the other one.

## What a good change looks like

**Say what it does, and what it does NOT do.** A tool that can fail should say
how, in words the model can pass on to a person. `ok: false` with no explanation
teaches the model to invent one.

**Measure before you conclude.** The most expensive bugs in this project were
all cases of a plausible explanation that nobody checked. If you write "this
should fix it", run it and paste what happened.

**Test the other direction too.** A feature that works when asked is half the
job; the other half is that it stays quiet when it should. If your change makes
TALOS do something new, show that it does *not* do it when it shouldn't.

**Comments carry the why.** This codebase has long comments on purpose: they
hold the measurement that decided a number, the defect that a guard exists to
prevent, the road not taken. A magic constant with no reasoning next to it will
be asked about in review. If you had to measure something to pick it, that
measurement belongs in the file.

## The gates

They run in CI, and they are not decoration:

| gate | what it protects |
| --- | --- |
| `npm run typecheck` | the whole TypeScript surface — it does not cover tests |
| `npx vitest run` | ~5.100 unit tests |
| `scripts/verify-initial-chunk.mjs` | the startup graph size — the app must open fast |
| `pesoDegliSchemi.test.ts` | the token cost of tool schemas, which local models pay |
| `toolControls.test.ts` | byte-compatibility of every pre-existing tool contract |
| provenance gate in `build.gradle` | size + SHA-256 of every shipped binary |

⛔ If a gate is red, do not raise the ceiling to make it pass. Look at what grew
and why. Ceilings here move only with a measurement and a written reason — and
sometimes the right answer is that the ceiling moves, but that is a decision,
not a workaround.

## Language

The code, comments and commit messages are in Italian; identifiers and public
APIs are in English. This is unusual and deliberate: the reasoning is written in
the language the people who wrote it think in, and reasoning that is awkward to
write does not get written.

**You do not have to write Italian to contribute.** English is welcome in
issues, pull requests and comments — nobody will ask you to translate.

## Commit messages

One line saying what changed for a person, then the reasoning. If a measurement
decided something, put the numbers in. Future readers — including you — will
want to know *why*, and the diff cannot tell them.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under the [Apache License 2.0](LICENSE), the same as
the project. There is no CLA to sign: the Apache licence already grants what is
needed, patents included.
