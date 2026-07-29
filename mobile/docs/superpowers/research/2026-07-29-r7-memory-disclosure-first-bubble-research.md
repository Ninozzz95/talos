# R7 research - first-bubble memory disclosure

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

Every send with an active TALOS memory correctly persists a non-empty
`metadata.used_memories` array on that user turn and injects the corresponding
untrusted block only into the provider payload. The message list currently
turns every such array into an `N memory used` pill, so an ordinary multi-turn
chat repeats identical chrome on every user bubble.

This is a presentation defect, not a retrieval or persistence defect. Removing
later `used_memories` values would destroy per-turn provenance and could
desynchronize the visible claim from the model input. The fix must therefore
deduplicate only the rendered pill.

The chat view is keyset-paginated in chronological order. The newest 40
messages load first and older pages are prepended. A correct view-level rule
must keep at most one pill in the materialized window and deterministically
move it to the newly earliest memory-bearing message when an older page is
loaded. It must not mutate any message or introduce a second persistence flag.

## Current official and mature references

Accessed 2026-07-29:

1. OpenAI Memory FAQ:
   <https://help.openai.com/en/articles/8590148-memory-faq>
   - exposes personalization sources through one consistently identified book
     control below a response;
   - lets the user inspect why a memory was used and correct it;
   - keeps memory management in a dedicated Settings surface.
2. Claude Help, chat search and memory:
   <https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context>
   - makes prior-chat use visible through citations;
   - exposes exact memory entries and controls in a dedicated Memory panel;
   - includes memory data in exports.
3. Gemini Apps Help, personalization with memory:
   <https://support.google.com/gemini/answer/16598469>
   - centralizes the on/off control in Personal Intelligence;
   - lets users explicitly check whether past-chat information was used.
4. W3C WCAG 2.2, Understanding SC 3.2.4:
   <https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html>
   - repeated functions and their accessible identification must remain
     consistent to reduce cognitive load and preserve predictability.

## Upstream decision

**ADAPT** the competitors' shared transparency pattern: keep one consistently
identified inline memory disclosure plus the existing Memory station, while
retaining complete per-turn provenance in local message metadata.

The owner explicitly prefers a calm thread rather than OpenAI-style repeated
per-response chrome. TALOS will render the existing localized pill only for
the earliest non-system message with a non-empty `used_memories` array in the
currently materialized chronological window. When pagination prepends older
messages, the same deterministic rule moves the one pill earlier. At no point
does the rendered thread contain more than one pill.

**REJECT** deleting later `used_memories`, writing a presentation-only marker
into message/session storage, querying the entire database from a render
component, grouping by memory title/count, or adding a new dependency. Those
options respectively lose evidence, create schema/state debt, violate the UI
boundary, reintroduce repeated badges, or add no capability.

No upstream package or protocol is integrated; the relevant current product
contracts are pinned by access date and permanent local conformance tests.
