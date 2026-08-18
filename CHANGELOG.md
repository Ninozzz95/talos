# Changelog

What changed in each release, written for someone using the app rather than
someone reading the commits. Every version here has a matching tag and a
signed APK under [Releases](../../releases).

Numbers in this file are measured on a device, not estimated.

## v0.1.12

A permission-fix release, verified on the owner's OnePlus Pad.

### Fixed

- **Granting a runtime permission no longer crashes the release build.** R8 was
  removing the Capacitor permission metadata that TALOS reads when it asks for
  microphone, notifications, contacts, location, camera, calendar or mail
  access. The release now retains that contract, and the real Android artifact
  gate checks the aliases and platform permission strings before publication.
  The grant, denial, permanent-denial and system-settings paths were exercised
  on a OnePlus Pad running Android 16 without an application FATAL.

## v0.1.11

<!-- v0.1.9 and v0.1.10 were tagged but never produced a signed APK: their builds
     failed (packaging, then a stale test delimiter). This is the release that
     ships the work, under a clean version. -->

<!-- v0.1.9 was tagged but never produced a signed APK: its first build failed in
     packaging. This is the release that ships that work, under a clean version. -->

Another crash-fix release, found on the owner's own device.

### Fixed

- **Opening Diagnostics crashed the app.** Every time. The diagnostics screen
  checks whether dictation has microphone access, and that check read a
  permission whose state the phone answered with "nothing" — the same class of
  bug as the OnePlus 13 startup crash in the last release, but this time inside
  the third-party dictation component, on a thread no JavaScript safety net can
  reach.
  - Fixed at the native layer: TALOS now wraps that component with a safe version
    that reports **unknown** instead of falling over. Verified on a real device —
    Diagnostics opens, shows its report, and stays up.

### Changed

- **The local model is no longer thrown away the moment you switch apps.**
  Before, leaving TALOS for a second discarded the model even with memory to
  spare, and coming back paid the full cold-open cost — measured at four seconds
  warm, nearly nine cold, all of it in the loading. TALOS now keeps the model for
  a short grace period and only releases it under real memory pressure, so a
  quick glance at another app doesn't cost you the wait when you return.

- **Long replies from the local model stream more smoothly.** Watching a reply
  arrive used to recopy the whole answer from scratch on every refresh, so the
  longer the reply, the more work each update cost — growing with the square of
  the length. TALOS now passes only the newly written text, keeping long answers
  as light as short ones.

## v0.1.8

A crash-fix release. The headline is a startup crash on the OnePlus 13, found on
the owner's own phone and fixed against it.

### Fixed

- **TALOS crashed on launch on the OnePlus 13.** The app died before it could
  draw anything, every time. The cause was a permission-state read that Android
  is allowed to answer with "nothing" — and on this device it does. TALOS read
  that "nothing" as a value and fell over.
  - It no longer does. A permission whose state cannot be read is now reported as
    **unknown** rather than crashing — because guessing "denied" would be
    inventing a fact, showing an "Allow" button for something perhaps already
    granted, or hiding a feature that is actually there.
  - Verified on the OnePlus 13 itself: zero crashes, launch in 1.3 seconds, the
    screen drawn. Not deduced from an exit code — looked at.

- **The local model wasted its own warm-up.** TALOS remembers the best
  thread setup for each phone and model, so it doesn't re-measure every time. But
  it wasn't noticing when the engine underneath changed — this release ships a
  new build of the local engine, and a setup measured with the old one would have
  been reused with the new. The memory now knows which engine it was measured
  with.

### Changed

- **"Always allow" is back on web search.** It had quietly disappeared: after a
  search, the safety chain would rise to its highest level and drop the "always"
  option — on the one action people use ten times a day. Searching the web is now
  an explicit exception, so the choice you make can hold for next time. The
  question still appears the first time, and still says why.

- **The local engine runs on the right cores.** On Android, the code that pins
  work to specific CPU cores was being compiled out entirely — every thread ran
  everywhere. This release picks up the upstream fix. On the owner's tablet, the
  engine now measurably prefers **six threads over eight**, where eight was not
  only slower but wildly inconsistent — one run in three collapsing to a third of
  its speed.

### Internal

- Android, the native C++ engine and the browser tests now run on every proposed
  change. A whole class of defect — including a native crash and this release's
  OnePlus 13 crash — lived in the layer the old checks never touched.

## v0.1.7

An external engineering review went through the whole codebase and found
twenty-two issues. This release closes thirteen of them, plus one the review had
missed. Every fix below was reproduced with a failing test before it was written,
and the build was installed and used on a real tablet before this went out.

### Fixed

- **A local model could have sent your conversation to a stranger.** TALOS lets
  you point it at a model running on your own machine, over plain HTTP. It
  checked that address carefully — it even refuses host *names*, because a name
  is resolved later and by someone else. But it only checked the **first hop**.
  A server answering `302 Location: https://somewhere-else` would have carried
  your prompt, and the authorization header with it, straight out of the network
  you had allowed.
  - Redirects are now refused outright, on both the streaming path and the native
    bridge, and the boundary cannot be switched off by the code that calls it.
  - The test for this stands up **two real servers** and checks whether the body
    reaches the second one. Before the fix, it did.

- **"I could not check" was being reported as "done".** When an action succeeded
  but the check that would confirm it failed, TALOS kept the success and dropped
  the doubt. For anything that changes the world — sending a message, writing a
  file — that is the wrong half to keep.
  - There are now four outcomes instead of two, and the new one refuses to become
    either neighbour. Calling it a failure is worse than calling it a success: a
    failure is an instruction to try again, and trying again is how the same
    message gets sent twice.

- **The database migration wrote a full copy of your data in the clear.** When an
  older installation moves onto a managed key, TALOS exports everything, writes
  it to disk, destroys the original and imports it back. That intermediate file
  was readable — for a few seconds, data that spends the rest of its life behind
  a PIN was plain text on the filesystem.
  - It is now encrypted, and it is written to a temporary name, read back and
    compared, and only then renamed. The old file is destroyed after that, never
    before.
  - **Journals written by an older version are still readable.** If your app was
    killed mid-migration and you update before reopening it, the new code finds
    the old file and resumes from it. Without that, an update meant to protect
    your data would have destroyed it.

- **Your PIN now protects the key with Argon2id.** The previous protection was
  PBKDF2 at 210,000 iterations, which is no longer what current guidance
  recommends. Existing PINs keep working and are upgraded silently the next time
  you unlock — and if that upgrade fails for any reason, you still get in.
  - The record now states which protection it uses, and that statement is
    authenticated: a record altered to claim weaker protection simply will not
    open.

- **A malformed backup file could freeze the app.** Backup files declare the cost
  of the protection they were written with, and TALOS obeyed that declaration
  without limits. A file claiming four gigabytes of memory would have asked a
  phone for four gigabytes. The test that found this ran for **five minutes**
  before being killed; it now finishes in milliseconds.
  - A file says what it was written with. It does not decide how much work your
    device is willing to do.

- **Any app on your phone could start TALOS's internal profiler.** A diagnostic
  tool, meant for hunting a startup problem, could be triggered from outside with
  a single command. It is now absent from release builds entirely — not disabled,
  absent, verified by reading the compiled bytecode.

- **A crash in the local engine, under the right timing.** Preparing a prompt and
  generating a reply could touch the same piece of memory from two different
  threads, one freeing it while the other read it. Everything that touches the
  engine now runs in a single ordered sequence, and anything that breaks that
  order fails immediately with a message naming both threads instead of crashing
  silently.
  - Calling the engine after closing it now reports a clear error too. Before, it
    handed the closed engine's address back to the native layer.

### New

- **A security policy for the app's own web layer.** TALOS's interface runs in a
  web view that can reach the phone's native features, so an injected script
  there would not steal a session — it would use the device. The app now declares
  what it is allowed to load and execute, and an injected script does not run.
  - The policy is checked by loading the real app in a real browser and asking it
    whether it had to block anything. That test caught a first version of the
    policy that would have prevented **everyone from unlocking their database**.

### Changed

- **The app is 6.4 MB smaller** — 42.6 MB down to 36.2 MB, measured on the same
  build twice. Unused code and resources are now removed at build time.

### Internal

- Android, the C++ engine and the browser tests now run on every proposed change.
  They did not before, and that is how the engine crash reached this codebase.
  - The browser suite turned out to be **completely broken** — all fifty-two
    tests — because a language screen loads late and covers the button the tests
    press. Nobody knew, because nothing ran them.
- Build actions are pinned to exact commits rather than moving tags, the build
  toolchain verifies its own download against a published checksum, and automatic
  updates keep those pins current.

## v0.1.6

### Fixed

- **"Hey TALOS" not answering on a tablet.** Ten attempts in a real room, at
  normal speaking volume, produced **zero** activations — the highest score was
  0.383 against a 0.50 threshold. The wake word now answers **10 out of 10** on
  the same device, in the same room, with the same voice.
  - The cause was not the model, the microphone, the room noise or the volume.
    Each of those was ruled out by measurement: attenuating the audio by 18 dB
    still scored 0.951, and at the room's real 16 dB signal-to-noise ratio the
    model still hit 0.967. It was the build that was installed.
  - The threshold stays at **0.50**, and that is a decision made from data
    rather than instinct. The ten real detections land between **0.544 and
    0.949**; the loudest thing in the room that is not the wake word reaches
    **0.319**. Raising the threshold to 0.60 would lose two detections in ten
    and prevent nothing, because there is nothing to prevent.

### New

- **TALOS no longer asks you to approve something that cannot work.** Before a
  permission card appears, TALOS now checks whether what the action assumes
  actually exists — a contact, a file, an app. If it does not, nothing is asked
  and nothing runs, and TALOS tells you what is missing instead.
  - It answers in **three** states, not two, and the third is the one that
    matters: "I could not tell". A denied contacts permission means TALOS does
    not know whether your contact exists — so it proceeds rather than claiming
    the contact is not there. Treating "I don't know" as "no" is the same
    mistake seen from the other side.

### Internal

- Two diagnostic switches for the wake word, **off by default** and turned on by
  creating a file: one writes the raw audio the model receives, the other swaps
  the microphone source. From now on "it doesn't work on my phone" is settled by
  pulling the bytes and replaying them, rather than by guessing.

## v0.1.5

### New

- **PDFs open inside TALOS.** A document TALOS generates now shows its pages in
  the app — swipe through them, close, and the conversation is still where you
  left it. Until now the card showed the name and the size and tapping it did
  nothing.
  - It renders through Android's own PDF engine, so it adds **no library to the
    app**: 31 bytes to the startup path, against the ~16 MB of native code a
    PDF library would have brought.

### Fixed

- **"Done." said out loud to a task TALOS had just given up on.** When TALOS
  drives the screen for you it ends the run by saying what happened — and it
  said "Done" whether it had finished or abandoned, because those were the same
  outcome internally. They are now two, and there is a third: if TALOS does not
  say which, you are told that too, rather than being told it worked.
- **A pending permission request swallowed the answer.** When TALOS needed your
  approval mid-task, the notice was glued onto the reply and the whole thing was
  drawn inside the notice's box — so the answer lost its formatting and the box
  filled the screen. The answer is now an answer, and the notice is a small chip
  under it.
- **"I have no web search" — said while the capability existed.** With no search
  provider key set, the two web tools are not built at all, so the model could
  not see them and concluded it had none. TALOS now says the search key is
  missing and where to add it, instead of leaving you to conclude it cannot
  search.

### Known limits

- Unchanged from v0.1.4: verified on one device, a OnePlus Pad 3 running Android
  16 with ColorOS.

## v0.1.4

Everything below is one story: TALOS presses "send" for you, and this release is
about it never lying to you about whether it did.

### Fixed

- **TALOS said "the message was sent ✓" and, in the next line, "it was not
  sent".** Both in the same answer, about a message still sitting in the WhatsApp
  input box. Four written rules told it not to, and none of them worked — because
  the sentence was not written after the send. It was written *before* the call,
  as a preamble, and the app glued the preamble and the conclusion together.
  A false opening now disappears when the tool reports it changed nothing. A true
  one stays: if the message really went, the line you already read stays where it
  was.
- **"The accessibility settings are already open" — while WhatsApp was on
  screen.** Measured from the phone's own activity log: TALOS opened them 37
  milliseconds after opening WhatsApp, and WhatsApp went on launching four more
  windows over the next 850 milliseconds and buried them. The sentence was true
  for 37 thousandths of a second. TALOS no longer races: the card carries a
  button, and the screen changes when you tap it.
- **That button used to land on a page where TALOS was not listed.** On
  OPPO/OnePlus phones the downloaded services live one level down, under
  "Downloaded apps", so "find TALOS in the list" pointed at a list without TALOS.
  It now opens the page TALOS is actually on, and falls back to the general list
  everywhere else.
- **Sending a file had the same holes, and one more.** It said "sent" on a single
  check where messages had required three since v0.1.1; it drew no card at all;
  and it told the model to open a settings page, which twice opened
  *notification access* instead — a permission that reads every notification from
  every app, offered for sending one message.
- **"That file is not in your Library" — about a file that was there, twice
  over.** When TALOS could not read the Library it reported an empty one. Not
  being able to look and there being nothing to find are two different answers,
  and only one of them was ever true.
- **Two files with the same name were a dead end.** TALOS correctly asked which
  one you meant, and then could not accept any answer you gave: it matched files
  by name, and two identical names stay identical. Answering "the first one" led
  back to the same question.
- **"Send file X to Y" often never called the send tool at all.** TALOS searched
  your Library, described what was in the files, and stopped — and once claimed,
  with no basis, that it could only send files stored on the phone. Measured
  against the real set of tools: the send tool was chosen 8 times out of 12, and
  for "write to X on WhatsApp attaching Y" it was chosen 0 times out of 3. It is
  now 12 out of 12.

### Changed, for new installs only

These are the values a phone gets when it installs TALOS for the first time.
Nothing moves on a phone that already has the app: a default is what you get
before you choose, and changing it is not permission to change your mind for
you.

- Interface text now starts at **Default** instead of Large. Every larger step
  is still one tap away in Settings, and the phone's own text-size setting keeps
  applying underneath.
- The composer starts as the **compact** bar.
- The app icon **follows the theme** you have on, without being asked.
- Choosing **"Always"** in the one-tap autonomy screen now also turns on "Let
  chats use the Library". Saying yes to everything in one gesture and then
  finding your own Library disconnected reads as a fault, not a choice.

### New

- **A card under the answer says whether it left.** "WhatsApp — NOT sent · screen
  reading is off", in words and not only in colour, with the reason when we know
  it. It is drawn by the app from what the phone reported, so it stands even when
  the sentence next to it says something else.
- **When two files share a name, you pick one with your finger.** The list comes
  from your Library to the screen and each row is a button — no id to retype, no
  number to guess.

### Known limits

- Verified on one device: a OnePlus Pad 3 running Android 16, ColorOS. The
  settings page that contains TALOS is found by asking the phone, with a fallback
  everywhere else — but nobody has seen that fallback on a non-OPPO phone yet.
- Unchanged from v0.1.1: opening an app that is already running resumes it where
  you left it, so a screen task can land inside the wrong screen. TALOS says it
  could not get there rather than claiming it did.

## v0.1.2

### New

- **You can make TALOS your assistant without plugging anything in.** Until now,
  if Android did not show the "become the assistant" dialog, the only way left
  was the ADB bridge — a cable or wireless debugging. And Android never shows
  that dialog: the assistant role is declared non-requestable in AOSP itself, so
  the request opens and closes in 53 milliseconds with nothing on screen.
  Measured on device. TALOS now takes you straight to the system page where you
  pick your assistant, with TALOS in the list. The bridge is still there, but
  last.
- The button that used to promise "one tap and Android asks you" now says what
  actually happens. A prompt nobody will ever see is worse than no promise.

### Fixed

- **Two of the ten permission rows never said whether they were granted.** "Where
  you are" and "Files you choose" showed a dashed circle and no words, while the
  other eight said "Allowed" — so the absence of a word was doing the work of a
  word, on a page whose only job is answering "do you have it or not?". Anyone
  using a screen reader had no way to tell at all.
  - Location is a real permission and the app simply never asked the system
    about it. It does now — and it checks approximate location only, because
    Android 12 lets you grant approximate without precise, and checking both
    would have reported "not granted" to someone who had just granted it.
  - Files has no permission behind it — you grant access by picking the file —
    so the row now says so instead of looking like something you forgot.

### Known limits

- Unchanged from v0.1.1: opening an app that is already running resumes it where
  you left it, so a screen task can land inside the wrong screen. TALOS says it
  could not get there rather than claiming it did.

## v0.1.1

### New

- **The screen is read in the order you see it.** Numbering used to follow the
  accessibility tree, which is the order Android *built* the screen in, not the
  order it is drawn. On three real screens, only 0 of 19, 1 of 18 and 2 of 32
  indices matched what was actually on the glass. "Tap the first item" now
  means the first item from the top.
- **Controls with no text of their own get a name.** An icon-only button used
  to be anonymous, so there was no way to refer to it. It now borrows the first
  text found inside it, with a bounded search. The sticker button in a keyboard
  is addressable; before, it was a blank.
- **Three more ways to act:** long press, set a slider to a value, and open the
  recents screen — six actions in total, up from three.
- **Sliders are recognised by the range they expose,** not by their class name.
  This is why the previous build could describe a volume slider and not move
  it: the control reports itself as neither clickable nor scrollable, so every
  name-based check missed it.
- **Setting a value is checked by reading it back.** If the value did not move,
  TALOS says so — and distinguishes a control that refused, one that moved
  somewhere else, and one that moved partway.
- **First run says more and reads shorter.** The opening story covers eight
  things instead of five, including the three that were true in the README but
  missing from the first screen anyone sees: that TALOS acts inside other apps,
  that "done" is a verified state, and that it hears you with the screen off.
  Each is a line you open if you want it, so the page fits one screen instead
  of being a wall to scroll.

### Fixed

- **"Wi-Fi" and "wifi" did not match.** The hyphen became a space, so the most
  common word on an Android settings screen could not be found by the way
  people actually type it. Same class of miss for "E-mail", "Play Store" and
  "Non disturbare".
- **Automatic saving of generated documents was off, and nothing could turn it
  on.** A migration from a security review switched it off on every install —
  new ones included — while the default next to it still said on. A document
  the model made and you did not save scrolled away with the chat. It is on
  again, and turning it off on purpose now sticks.

### Known limits

- Opening an app that is already running resumes it where you left it, exactly
  as tapping its icon does. So "open Settings and tap the first item" can land
  inside whichever Settings screen was open last. TALOS notices and says it
  could not get there, rather than claiming it did — but it does not yet find
  its own way back to an app's starting screen. Forcing the app to restart
  would fix the navigation and throw away your half-written message with it, so
  it doesn't.

## v0.1.0

First public build. Signed APK, arm64-v8a, Android 8.0 or later, with build
provenance you can verify from the release page.
