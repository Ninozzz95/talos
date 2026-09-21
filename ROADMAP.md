# Roadmap and engineering direction

Back to the [README](README.md). Everything on this page is a **direction, not a claim about shipped functionality**, unless a measurement says otherwise.

## Coming soon: a coding agent, built on the same rules

<img src="docs/immagini/tablet-9-coding-agent.png" alt="The coding agent harness UI mid-session, with a live tool feed and a context rail">

*(Internal build shown in Italian — the UI text is being translated to English before this ships.)*

TALOS's own coding agent is under active development, on the same principles as the rest of the project: typed tools, explicit authority, and results that are checked instead of assumed.

It already runs against real projects today — read/search/edit/test, a sandboxed shell (WSL2 first, honestly labelled `none` when no isolation is available, never a silent bluff), and an SSRF-safe page reader ported from TALOS's own on-device web-reading policy (DNS pinning, redirect revalidation, no private-network access) — driven through the same kind of typed-tool loop already shipping in the app, benchmarked against other coding agents on cost-per-solved-task rather than vibes.

What's still ahead: bringing it into the phone itself, a persisted session model with fork/resume/compact, and the same UI surfacing on both the desktop tooling and the mobile app instead of two implementations of the same idea.

**This is a roadmap direction. It does not run inside the shipped Android app yet.**

## Current engineering direction

TALOS is moving toward a **next-generation adaptive harness**, rather than tighter coupling to one model:

```text
task
× model
× provider
× device
× permissions
× execution environment
      │
      ▼
compiled harness profile
```

The goal is to give different models different tool surfaces, context policies and execution strategies based on measured performance.

Active directions also include:

- the coding agent harness described above;
- a per-device performance profile that reads real headroom (CPU/GPU/thermal margin) instead of guessing from a chipset name;
- a controlled qualification lane for candidate engine updates, so a change to the inference engine is verified before it becomes the default rather than after;
- code intelligence and execution backends;
- durable task/operation state;
- stronger proof and reversible changes;
- optional backend/device synchronization.

**These are roadmap directions, not claims about shipped functionality.**

## On how this was built

TALOS was written with heavy use of AI coding editors, including Claude Opus 5 and GPT-5.6.

Those tools did not decide the product.

The vision, ideas, architecture, testing, implementation decisions and operational steps came from **one human mind**. Every measured number in the README comes from a real-device test; guards exist because the failure they prevent was encountered and investigated.

Using AI this heavily to build software is a legitimate point of disagreement. The project is here to be installed, tested and judged by its actual behavior.
