# Native model provider adapters

Pinned 2026-09-08 in package-lock.json with npm integrity hashes:

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| ai | 7.0.93 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/anthropic | 4.0.49 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/anthropic |
| @ai-sdk/google | 4.0.64 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/google |
| @ai-sdk/openai | 4.0.61 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/openai |
| zod | 4.5.4 | MIT | https://github.com/colinhacks/zod |

Original LICENSE files are shipped by the installed npm distributions. Preserve
those files when redistributing the application and its dependencies. TALOS
uses the SDK as a transport adapter; execution policy, tools, checkpoints and
the agent loop remain owned by TALOS. The adapter does not use AI Gateway.

Upgrade gate: native-provider-adapter.test.mjs, model-destination.test.mjs,
kernel tests, full affected backend suite and real multi-turn composer tests
with images and a file tool for each direct provider. Verify exact Node support
and npm audit before changing pins. Rollback uses the previous package manifest
and lock with npm ci, together with the corresponding adapter commit. Persisted
image references and conversation originals must not be deleted during rollback.

Audit on this date also reports existing image-size/pptxgenjs findings outside
these new packages. No forced downgrade or unrelated dependency change applied.

## Componenti del desktop — verifica R-05A del 13/09/2026

La licenza AGPL-3.0-only del progetto TALOS non sostituisce le licenze dei
componenti di terze parti. Conservare i loro testi e le attribuzioni nella
distribuzione; gli avvisi del monorepo sono in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

| Pacchetto / componente | Versione | Licenza | Fonte upstream della licenza |
| --- | --- | --- | --- |
| Electron | 44.3.0 | MIT | https://github.com/electron/electron/blob/v44.3.0/LICENSE |
| Go standard library/runtime, compiled into `talos-chat-upload.exe` | 1.27.1 | BSD-3-Clause | https://go.dev/dl/ ; exact licence in `native/GO-LICENSE.txt` |
| node-pty | 1.1.0 | MIT | https://github.com/microsoft/node-pty/blob/v1.1.0/LICENSE |
| llama.cpp, CPU e Vulkan | b10517 (`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`) | MIT | https://github.com/ggml-org/llama.cpp/blob/b10517/LICENSE |
| png-js | 1.1.0 | MIT (testo incluso nel pacchetto; campo assente nel lock) | https://github.com/foliojs/png.js/blob/master/LICENSE |
| sqlite-vec, compresi i pacchetti nativi opzionali | 0.1.9 | MIT, alternativa scelta da `MIT OR Apache` | https://github.com/asg017/sqlite-vec/blob/v0.1.9/LICENSE-MIT |
| elkjs (diagramma del workflow, worker `vendor/elk/elk-worker.min.js`) | 0.12.0 | GPL-3.0-or-later, alternativa scelta da `EPL-2.0 OR GPL-3.0-or-later` | https://github.com/kieler/elkjs/blob/0.12.0/LICENSE.md |
| @xyflow/system (pan, zoom e minimappa del diagramma) | 0.0.83 | MIT | https://github.com/xyflow/xyflow/blob/main/packages/system/LICENSE |
| d3-zoom, d3-drag, d3-selection, d3-interpolate, d3-color, d3-dispatch, d3-timer, d3-transition (dipendenze di @xyflow/system) | 3.x | ISC | https://github.com/d3/d3-zoom/blob/main/LICENSE |
| d3-ease (dipendenza di d3-transition) | 3.0.1 | BSD-3-Clause | https://github.com/d3/d3-ease/blob/main/LICENSE |
| docx-preview (lettore dei documenti Word, `lettore-ospite-documento.js`, nella pagina ospite) | 0.4.1 | Apache-2.0 | https://github.com/VolodymyrBaydalka/docxjs/blob/master/LICENSE |
| DOMPurify (ripulitura dell'HTML dei documenti) | 3.4.16 | Apache-2.0, alternativa scelta da `MPL-2.0 OR Apache-2.0` | https://github.com/cure53/DOMPurify/blob/main/LICENSE |
| pptx-viewer-core (modello delle presentazioni, `lettore-ospite-presentazione.js`, nella pagina ospite) | 4.6.0 | Apache-2.0, con NOTICE | https://github.com/ChristopherVR/pptx-viewer/tree/main/packages/core |
| mtx-decompressor (incluso in pptx-viewer-core) | 1.6.0 | MPL-2.0 | https://github.com/ChristopherVR/mtx-decompressor (il NOTICE indica anche pptx-viewer/packages/mtx-decompressor) |
| emf-converter (incluso in pptx-viewer-core) | 3.5.1 | Apache-2.0 | https://github.com/ChristopherVR/emf-converter |
| JSZip (archivi OOXML) | 3.10.2 | MIT, alternativa scelta da `MIT OR GPL-3.0-or-later` | https://github.com/Stuk/jszip/blob/main/LICENSE.markdown |
| pako (dipendenza di pptx-viewer-core) | 1.0.11 | MIT AND Zlib | https://github.com/nodeca/pako/blob/1.0.11/LICENSE |
| SheetJS Community Edition (`xlsx`, fogli di calcolo, `lettore-foglio.js`) | 0.20.3 | Apache-2.0 | https://git.sheetjs.com/SheetJS/sheetjs |
| fast-xml-parser, fast-xml-builder, strnum, anynum, is-unsafe, xml-naming, path-expression-matcher, @nodable/entities (dentro pptx-viewer-core) | 5.11.1, 1.3.1, 2.4.2, 1.0.1, 2.0.2, 0.3.0, 1.6.2, 3.0.0 | MIT | https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/LICENSE |
| UTIF (immagini TIFF, dentro pptx-viewer-core) | 3.1.0 | MIT | https://github.com/photopea/UTIF.js/blob/master/LICENSE |

- Electron: copyright degli Electron contributors e di GitHub Inc. (2013–2020).
  Il testo è incluso nel pacchetto npm e nella distribuzione Electron come
  `LICENSE`; conservare anche `LICENSES.chromium.html`, che documenta Chromium
  e le altre dipendenze del binario. La sola etichetta MIT di Electron non le sostituisce.
- node-pty: conservare integralmente `node_modules/node-pty/LICENSE`, comprese
  le attribuzioni a Christopher Jeffrey (2012–2015), Daniel Imms (2016) e
  Microsoft Corporation e tutti gli altri avvisi contenuti nel file.
- llama.cpp: copyright 2023–2026 The ggml authors; copia inclusa in
  [desktop/assets/llama-LICENSE.txt](desktop/assets/llama-LICENSE.txt).
  Conservare anche gli avvisi e le DLL degli archivi CPU/Vulkan verificati da R-02.
- png-js: copyright 2017 Devon Govett, MIT in `node_modules/png-js/LICENSE`.
- sqlite-vec: copyright 2024 Alex Garcia. Il metadato `MIT OR Apache` non è
  un'espressione SPDX valida; la scelta MIT è documentata senza modificare il lock.
- elkjs (refactor dei grafi, 26/09/2026): autore del pacchetto npm Ulf Rüegg
  (`package.json`). Il pacchetto è in doppia licenza (`EPL-2.0 OR GPL-3.0-or-later`,
  espressione SPDX del suo `package.json`); per la distribuzione con TALOS
  (AGPL-3.0-only) vale l'alternativa GPL-3.0-or-later, compatibile con l'AGPL-3.0
  (GPLv3 §13). Il pacchetto include il solo testo EPL-2.0 (`node_modules/elkjs/LICENSE.md`),
  che la build copia accanto al worker come `vendor/elk/LICENSE-elkjs`.
- @xyflow/system: copyright 2019-2025 webkid GmbH, MIT; la build ne copia il
  testo in `vendor/xyflow/LICENSE-system`. I moduli d3 che porta con sé sono
  copyright Mike Bostock (ISC; d3-ease BSD-3-Clause): i loro testi stanno nei
  rispettivi pacchetti in `node_modules`.
- Lettore dei file (F5, 26/09/2026): le tre rese Office sono bundle minificati
  senza commenti di licenza, quindi la build copia i testi in `vendor/lettore/`
  (`LICENSE-docx-preview`, `LICENSE-dompurify`, `LICENSE-pptx-viewer-core`,
  `LICENSE-mtx-decompressor`, `LICENSE-emf-converter`, `LICENSE-jszip`,
  `LICENSE-pako`, `LICENSE-xlsx`) e conserva il NOTICE di pptx-viewer-core
  (`NOTICE-pptx-viewer-core`, Apache-2.0 §4(d): «Copyright (c) 2025-present
  pptx-viewer contributors»). Autori dai `package.json`: docx-preview
  Volodymyr Baydalka; DOMPurify Mario Heiderich, Cure53; pptx-viewer-core,
  mtx-decompressor ed emf-converter ChristopherVR; JSZip Stuart Knightley;
  xlsx SheetJS. mtx-decompressor è un port di libeot (Brennan T. Vincent,
  MPL-2.0): il sorgente resta disponibile all'indirizzo della tabella, come
  dice il NOTICE (MPL-2.0 §3.2(a)); nessun file porta l'avviso «Incompatible
  With Secondary Licenses» (Exhibit B), verificato il 26/09/2026.
  I pacchetti MIT che pptx-viewer-core porta nel bundle (elenco misurato sul
  metafile di esbuild il 26/09/2026) hanno il loro testo copiato accanto
  (`LICENSE-<pacchetto>`): copyright Natural Intelligence (anynum,
  fast-xml-builder, is-unsafe, strnum, xml-naming), Amit Kumar Gupta
  (fast-xml-parser), Photopea (utif), path-expression-matcher (2024, nessun
  titolare nel testo). @nodable/entities (autore Amit Gupta, MIT dal suo
  `package.json`) non porta un file di licenza nel pacchetto: l'attribuzione
  sta qui.

L'audit dei quattro lock (backend, frontend, desktop, context-engine) include
dipendenze di sviluppo e piattaforme opzionali, non solo il prodotto Windows
installato. Nessuna occorrenza di SSPL, BUSL, CC-BY-NC o Elastic rilevata.
MPL-2.0 richiede di rispettare gli obblighi sui file coperti e verificare
l'assenza di un avviso applicato di incompatibilità con licenze secondarie;
il modello di avviso nell'appendice della MPL non è da solo tale dichiarazione.
