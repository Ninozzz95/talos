# Changelog

What changed in each release, written for someone using the app rather than
someone reading the commits. Every version here has a matching tag and a
signed APK under [Releases](../../releases).

Numbers in this file are measured on a device, not estimated.

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
