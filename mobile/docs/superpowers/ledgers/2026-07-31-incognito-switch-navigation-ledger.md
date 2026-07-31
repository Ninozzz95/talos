# Incognito switch — the chat that came back

Date: 2026-07-31
Source: owner screen recording, `Record_20260731094223`, 32s, on r17.
Status: fixed, gated. One pre-existing gate reported RED, untouched.

## What the recording shows

Read frame by frame (1 fps, then 10 fps around the taps):

| t | what happens |
|---|---|
| 00:22 | ⋮ opened inside a chat with a generated image. Menu reads **Modalità incognito** — correct, the r17 switch reflects its state. |
| 00:24 | menu fades, chat unchanged. The tap did not land on the item (the history count is still 9 at 00:25, and the chat is still there at 00:29). |
| 00:26 | drawer → Nuova chat. Blank chat, ordinary welcome. |
| 00:28 | ⋮ → **Modalità incognito**. One frame shows it working: badge, «Niente di tutto questo verrà ricordato», the **Modalità normale** pill. |
| 00:28 +0.1s | the app is back in the image chat, with its messages on screen. |

So: incognito was entered, and something threw him out of it one frame later.

## Root cause — one line, and not about incognito

`chat.deleteSession` obeyed the durable side's nomination unconditionally:

```ts
const nextId = await repository.deleteSession(sessionId)
…
activeSession.value = next          // ← whatever the durable side nominated
messages.splice(0, messages.length, ...restored)
```

A repository nominates a replacement **whenever the row it holds as active is
the one that went**. While you are in a temporary chat the durable side still
holds the PREVIOUS one, because a temporary chat is never written there. The
switch then cleans up the blank chat it replaced — and that delete nominated
the most recent surviving conversation, which the store applied to the screen,
messages and all.

The rule that was missing is general: **deleting a chat you are not in is not
navigation.** Incognito is only the case where the two sides disagree.

## Second finding, same pipeline — a rule written three times

`switchModeOrThrow` (ChatScreen) deleted the chat being left **unconditionally**,
with a comment asserting it was "always empty — that is the only condition under
which either button is offered". That was true of where the button sat, not of
the code: the ⋮ menu offers incognito from ANY chat, and that copy was one wiring
change away from destroying a conversation with no confirmation and no undo.

Three call sites, three different guards: the sidebar checked emptiness, the
chat screen asserted it, leaving incognito checked nothing. Now one rule, in
`src/lib/chat/modeSwitch.ts`:

- an incognito chat is discarded even full — «sparisce quando esci» is the
  promise it was opened on;
- an empty chat is discarded, or every press leaves a blank one in the history;
- **anything else is kept.** Pressing a mode switch is not asking to delete what
  you wrote.

## Research checkpoint (regola bloccante)

Queries: *ChatGPT temporary chat convert existing conversation*; *Claude
incognito temporary chat 2026 existing conversation*.

- ChatGPT: no convert button at all. The advice is to abort and restart in a
  fresh chat; conversion is an open feature request.
- Claude: incognito **opens a new** temporary conversation (ghost icon /
  Ctrl+Shift+I) and "incognito chats can't be reopened or converted"; also
  unavailable inside projects.

Impact: TALOS's "one door, and it always opens a NEW chat" is parity with both,
and matches what the owner independently required. **No design change.** Where
TALOS is ahead: the switch is a single control that reads its own state
(«Modalità incognito» ⇄ «Modalità normale») instead of a toggle you have to
remember; incognito also withdraws the *revealing tools*, not just the context
injection; and the provider notice states plainly that the provider still
receives the conversation — neither vendor says this at the point of use.

## Changes

| file | change |
|---|---|
| `src/stores/chat.ts` | `deleteSession` follows the nomination only when the chat on screen is the one deleted. |
| `src/lib/chat/modeSwitch.ts` | new — the discard rule, once. |
| `src/App.vue` | the two menu handlers collapse into one `switchChatMode`, which uses it. |
| `src/screens/ChatScreen.vue` | the welcome pill uses it too; its asserted guard is now an enforced one. |

## Proof

- `tests/unit/chat/deletingAnotherChatDoesNotMoveYou.test.ts` — 4 tests, real
  router over two repositories. **Watched RED**: landed on `local-1`, the image
  chat, with its message on screen — the video, reproduced in a test.
- `tests/unit/chat/modeSwitchDiscard.test.ts` — 5 tests on the rule itself.
- `tests/e2e/mobile-incognito-switch.e2e.spec.ts` — 3 journeys on a real build.
  **Watched RED against the pre-fix bundle**: "entering incognito leaves you in
  incognito, and stays there" failed with the old conversation on screen.
  The assertion waits for the history count to settle first — asserting the badge
  immediately would have passed even while broken, because it *did* appear.

Gates: typecheck ✓ · 2642 unit ✓ · 82/82 e2e ✓ · parity ledger 9/9 ✓.

## Reported, not fixed: the weight gate is RED at HEAD

`npm run build` fails its own budget check **before this work and after it,
identically**:

```
TALOS_INITIAL_CSS_BUDGET_EXCEEDED: 156599 CSS bytes exceeds 150000 bytes
```

Verified by building `a214983` with these changes stashed: same 156599 bytes.
`dist/` is written before the check runs, which is why r17 was produced anyway.
The budget has NOT been raised — raising it would hide the fact rather than
answer it. It needs its own weight pass (one 156KB Tailwind sheet, ~118KB of it
generated utilities); it is not a correctness defect and it does not block this
fix.
