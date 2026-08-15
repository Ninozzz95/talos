# TALOS

An Android assistant that actually does things on your phone — and tells you the
truth about what happened.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../LICENSE)
[![Tests](https://img.shields.io/badge/tests-5%2C144%20passing-brightgreen.svg)](#building-it)
[![Platform](https://img.shields.io/badge/platform-Android%2014%2B-3ddc84.svg)](#status)
[![Models](https://img.shields.io/badge/models-cloud%20or%20local-blueviolet.svg)](#what-it-does)

<!--
  ⛔ IL BADGE DELLA CI NON C'È, ED È VOLUTO.
  La CI esiste (.github/workflows/ci.yml) ma non è mai girata: il badge sarebbe
  verde per finta. Si aggiunge dopo il primo push, quando dice una cosa vera.
  Un badge che mente è peggio di un badge assente.
-->

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

## See it

<table>
<tr>
<td width="25%"><img src="docs/immagini/1-la-barra.png" alt="The assistant bar over any app"></td>
<td width="25%"><img src="docs/immagini/2-la-risposta.png" alt="An answer with its card"></td>
<td width="25%"><img src="docs/immagini/3-i-permessi.png" alt="The permissions screen"></td>
<td width="25%"><img src="docs/immagini/4-il-telefono.png" alt="Phone control"></td>
</tr>
<tr>
<td><b>Ask from anywhere</b><br>The bar opens over whatever you are doing — it does not pull you into an app.</td>
<td><b>Get an answer with its receipts</b><br>Sources, what it checked, and what it could not.</td>
<td><b>See exactly what it can do</b><br>Every permission, why it exists, and its real state right now.</td>
<td><b>And what your phone allows</b><br>Each capability reports whether it works — measured, not assumed.</td>
</tr>
</table>

## How it works

```
  you speak or type
        |
        v
  +-----------+   what's on screen    +---------------+
  |   TALOS   | --------------------> | accessibility |
  |  the bar  | <-------------------- |    service    |
  +-----+-----+   elements + state    +---------------+
        |
        | picks a tool, and asks you first if it matters
        v
  +-----------+                       +---------------+
  |   tools   | --------------------> |  your phone   |
  |    40+    |                       |  other apps   |
  +-----+-----+                       +-------+-------+
        |                                     |
        |         then it CHECKS  <-----------+
        v
  "sent" only if the field emptied, the text moved into the
  conversation, and the send control disappeared.
  Two out of three, or it says it could not confirm.
```

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

**Device support**: mid-range and above. TALOS runs a wake-word model, reads the
screen continuously while acting, and can run a language model on the phone
itself — three things that are cheap on a flagship and expensive on an entry
device. ⛔ It has only been measured on two phones so far, and they already
behave differently from each other: the honest answer for anything else is «not
yet measured».

**Next: desktop, CLI and Chromebooks**, sharing the same tools and the same
contracts — so a capability written once works everywhere instead of drifting
apart. Not here yet; this line will say so when it is.

This is a young project, published because the interesting part is the
harness — how an assistant grounds itself in a real screen and refuses to lie
about the result — and that part is worth more shared than kept.

## Questions people ask

<details>
<summary><b>Does it really read my screen? Where does that go?</b></summary>

Yes, when the accessibility service is on — that is how it can press a button in
another app. What it reads goes to the model you chose, in the message you asked
for, and nowhere else. There is no TALOS server: nothing is sent to us, because
there is no us to send it to.

⛔ And it is off until you turn it on, in Android's own settings. TALOS cannot
enable it for you — Android does not allow that, and it is right not to.
</details>

<details>
<summary><b>Do I need internet?</b></summary>

Only if you pick a cloud model. With a local GGUF the phone answers by itself,
and the wake word never leaves the device in either case: the model that hears
«hey TALOS» runs locally, always.
</details>

<details>
<summary><b>What does it cost?</b></summary>

The app costs nothing and has nothing to sell. If you use a cloud model you pay
that provider directly with your own key — TALOS never sees it beyond the
device's encrypted storage.
</details>

<details>
<summary><b>Can it send a message without asking me?</b></summary>

Only if you told it to. Every capability is set to always / ask / never, and the
default for anything that leaves the phone is **ask**. The consent sheet shows
what is about to go out and to whom, and lets you edit it first.
</details>

<details>
<summary><b>Why is the code commented in Italian?</b></summary>

Because reasoning that is awkward to write does not get written. The comments
here carry the measurement that decided a number and the defect a guard exists
to prevent — they are long on purpose, and they exist because they were written
in the language the author thinks in. Identifiers and APIs are English, and
contributions in English are welcome.
</details>

<details>
<summary><b>Is it stable?</b></summary>

It is used daily and has ~5.100 tests, but it is young and it has been measured
on two devices. Treat it as something to try, not as something to depend on yet.
</details>

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md). The short version: a change is done
when it has been run on a real phone and someone looked at the screen.

The code and comments are in Italian; identifiers and APIs are in English. You
do not need Italian to contribute — issues and pull requests in English are
welcome.

## Licence

[Apache License 2.0](../LICENSE). Third-party components and the origin of every
shipped binary are listed in [NOTICE](../NOTICE).
