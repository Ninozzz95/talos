# TALOS

An Android assistant that actually does things on your phone — and tells you the
truth about what happened.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../LICENSE)

```
you:    manda a Shadina su WhatsApp che sto arrivando
TALOS:  ✓ inviato

        press=true via=viewId in 719 ms
        obiettivo=PARTITO (campo-vuoto=true migrato=true prove=3/3)
```

That second block is the point. TALOS does not say "sent" because it called a
function: it says "sent" because three independent checks on the screen agree —
the input field is empty, the text has moved into the conversation, and the send
control is gone. When only one check agrees, it says so.

---

## What it does

**Talks to your phone.** Torch, volume, alarms, wallpaper, battery, storage,
network, do-not-disturb. Reads your calendar and your unread mail count. Answers
"what do I have tomorrow" from the actual calendar, not from its own notes.

**Acts inside other apps.** Opens WhatsApp on the right conversation, fills the
message, presses send, and verifies it left. Searches inside an app. Opens a
place in Maps. The same machinery works on apps it has never seen: it reads the
accessibility tree, it does not carry a list of hardcoded apps.

**Answers about where you are.** "A restaurant near me tonight" reads the phone's
location at that moment — and does not read it for questions that have nothing
to do with a place.

**Listens for its name.** "hey TALOS" wakes it, with a wake-word model trained
in this repository. No cloud round-trip, no Google hotword: 5.5 MB of ONNX that
runs on the device.

**Runs any model.** Anthropic, OpenAI, Google, OpenRouter, Ollama, or a local
GGUF on the phone itself. The tool contracts are identical across all of them.

## What makes it different

**It never claims what it did not verify.** «Opened» is not «done». Every action
that can be checked, is checked, and the answer distinguishes *it worked*, *it
did not work*, and *I could not confirm* — because those are three different
things a person can act on.

**Nothing happens without a gate.** Every tool call passes a consent sheet or a
grant you gave earlier. You can set any capability to always / ask / never, and
the grammar is the same everywhere.

**It says what it cannot do.** A capability that is unavailable reports *why*,
and offers the settings screen that would enable it. No silent failure, no
mock presented as real.

## Building it

```bash
npm ci
npm run typecheck            # must be silent
npx vitest run               # ~5.100 tests, must be green
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug -PtalosSideBySide
```

⛔ One extra install, and it is easy to miss: the git-bash launcher keeps its
native dependencies isolated in its own folder, on purpose — `node-pty` must
never end up in this project's `package.json`. If you want its tests to run:

```bash
cd tools/git-bash-launcher && npm ci
```

Without it those tests skip themselves rather than fail: a dependency that was
never installed is not a broken project.

`-PtalosSideBySide` builds `ai.talos.dev`, which installs **alongside** a release
build instead of replacing it — useful while developing.

Requirements: Node 20+, JDK 17, Android SDK 34+.

## The permissions, and why each one exists

TALOS asks for powerful things. Each is listed in the app's own permissions
screen with the same explanation, and none is requested until the feature that
needs it is used.

| permission | what it enables | boundary |
| --- | --- | --- |
| Microphone | the wake word, and dictation | no audio is ever stored |
| Accessibility service | reading the screen, pressing buttons in other apps | off by default; you turn it on in system settings |
| Location | "what's near me" questions | read at the moment it is needed, never in the background |
| Contacts | sending a message to a name | one lookup, for one message |
| Calendar | "what do I have tomorrow" | read and write are asked separately |
| Camera | taking a photo to attach | the system camera, nothing hidden |
| ADB bridge | system settings an app cannot change alone | needs a deliberate six-digit pairing, and dies on reboot |

The ADB bridge deserves a word: TALOS talks to the phone with the same
privileges a computer has over USB, but the bridge lives **inside** TALOS — no
third-party app, no root. It does not survive a reboot, on purpose: phone
control is a live capability, not an acquired permission.

## Status

**Today: Android.** Working and used daily on a OnePlus 13 (ColorOS) and a
OnePlus Pad 3 (OxygenOS). Android 14+.

**Next: desktop and CLI**, sharing the same tools and the same contracts — so a
capability written once works on both surfaces instead of drifting apart. Not
here yet; this line will say so when it is.

This is a young project, published because the interesting part is the
harness — how an assistant grounds itself in a real screen and refuses to lie
about the result — and that part is worth more shared than kept.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md). The short version: a change is done
when it has been run on a real phone and someone looked at the screen.

The code and comments are in Italian; identifiers and APIs are in English. You
do not need Italian to contribute — issues and pull requests in English are
welcome.

## Licence

[Apache License 2.0](../LICENSE). Third-party components and the origin of every
shipped binary are listed in [NOTICE](../NOTICE).
