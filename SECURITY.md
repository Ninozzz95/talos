# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.** A public issue tells
everyone about the hole before there is a fix, and TALOS runs with permissions
that make that expensive: it can read the screen, act on other apps and reach
the phone through the debug bridge.

Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository.

If that is not available to you, write to the address in the repository profile
and put `SECURITY` in the subject.

### What helps

- what you did, step by step, and what happened
- the Android version and the device — TALOS behaves differently on ColorOS,
  OxygenOS and stock Android, and that difference is often the point
- whether the ADB bridge was paired, and whether the accessibility service was
  bound (`dumpsys accessibility` says it: `Bound services`)
- ⛔ never send a real API key, a real message or a real contact. A screenshot
  with a name in it is a person's data, and it stays in the issue forever

### What to expect

- an acknowledgement within a few days
- an honest answer about whether it is a bug, a limitation or a design choice —
  and if it is a design choice, why
- credit in the release notes, unless you prefer otherwise

## The permissions that matter, and why they exist

Anyone auditing TALOS should start here. Each of these is powerful, and each has
a reason that is written next to the code that uses it.

| capability | what it can do | where the reasoning lives |
| --- | --- | --- |
| Accessibility service | read the whole screen, press buttons in other apps | `TalosOcchio.kt` |
| ADB bridge | run shell commands with `adb` privileges | `TalosPonteAdb.kt` |
| Assistant role | be summoned from anywhere, receive the screen context | `TalosAssistente.kt` |
| Microphone | always-on wake word, and dictation | `TalosParola.kt` |
| Location | answer questions about places near you | `posizione.ts` |

Three rules the codebase holds itself to, and a report that shows one of them
broken is a security issue even without an exploit:

1. **Nothing acts without a gate.** Every tool call passes the consent sheet or
   a saved grant the person made.
2. **Nothing claims what it did not verify.** «Sent» is said only when
   independent checks on the screen agree — see `TalosObiettivoFinito.kt`.
3. **Nothing is enabled on the person's behalf.** Where TALOS repairs a broken
   state, it repairs a contradiction — it never turns on something that was
   turned off.

## Out of scope

- attacks that need physical access to an unlocked device
- anything requiring the person to enable the ADB bridge and pair a computer,
  which is by design a deliberate act with a six-digit code
- vendor bugs in ColorOS, OxygenOS or the Android framework itself — report
  those upstream, though we want to know so we can work around them
