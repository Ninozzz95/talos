# Dossier di ricerca — Frontend desktop Fase 1

Data: 2026-09-01  
Owner: TALOS UI desktop  
Perimetro: fondazioni modulari, build parallela, adapter browser e laboratorio isolato.

## Problema misurato

`harness-ui/frontend/` possiede package, lockfile, test di caratterizzazione e
runner, ma non possiede ancora `src/`. La UI usata dall'owner vive in
`harness-ui/public/app.js` e supera 480 KB. Scrivere direttamente nel
`public/` durante la prima estrazione sovrascriverebbe una superficie reale e
un worktree già modificato; il cutover è quindi escluso fino alla Fase 10.

## Fonti primarie verificate

- esbuild API 0.28.2: build JS, bundle ESM e `metafile` strutturato;
  <https://esbuild.github.io/api/>.
- esbuild content types: gli output con nomi generati vanno risolti dal
  `metafile`, non ricostruiti per ipotesi;
  <https://esbuild.github.io/content-types/>.
- Vite backend integration: un backend custom consuma un manifest esplicito e
  mantiene separata l'autorità sugli URL pubblici;
  <https://vite.dev/guide/backend-integration.html>.
- Playwright best practices: verificare comportamento visibile, isolamento e
  locatori user-facing;
  <https://playwright.dev/docs/best-practices>.
- Anthropic Claude Code CLI: sessione, modello e permessi sono input espliciti
  e ripristinabili, non stato implicito della shell;
  <https://docs.anthropic.com/en/docs/claude-code/cli-usage>.
- Hermes Agent: sessioni, tool, skill, profili e automazioni hanno confini
  riconoscibili; TALOS conserva in più policy, provenance e Doctor;
  <https://github.com/NousResearch/hermes-agent>.

Pin già presente e mantenuto: `esbuild 0.28.2`, Playwright `1.62.1`,
axe-core `4.13.0`, pixelmatch `7.2.0`, pngjs `7.0.0`.

## Decisione upstream

- **ADOPT** l'API JS ufficiale di esbuild e il suo `metafile`; nessun bundler
  duplicato e nessun parser artigianale del grafo.
- **ADAPT** il manifest di integrazione backend Vite in un manifest AVM
  deterministico con SHA-256, perché il server Node TALOS non è Vite e il
  cutover è deliberatamente rinviato.
- **ADOPT** Playwright per il laboratorio isolato e per la prova visibile.
- **DEFER** Vue alla Fase 2: il framework sarà confrontato con la base ESM dopo
  una profilazione CPU/GPU/DOM. Non è una cura presunta del lag.
- **REJECT** l'output diretto in `harness-ui/public/` proposto dalla ZIP nella
  sua forma originaria: violerebbe lo strangler e renderebbe il rollback
  ambiguo nello stato corrente.

## Confronto competitor e miglioramento TALOS

Claude Code, Codex e Hermes rendono espliciti sessione, modello, permessi e
tool boundary. La Fase 1 non riproduce la loro UI: rende questi confini
contratti separati e testabili. TALOS aggiunge un vantaggio strutturale:
manifest di integrità, allowlist degli asset, bridge host fail-closed e
rollback verificabile prima che un solo pixel produttivo venga sostituito.

## Sicurezza e rollback

- Nessun nuovo script inline e nessun allargamento CSP.
- Nessun segreto nel bundle o nella persistenza browser.
- REST solo su `/api/v1/`; EventSource e WebSocket ricevono endpoint
  costruiti dall'adapter, mai da markup non fidato.
- Gli asset vendorizzati sono una copia byte-per-byte delle fonti già
  versionate e conservano le licenze.
- `harness-ui/frontend/dist/` e `dist-lab/` sono output ignorati. Eliminare
  questi output e i nuovi sorgenti ripristina integralmente lo stato; la UI
  owner non cambia.
