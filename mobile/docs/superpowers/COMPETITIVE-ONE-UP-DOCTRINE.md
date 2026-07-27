# Competitive recon & one-up doctrine

> **Owner directive, 2026-07-27:** *"strategia di ricognizione e analisi chirurgica
> dei direct competitor e dei loro punti di forza e deboli e One uppare ogni
> singola cosa per il dominio assoluto di TALOS, memorizzalo fisicamente per le
> prossime fasi."*

**Binding.** This is not a one-off study. It is the method every phase runs
before it builds, and the ledger every phase adds a row to. It extends
[vincoli ingegneristici TALOS] — *ricerca web + one-up + parity + maximum
potential + AMBITION* — by making "one-up" something you can check rather than
something you can claim.

---

## 1. The three levels, and why only one of them wins

Most competitive work stops at level 1 and calls it strategy. Naming the levels
stops us doing that.

| Level | What it is | What it buys | What it costs them to erase |
|---|---|---|---|
| **L1 — Parity** | We have the feature too | Nothing. It removes a reason to leave, not a reason to come | A sprint |
| **L2 — One-up** | Better on *their* axis: faster, cleaner, more honest | A demo that wins a comparison | A quarter |
| **L3 — Structural** | Something they cannot ship without abandoning their business model or their architecture | The market | They can't |

**Only L3 dominates.** L1 and L2 are worth doing — they are the price of being
taken seriously — but a roadmap made only of L1/L2 is a roadmap to being a
cheaper copy. Every phase must produce **at least one L3 row**, and must be able
to say *why they can't follow*.

The AMBITION constraint is exactly this: if a proposal reads as "like Claude but
ours", it has produced no L3 and does not satisfy the doctrine.

### The refusal test (verified 2026-07-27)

Positioning power comes from what a product **refuses** to do, not from what it
can do. Verified from the two products that sell this promise best:

- **Obsidian**: *"Your thoughts are yours."* → *"No one else can read them, **not
  even us**."* (source: https://obsidian.md/, fetched 2026-07-27)
- **LM Studio**: *"Natively local."* / *"never leaves your device."*
  (source: https://lmstudio.ai/, fetched 2026-07-27)

The force is in the claim made **against themselves**. A feature list is a
brochure; a refusal is a position. And a refusal is only credible when it is
**structural** — when the company could not break it even if it wanted to.

TALOS's strongest refusal, and it is literally true: **there is no server of
ours, so there is no "us" for anything to reach.** Obsidian must say "not even
us" because an "us" exists. We do not have one. That is an L3 sentence, and it
is why it is the thesis of the first-run screen.

---

## 2. The recon protocol

Run this **before** a phase designs anything. It is the concrete form of
[web-research-before-implementation] for competitive work.

**Per competitor, per capability, extract exactly five things:**

1. **What they do** — the behaviour, in one sentence, as a user experiences it.
2. **How well** — where it is genuinely good. Write this honestly; a recon that
   only finds weaknesses is a recon that was not done.
3. **Where it breaks** — the specific failure, not a vibe. "Slow" is not a
   finding; "43s to first token when a tool schema is refused" is.
4. **Why it breaks** — architecture, business model, or platform constraint.
   This is the field that decides whether a counter is L2 or L3.
5. **Source + date** — a URL and the day it was read.

**Evidence rules, non-negotiable:**

- **No source, no row.** An unsourced competitor claim is a rumour, and a
  roadmap built on rumours ships the wrong thing.
- **Dated, always.** Competitor facts rot in weeks. A stale competitive doc is
  worse than no doc, because it is trusted.
- **Re-verify before acting on a row older than 90 days.**
- **Read the primary source** — their docs, their app, their changelog. A
  listicle about them is not them.
- **Hands-on beats reading** where the app is installable. A screenshot of the
  actual failure outranks a paragraph about it.

---

## 3. The competitor map

Three rings. They are attacked differently and must not be confused.

### Ring 1 — Direct: the assistant apps people already have

ChatGPT · Claude · Gemini · Perplexity · Copilot

They win on: model quality, polish, brand trust, distribution.
They cannot follow us into: no-account local-first, BYOK across rivals, running
a competitor's model, device agency. **Not because they lack engineers — because
being the provider is the business.** This is the richest L3 seam we have.

### Ring 2 — Local-model runners on the device

PocketPal · MLC Chat · Layla · Ollama (as an endpoint) · LM Studio (desktop, but
it sets the expectation)

They win on: genuinely running models on hardware, credibility with the
privacy-minded.
They typically break on: no agentic tools, no cloud fallback when the phone is
not enough, thin memory/library, UX built by and for engineers.
**Our seam: be the app that is local-first AND does the work** — tools, memory,
documents, browsing — instead of being a chat box in front of a GGUF.

### Ring 3 — BYOK / multi-provider clients

Chatbox · Jan · Msty · LibreChat · Enchanted · OpenRouter's own UI

They win on: provider breadth, no lock-in, often open source.
They typically break on: desktop-first with a weak or absent mobile app, no
on-device models, no device agency, no evidence trail.
**Our seam: the same product identity on desktop and phone, with the phone as a
first-class citizen rather than a companion.**

### Ring 0 — Not competitors, but the language teachers

Obsidian · Signal · Proton · Standard Notes

Studied only for **how to say it**, never for what to build.

---

## 4. The one-up ledger

One row per capability. A phase may not close without either adding rows or
marking existing ones done.

**Row format:**

```
### <capability>
- Best in class: <who> — <what they do that is good>            [source, date]
- Their weakness: <the specific failure>                         [source|hands-on, date]
- Why it exists: <architecture | business model | platform>
- TALOS counter: <what we do instead>
- Level: L1 | L2 | L3
- Why they can't follow (L3 only): <the thing they'd have to give up>
- Status: proposed | building | shipped <commit>
- Verified: <date>
```

**Status legend for the seed rows below:** `VERIFIED` = a source was read and is
cited. `HYPOTHESIS` = stated as a claim to be checked by the recon protocol
before anything is built on it. Nothing here may be quoted as fact while it is
still marked HYPOTHESIS.

---

## 5. Seeded rows

### First-run positioning — **VERIFIED**
- Best in class: Obsidian — the refusal stated against itself, *"not even us"*.
  [https://obsidian.md/, 2026-07-27]
- Their weakness: an "us" exists, so the promise depends on their continued good
  behaviour and on trusting a company.
- Why it exists: they run a sync business.
- TALOS counter: *"there is no us to reach — TALOS has no backend."*
- Level: **L3**
- Why they can't follow: they would have to stop selling sync.
- Status: **shipped** `251780a`
- Verified: 2026-07-27

### Prompt cost on repeated context — **VERIFIED**
- Best in class: the providers themselves document caching; most clients never
  ask for it. [Anthropic, OpenAI, Gemini, DeepSeek docs, 2026-07-27]
- Their weakness: a client that does not send `cache_control` pays full price
  and full prefill on every agent-loop round.
- Why it exists: it takes measuring your own prefix to know it is worth it.
- TALOS counter: measured prefix (2,099 tokens, 87% tool schemas), two Anthropic
  breakpoints, OpenAI key on the prefix, Ollama `keep_alive`, and the result
  shown in the Doctor so the claim is checkable.
- Level: **L2**
- Status: **shipped** `fec60c8`
- Verified: 2026-07-27

### Onboarding — **VERIFIED**
- Best in class: nobody. NN/g finds carousels actively harmful and tutorials
  ineffective. [https://www.nngroup.com/articles/mobile-app-onboarding/, 2026-07-27]
- Their weakness: the whole category ships carousels anyway.
- TALOS counter: one honest story screen + two steps that are real needs; what
  is not built is labelled Next.
- Level: **L2**
- Status: **shipped** `aba0ce8`, `251780a`
- Verified: 2026-07-27

### Running a rival's model — **HYPOTHESIS**
- Claim to check: ChatGPT/Claude/Gemini apps cannot let you run a competitor's
  model, or a local one, at all.
- Why it would exist: being the provider is the business.
- TALOS counter: BYOK across every provider plus on-device models, chosen per
  chat.
- Level: **L3** if confirmed.
- Status: proposed — **verify before quoting**

### Device agency — **HYPOTHESIS**
- Claim to check: no mainstream assistant can act on the phone beyond its own
  sandbox; Play policy restricts Accessibility/VPN routes.
- TALOS counter: Shizuku-based, typed tools, policy engine, preview + rollback +
  audit (see the Android agent vision doc — **not open without the owner's GO**).
- Level: **L3** if confirmed.
- Status: proposed — **verify before quoting**

### Memory you can argue with — **HYPOTHESIS**
- Claim to check: mainstream assistants expose memory as a settings list, not as
  something correctable from inside the conversation.
- TALOS counter: read, correct, discard from the chat itself.
- Level: **L2/L3** depending on what the check finds.
- Status: proposed — **verify before quoting**

---

## 6. Cadence

- **Before every phase:** run the protocol on the capability that phase touches.
  No row, no build.
- **At every phase close:** update Status, and add any new weakness the work
  exposed.
- **Every 90 days:** re-verify VERIFIED rows; demote anything unconfirmed back
  to HYPOTHESIS rather than letting it quietly become folklore.
- **When a competitor ships something:** the row it threatens is re-opened, not
  argued with.

## 7. The honest part

Two failure modes this document exists to prevent, both of which have already
happened on this project:

1. **Proposing before researching.** Options invented by hand, presented as if
   they were the field. The rule is the reverse order, and it is written down
   because it was broken.
2. **Confusing "we could do that too" with an advantage.** If the answer to
   *"what would they have to give up to copy this?"* is *"nothing"*, the row is
   L1 and must be labelled L1 — not dressed up as strategy.
