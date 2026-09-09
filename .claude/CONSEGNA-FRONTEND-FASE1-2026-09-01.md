# Consegna — Frontend desktop Fase 1

Data: 01/09/2026  
Stato: **GREEN**  
Cutover: **non eseguito**.

## Cosa è stato chiuso

La lane desktop possiede ora una base frontend modulare separata dalla UI che
l'owner usa su `4174`. La nuova build non sostituisce ancora nessun pixel di
produzione: prepara contratti, asset, trasporti e rollback necessari alle fasi
successive senza rendere fragile la superficie esistente.

Sono disponibili:

- build ESM deterministica con `esbuild 0.28.2` e manifest SHA-256;
- adapter REST limitato a `/api/v1/`;
- bridge host fail-closed;
- persistenza con chiavi in allowlist e recupero da JSON corrotto;
- route desktop esplicite;
- 19 tipi di evento sessione normalizzati;
- stream sessione con chiusura/abort idempotenti;
- protocollo terminale binario byte `0/1` e teardown idempotente;
- asset font, marchio e xterm vendorizzati con licenze e hash;
- laboratorio non produttivo isolato su `4175`.

## Ricerca e decisioni

Documenti:

- `.claude/DOSSIER-RICERCA-FRONTEND-FASE1-2026-09-01.md`;
- `.claude/LEDGER-FRONTEND-FASE1-2026-09-01.md`.

Sono stati adottati l'API e il metafile ufficiali di esbuild, Playwright per la
prova visibile e il modello di manifest per backend custom raccomandato da
Vite. Vue resta deliberatamente rinviato alla decisione misurata della Fase 2:
non viene usato come cura presunta del lag. Il P0 prestazionale successivo ha
poi rimosso le due cause reali senza richiedere un framework.

Il confronto con Claude Code, Codex e Hermes ha guidato la separazione dei
confini sessione/modello/permessi/strumenti; TALOS mantiene inoltre integrità
asset, policy, provenance, Doctor e rollback verificabile.

## Verifica fresca

- `npm --prefix harness-ui/frontend run verify`: GREEN;
- contratti/unit: `14/14`;
- laboratorio Playwright: `3/3` a 1440×900, 1280×800 e 1024×800;
- browser prodotto dopo l'integrazione col P0 lag: `76` passati, `2` opt-in
  saltati;
- backend: `1259/1259`;
- `git diff --check`: pulito;
- server owner: `4174` risponde `200`.

Screenshot ispezionati integralmente:

- `harness-ui/frontend/artifacts/phase-01-desktop-1440x900.png`;
- `harness-ui/frontend/artifacts/phase-01-desktop-1280x800.png`;
- `harness-ui/frontend/artifacts/phase-01-desktop-1024x800.png`.

Non sono presenti overflow, clipping, richieste fallite o errori console. La
dicitura “Laboratorio UI · non produzione” è sempre visibile e il contenuto
resta leggibile in tutte le viewport.

## Correzioni nate dai gate

- `PHASE1-MANIFEST-ORDER-02`: ordinamento codepoint stabile, non dipendente
  dalla locale;
- `PHASE1-LAB-NETWORK-03`: favicon esplicita e fallimento su ogni HTTP ≥400;
- `PHASE1-PLAYWRIGHT-ROUTING-04`: suite prodotto e laboratorio non si
  contaminano.

## Cosa non è stato fatto

- nessun output è stato copiato in `harness-ui/public/`;
- nessuna route o URL owner è cambiata;
- nessun segreto è entrato nel bundle;
- nessuna CSP è stata allargata;
- nessun file mobile è stato toccato dalla fase;
- nessun commit o push è stato creato in questa chiusura.

## Passo successivo

La Fase 1 è chiusa. La prossima fase è **Fase 2 — stato, lifecycle e decisione
architetturale**: estrarre ownership/effect scope/abort/teardown e confrontare
con misure reali la base ESM posseduta da TALOS con un prototipo Vue isolato,
senza cutover e senza ripetere il lavoro prestazionale già chiuso.
