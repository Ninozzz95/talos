# I-10 — reverse image search: what actually exists in 2026

Date: 2026-07-29
Status: research checkpoint. **No implementation. No upstream chosen without the
owner's decision on the two questions at the end.**
Trigger: owner, "fai una ricerca di tutto il web… massimo potenziale, nessun
compromesso."

---

## 0. The distinction almost every article blurs

Two different products share one name, and conflating them is how projects end
up shipping the wrong thing:

**A — Provenance lookup.** *"Where does this exact image appear on the web?"*
Requires a crawled, web-scale index of image fingerprints. **This cannot be
self-hosted.** Not by us, not by anyone. Google, TinEye and Yandex each spent
years crawling. Any project advertising a "self-hosted reverse image search" is
doing B and calling it A.

**B — Similarity over a corpus you own.** *"Which of MY images look like this?"*
CLIP/pHash embeddings plus a vector store. Fully self-hostable, and runnable
on-device.

The owner's request (R9-D: attach an image in chat, ask where it comes from) is
**A**. The honest engineering answer is that A requires a third party — so the
question is not *whether* to use one, but *what the image has to give up to get
an answer*, and *how much can be answered before reaching for one at all*.

That reframing is where the design below comes from.

---

## 1. Provenance lookup (A) — verified state of the market

| Option | Accepts direct upload? | Retention | Price | Verdict |
|---|---|---|---|---|
| **TinEye API** | **Yes**, direct upload | *"never saves the images you upload"*, deleted immediately after fingerprinting, never added to their index | $200 / 5,000 searches, **no free tier** | **Adopt** — best privacy posture on the market |
| **Google Cloud Vision `WEB_DETECTION`** | **Yes**, inline base64 | online requests *"processed in memory and not persisted to disk"*, not shared with third parties, covered by the Cloud DPA | 1,000 units/month free, then $3.50 / 1,000 | **Adopt** — the only realistic free tier |
| SerpApi / Zenserp / ScrapingBee / SerpWow | **No — requires a PUBLICLY accessible URL** | n/a | from $75/mo | **Reject, disqualifying** |
| Yandex | only via third-party scrapers | undocumented | varies | **Reject** — no official API |
| Bing Visual Search | — | — | — | **Reject** — API retired |
| Apify "Google Lens API" | unofficial actor | undocumented | varies | **Reject** — unofficial |

### The disqualifier, stated plainly

SerpApi and every scraper-proxy in that row require the image to already live at
a **publicly accessible URL**. Using them means uploading the user's private
photo to public cloud storage first. That is not "sharing with a vendor" — it is
**publishing it on the open internet**, permanently, before the search even
runs. SerpApi's own documentation tells you to put it in an S3 bucket with
public read.

For a local-first app with an encrypted store, that is not a trade-off to weigh.
It is the one compromise we refuse, and it removes the entire category that most
competitors quietly rely on.

### There is no official Google Lens API

Verified: Google has not released a public Lens API. Everything marketed as one
is a scraper. Cloud Vision is the official path, and note that Vision **Product
Search is now in maintenance mode** — `WEB_DETECTION` is the surviving feature
and is what we would use, but the platform is not static and the adapter must
assume it can change.

---

## 2. What the competitors actually do

> "ChatGPT, Perplexity, and Grok can analyze images, but don't perform direct
> reverse searches yet."

- **ChatGPT** with Web Search: the model *looks* at the image, forms a textual
  guess, and searches the web for that text. Semantic, not visual matching.
- **Perplexity**: image understanding and captioning. No provenance lookup.
- **Gemini app**: image analysis, one image at a time. Lens is a separate
  consumer product with no API behind it.

**Nobody in the AI-chat category performs a true visual-index lookup.** The
category leaders answer a *different, easier* question and let users assume it
was the hard one. That is the opening.

---

## 3. What can be answered WITHOUT sending the image anywhere

This is the part the market ignores, and it is where the structural advantage is.

### 3a. C2PA Content Credentials — offline, cryptographic, zero egress

Specification v2.3, released January 2026. Signed manifests carry the capture
device, the edit history, and whether the content was AI-generated.

The decisive property: **"Any compliant viewer can verify the manifest offline,
with no central database or internet check required."**

Coverage is no longer marginal: **Samsung Galaxy S25 and Google Pixel 10 sign
natively**, and OpenAI, Adobe, Google, Meta, Microsoft, Sony and the BBC are in
the coalition — which means a growing share of both camera photos and AI-generated
images arrive already carrying signed provenance.

Upstream is ready for us: **`contentauth/c2pa-android`**, an official AAR from
the Content Authenticity Initiative wrapping `c2pa-rs` over JNI. It reads and
validates manifests from files and streams. It drops into the same Capacitor
native-plugin pattern TALOS already uses for safe-web and file export.

For an image that carries credentials, TALOS can answer *who made this, when,
with what, and was it AI-generated* — **instantly, offline, for free, with zero
bytes leaving the device.** No competitor chat app does this.

### 3b. The user's own Library — zero egress

`phash-js` computes perceptual hashes **in the browser without canvas**. dHash
(64-bit, gradient-based) is the cheap screen; DCT pHash (64/256-bit) is the
stronger one. Hamming distance ≤ 5 indicates a near-duplicate.

That answers *"do I already have this? where did I see it before?"* against the
Library, offline and instantly — and it reuses the RAG index work already done.

**MobileCLIP** would add semantic similarity, but the honest numbers matter:
**MobileCLIP2-S2 is 143 MB, ~450 ms per inference.** The current APK is 43 MB.
It cannot ship inside the APK — it would have to be an optional signed download,
exactly as the model-catalogue rule already requires. **Recommendation: defer.**
pHash covers near-duplicates at a fraction of the cost; CLIP is a later slice
with its own benchmark.

---

## 4. Proposed architecture — four layers, escalating cost and exposure

The rule: **never spend privacy or money on a question a cheaper layer already
answered.**

```
L0  C2PA manifest              offline · free · 0 bytes leave the device
L1  pHash vs. own Library      offline · free · 0 bytes leave the device
L2  BYOK vision + our web_search   1 existing key · no new vendor · description leaves, image may not
L3  TinEye / Vision WEB_DETECTION  explicit consent · BYOK · the image leaves
```

**L0** — read Content Credentials. If present and valid, much of the question is
already answered, signed, and verifiable offline.

**L1** — perceptual hash against the Library. Answers recurrence and duplication.

**L2** — the multimodal model the user **already pays for** describes and
identifies the subject; the resulting query goes through TALOS's **existing**
`web_search` tool, and the citation-verification machinery from Deep Research
checks the passages. This is what ChatGPT does — except ours is auditable and
the sources are verified rather than asserted. Crucially: **no new vendor and no
new credential**, which is what owner decision D0 (no key ships in the APK)
demands.

**L3** — only here does the image itself leave, and only after an explicit,
per-search consent that names the provider. Adapter with two implementations
behind one TALOS-owned, provider-neutral interface.

Each layer reports what it found and what it cost. The user sees which layer
answered.

---

## 5. Honest limits — not to be hidden

1. **L3 cannot be self-hosted.** A web-scale visual index requires crawling the
   web. This is a hard limit of physics and economics, not of our effort.
2. **TinEye has no free tier** ($200 minimum). Google Vision's 1,000 free
   units/month is the only realistic default for a personal user — so Vision is
   likely the practical primary despite TinEye's better privacy terms.
3. **Every L3 provider is a key the user must bring** (D0). TALOS ships none.
4. **Grounding-with-image is unverified.** One secondary source states Gemini's
   Search grounding "isn't supported for multimodal prompts"; the primary
   documentation neither confirms nor denies it. Our L2 design does not depend on
   it — we use our own `web_search` — but the claim must not be repeated as fact
   until a real API probe settles it.
5. **C2PA coverage is partial and growing.** L0 answers for images that carry
   credentials. Absence of a manifest proves nothing, and TALOS must say so
   rather than implying the image is suspect.
6. **MobileCLIP is deferred**, with reasons and numbers above.

---

## 6. Two decisions I will not take alone

**Q1 — Consent model for L3.** The image leaves the device. Options: ask every
single time; ask once per chat; a persistent per-provider grant revocable in
settings. My recommendation: **ask every time by default**, with "always allow
for this provider" available — matching the tool-authorization contract from R9
rather than inventing a second consent language.

**Q2 — Scope of the first slice.** L0+L1 (offline only, zero egress, no key, no
consent flow needed) is shippable on its own and already beats every competitor
on the questions it answers. L2+L3 is the larger build. My recommendation:
**L0+L1 first as a complete, useful feature**, then L2, then L3.

---

## 7. Sources

Verified 2026-07-29.

- Mixpeek, *Best Reverse Image Search APIs in 2026* — https://mixpeek.com/curated-lists/best-reverse-image-search-apis
- TinEye, *Does TinEye keep images I upload during a search?* — https://help.tineye.com/article/244-does-tineye-keep-images-i-upload-during-a-search
- TinEye, *Security and privacy* — https://help.tineye.com/article/272-security-and-privacy
- TinEye API pricing — https://blog.tineye.com/new-image-search-pricing/
- Google Cloud, *Detect Web entities and pages* — https://docs.cloud.google.com/vision/docs/detecting-web
- Google Cloud, *Vision Data Usage FAQ* — https://docs.cloud.google.com/vision/docs/data-usage
- Google Cloud, *Vision API deprecations* — https://docs.cloud.google.com/vision/docs/deprecations
- Google Cloud, *Vision pricing* — https://cloud.google.com/vision/pricing
- SerpApi, *Uploading Images and Searching with Google Lens* (public-URL requirement) — https://serpapi.com/blog/uploading-images-and-searching-with-google-lens-via-serpapi/
- SerpApi, *Google Reverse Image API* — https://serpapi.com/google-reverse-image
- Microsoft, *Bing Search API retirement* — https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- Content Credentials (C2PA) — https://contentcredentials.org/
- `contentauth/c2pa-android` — https://github.com/contentauth/c2pa-android
- CAI, *Mobile libraries* — https://opensource.contentauthenticity.org/docs/mobile/
- `contentauth/c2pa-rs` — https://github.com/contentauth/c2pa-rs
- `freearhey/phash-js` — https://github.com/freearhey/phash-js
- Mixpeek, *Perceptual image hashing* — https://mixpeek.com/guides/perceptual-image-hashing-near-duplicate-detection
- Apple MobileCLIP2 ONNX — https://huggingface.co/plhery/mobileclip2-onnx
- Gemini API, *Grounding with Google Search* — https://ai.google.dev/gemini-api/docs/google-search
- Gemini API, *Image understanding* — https://ai.google.dev/gemini-api/docs/image-understanding
- Tom's Guide, *You can reverse image search using ChatGPT* — https://www.tomsguide.com/ai/you-can-reverse-image-search-using-chatgpt-heres-how
- Perplexity, *Uploading Images* — https://www.perplexity.ai/help-center/en/articles/10354840-uploading-images-on-perplexity
- OWASP LLM01:2025 Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
