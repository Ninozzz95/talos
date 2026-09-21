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
| node-pty | 1.1.0 | MIT | https://github.com/microsoft/node-pty/blob/v1.1.0/LICENSE |
| llama.cpp, CPU e Vulkan | b10517 (`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`) | MIT | https://github.com/ggml-org/llama.cpp/blob/b10517/LICENSE |
| png-js | 1.1.0 | MIT (testo incluso nel pacchetto; campo assente nel lock) | https://github.com/foliojs/png.js/blob/master/LICENSE |
| sqlite-vec, compresi i pacchetti nativi opzionali | 0.1.9 | MIT, alternativa scelta da `MIT OR Apache` | https://github.com/asg017/sqlite-vec/blob/v0.1.9/LICENSE-MIT |

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

L'audit dei quattro lock (backend, frontend, desktop, context-engine) include
dipendenze di sviluppo e piattaforme opzionali, non solo il prodotto Windows
installato. Nessuna occorrenza di SSPL, BUSL, CC-BY-NC o Elastic rilevata.
MPL-2.0 richiede di rispettare gli obblighi sui file coperti e verificare
l'assenza di un avviso applicato di incompatibilità con licenze secondarie;
il modello di avviso nell'appendice della MPL non è da solo tale dichiarazione.
