# TALOS

A local-first agentic assistant that remembers what matters, controls your device and runs models on it — private by design.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-5%2C161%20passing-brightgreen.svg)](#building-it)
[![Platform](https://img.shields.io/badge/platform-Android%2014%2B-3ddc84.svg)](#status)
[![Local first](https://img.shields.io/badge/local--first-no%20backend-blueviolet.svg)](#local-first-is-not-a-setting)
[![CI](https://github.com/Ninozzz95/talos/actions/workflows/ci.yml/badge.svg)](https://github.com/Ninozzz95/talos/actions/workflows/ci.yml)

<!--
  ⛔ IL BADGE DELLA CI È ARRIVATO SOLO ADESSO, ED È IL PUNTO.
  Per giorni non c'era, di proposito: la CI esisteva ma non era mai girata, e
  un badge verde per finta è peggio di un badge assente.
  E fino al 2026-08-16 sarebbe stato ROSSO A BUILD SANO — 5.161 test passati e
  `vitest run` che usciva con 1 per quattro errori di teardown. Curato quello,
  il badge dice una cosa vera. Se torna rosso, è rotto qualcosa davvero.
-->

## Local-first is not a setting

There is no TALOS server. Not one that is optional, not one that is off by
default — **there is no backend at all**, so there is nothing to opt out of.
Your conversations, your documents and what TALOS remembers are encrypted on
the phone, and the only thing that ever leaves it is the message you chose to
send to the model provider you picked yourself.

Three things run on the device, with no network at all:

| | |
| --- | --- |
| **The model, if you want** | llama.cpp is compiled into the app. Put a GGUF on the phone and the whole conversation — reasoning, tool calls, answers — happens with the radio off. |
| **The wake word** | «hey TALOS» is recognised by a 868 KB ONNX model **trained in this repository**. No Google hotword, no cloud round-trip, no audio stored. |
| **Everything it knows** | Chats, Library documents and memories live in an encrypted store on the phone. Search runs inside your own text. |

Cloud models are supported, and many people will use them — they are still the
better answer for hard questions today. The point is that it is **your**
decision, made per conversation, and that the app does not stop being useful
when you say no.

---

## See it

<img src="docs/immagini/tablet-1-table.png" alt="A model comparison built from live web sources, on a tablet">

**Ask something that takes real work.** TALOS searches, compares, and tells you
what it would pick — with every source it read, and a note about the ones it
could not verify.

### Without leaving the app you are in

<table>
<tr>
<td width="33%"><img src="docs/immagini/phone-5-assistant-listening.png" alt="TALOS listening over the home screen"></td>
<td width="33%"><img src="docs/immagini/phone-3-assistant-alarm.png" alt="An alarm set from the assistant bar, with its card"></td>
<td width="33%"><img src="docs/immagini/phone-4-assistant-torch.png" alt="The torch turned on, with a live switch and a verification line"></td>
</tr>
<tr>
<td><b>Call it from anywhere</b><br>The bar opens on top of whatever is on screen. It does not take you into an app and leave you there.</td>
<td><b>It does the thing</b><br>"Set an alarm for tomorrow at seven" — and the alarm comes back as a card, not as a sentence you have to trust.</td>
<td><b>And proves it</b><br>A live switch you can still press, and a line that says the phone was actually checked.</td>
</tr>
</table>

### What it remembers, and what it knows about your phone

<table>
<tr>
<td width="33%"><img src="docs/immagini/phone-1-memory-write.png" alt="Teaching TALOS something it will remember"></td>
<td width="33%"><img src="docs/immagini/phone-2-memory-screen.png" alt="The memory screen, with scope and type on every entry"></td>
<td width="33%"><img src="docs/immagini/tablet-4-phone.png" alt="TALOS reporting the real state of the phone"></td>
</tr>
<tr>
<td><b>Teach it once</b><br>Say what you want remembered, in the middle of a normal conversation. It saves it and tells you it did.</td>
<td><b>And see everything it kept</b><br>Every memory is on your device, scoped, typed, and deletable — and can never override a security rule.</td>
<td><b>It reads your phone, and says what it cannot</b><br>Battery, storage, network — measured. When a capability is unavailable it says so instead of guessing.</td>
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

**Runs a model on the phone.** llama.cpp is built into the app, not shelled out
to another one. Browse GGUF models from Hugging Face, see which ones actually
fit your device's memory *before* downloading, and run them offline. The same
tool contracts apply whether the model is a 3B on the phone or a frontier model
behind an API — a capability written once works on both.

**Remembers what matters, and shows you all of it.** Tell it something in the
middle of a conversation and it keeps it, typed and scoped: a preference, a
project fact, a procedure. Every memory is visible on one screen, editable,
deletable — and injected as *untrusted disclosed context*, so it can never
override a security rule.

**Keeps your documents on your phone.** Hand it a file and it goes into an
encrypted Library that is searchable inside the text. Nothing is uploaded. If
you ask a question about a document, the reading happens here.

**Listens for its name, locally.** «hey TALOS» is recognised by an ONNX model of
868 KB, trained in this repository. Always-on, no network, no audio kept — and
with the bridge connected it keeps listening with the screen off, because the
phone's own battery saver would otherwise stop it after three minutes.

**Talks to your phone.** Torch, volume, alarms, wallpaper, battery, storage,
network, do-not-disturb. Reads your calendar and your unread mail count. Answers
"what do I have tomorrow" from the actual calendar, not from its own notes.

**Acts inside other apps.** Opens an app on the right screen, fills a field,
presses the button, and then verifies it actually happened. The same machinery
works on apps it has never seen: it reads the accessibility tree, it does not
carry a list of hardcoded apps.

**Answers about where you are.** "A restaurant near me tonight" reads the phone's
location at that moment — and does not read it for questions that have nothing
to do with a place.

## What makes it different

**It never claims what it did not verify.** «Opened» is not «done». When TALOS
sends something inside another app, it does not report success because a
function returned — it looks at the screen afterwards:

```
sent                       ← only after all three agree
  field emptied            ← the text left the input
  text migrated            ← it is now in the conversation, not in a draft
  send control gone        ← the button that would send it no longer exists
```

Every action that can be checked, is checked, and the answer distinguishes *it
worked*, *it did not work*, and *I could not confirm* — three different things a
person can act on. The third is the one most assistants never say.

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
npx vitest run               # 5,161 tests, must be green
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

**Runs on Android 14+** — phones, tablets, and Chromebooks, which run Android
apps natively.

**Tested on:**

| device | OS | notes |
| --- | --- | --- |
| OnePlus 13 | Android 15 · ColorOS | daily driver |
| OnePlus Pad 3 | Android 15 · OxygenOS | tablet layout |

⛔ Two devices is a small sample, and they already behave differently from each
other — the accessibility service, the assistant gesture, the lock screen and
the battery saver all behave differently between the two ROMs. Some of what
Android documents simply is not true on a given phone, and the only way to know
is to measure it there. If TALOS misbehaves on yours, that is useful and worth
an issue.

**Mid-range and above.** TALOS runs a wake-word model, reads the screen while it
acts, and can run a language model on the device itself — cheap on a flagship,
expensive on an entry phone.

**Next: desktop and a CLI**, sharing the same tools and the same contracts, so a
capability written once works everywhere instead of drifting apart. Not here
yet; this line will say so when it is.

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

It is used daily and has 5,161 tests, but it is young and it has been measured
on two devices. Treat it as something to try, not as something to depend on yet.
</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: a change is done
when it has been run on a real phone and someone looked at the screen.

The code and comments are in Italian; identifiers and APIs are in English. You
do not need Italian to contribute — issues and pull requests in English are
welcome.

## Licence

[Apache License 2.0](LICENSE). Third-party components and the origin of every
shipped binary are listed in [NOTICE](NOTICE).
