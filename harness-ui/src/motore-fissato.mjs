/*
 * The llama.cpp version TALOS pins, in one place (01/11/2026, form agreed with Desktop, Mobile, CLI and Performance). Read by the package
 * (`desktop/scripts/prepara-pacchetto.mjs`), the context engine (`context-embedding-runtime.mjs`) and the running server
 * (`versione-del-motore.mjs`). Same idea as Ollama's single `LLAMA_CPP_VERSION` file (`llama/server/CMakeLists.txt:115`).
 * ⛔ Data only, no imports: `harness-ui/src` is copied into the phone package (`copia-r4.mjs:28`). The phone's own pin is its submodule.
 */
export const MOTORE_FISSATO = Object.freeze({ versione: '0.7.0', build: 11669, commit: '620d2225cc436ab0b001e3200e590e3b286ef9ab' });
