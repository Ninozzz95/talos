# Research dossier - P0 chat/global saved-link parity

Date: 2026-07-28  
Subsystem: TALOS mobile Library / per-chat media  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root cause

The global Library turns a `web_source` artifact into a first-class link row:
page title, host, saved date, encrypted-copy action, and original-browser
action. `Media in this chat` uses the same underlying files but renders each
source through the generic file row, so the primary identity becomes
`something.md` and the browser address disappears.

The taxonomy also drifts: global calls the collection `Links`; chat calls the
same records `Sources`. The data adapter `talosSavedLinkRows()` is already
canonical and security-hardened, but only the global screen consumes it. The
global row markup itself is inline, so there is no reusable visual/interaction
contract.

## Current competitor and standards research

Accessed 2026-07-28:

1. [OpenAI: File storage and Library in ChatGPT](https://help.openai.com/en/articles/20001052-library-for-chatgpt)
   says uploaded and generated files are automatically retained in one Library
   for later discovery and reuse.
2. [Claude: Upload files to Claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude)
   distinguishes files scoped to an individual chat from project files kept
   for persistent cross-chat reference.
3. [Claude: Create and edit files](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
   keeps generated files downloadable from their conversation and exposes a
   system preview/app on mobile.
4. [Perplexity: How does Perplexity work?](https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work)
   treats source transparency and links to original material as a core product
   behavior.
5. [WCAG 2.2 SC 3.2.4: Consistent Identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html)
   requires controls with the same function to be identified consistently.
6. [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps)
   retains the 48dp minimum touch-target baseline used elsewhere in TALOS.

## Upstream decision

**ADAPT behind one AVM-owned row component.** Competitors establish separate
chat/global scopes, durable file reuse, direct downloads, and transparent
source links, but none of the inspected documentation describes the combined
TALOS contract: a live original address paired with an encrypted local snapshot
that remains inspectable if the page changes or disappears.

TALOS keeps that one-up and makes it consistent:

- one shared saved-link row in global and chat-scoped Libraries;
- one user term, `Links`;
- title and host as the visible identity, never the `.md` storage filename;
- separate, explicit controls for the retained copy and the live browser page;
- the already-canonicalized `http(s)` URL from `talosSavedLinkRows()`.

No new dependency is suitable. Existing Vue, Lucide, TALOS tokens,
`talosSavedLinkRows()`, and the system-browser bridge cover the full contract.
Duplicated markup, a second URL parser, and a decorative favicon fetch are
rejected for drift, security, privacy, and network reasons.
