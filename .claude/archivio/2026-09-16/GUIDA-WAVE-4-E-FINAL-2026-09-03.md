# GUIDA WAVE 4 e MONOREPO-FINAL — labs (7 righe, 36 giorni) e migrazione (1 riga, 5 giorni)

> Compagna di `LEDGER-ROADMAP-DESKTOP-2026-09-03.md`. Tutto ciò che sta in
> `harness-ui/labs/` è spento di default (`labs/feature-flags.json`, W0-04:
> `parseLabs` in `src/config.mjs`, flag letti da `TALOS_LABS`), ha uno store
> proprio in `labs/stores/<nome>/`, e resta `NOT_LIVE_VALIDATED` finché una
> prova reale sulla macchina dell'owner non viene scritta nel ledger con i
> numeri. Nessun lab può toccare gli store stable né allargare i permessi
> di una sessione.
>
> ⛔ Si parte solo su autorizzazione dell'owner. Una riga per commit.
> Ordine: W4-07 → W4-03 → W4-01 → W4-04 → W4-05 → W4-02 → W4-06 (decisione, non codice) → FIN-01.

## Convenzioni dei labs

- Ogni lab ha `labs/<nome>/README.md` con: cosa fa, cosa **non** fa, flag, store, stato (`DESIGN_VALIDATED` → `LABS_EXECUTABLE` → `LIVE_CONNECTION_PASSED` con data e macchina), come si prova, come si spegne.
- Ogni lab espone un manifesto `labs/<nome>/manifest.json` `{ nome, versione, capacita:[…], richiede:{ flag, backend?, kernel? }, stato }` letto da `doctor.mjs` («Labs accesi» di W0-04) e mostrato in Settings con il badge di stato.
- Un lab si aggancia **solo** ai contratti stable: `execution-backend-contract.mjs` (W2-03a), `sandbox-policy.mjs` (W2-05), rotte `http-app.mjs` sotto prefisso `/api/v1/labs/<nome>/`, eventi AG-UI esistenti. Se serve un contratto nuovo, prima la riga nel ledger.
- Test: `tests/labs/<nome>.test.mjs` con il backend finto iniettato; la prova live è uno scenario separato marcato `@live` che non gira in CI.

---

## W4-07 — Adapter ACP (TALOS come agente per Zed e JetBrains)

**File**: `labs/acp-agent/{README.md,manifest.json,server.mjs,session-map.mjs,permissions.mjs}`, `tests/labs/acp-agent.test.mjs`, `src/config.mjs` (flag `acp-agent`).

1. Schema: scaricare lo schema ACP v1.21 (JSON) in `labs/acp-agent/schema/` con hash e data; il test valida ogni messaggio in uscita contro lo schema (parser JSON Schema già presente nel repo? se no, validazione a mano dei soli campi usati, dichiarata).
2. Trasporto: stdio JSON-RPC; `server.mjs` avviato da `node labs/acp-agent/server.mjs` con `TALOS_HARNESS_UI_TOKEN` e la porta del server TALOS; ogni sessione ACP ↔ una sessione TALOS (`session-map.mjs`), creata con `avviaSessione` via rotta, permessi presi dalla richiesta ACP e **mai** più larghi del livello della sessione.
3. Eventi: `session/update` da AG-UI (testo, reasoning se abilitato, tool call con stato, `usage_update` con `{used,size,cost}` — stessa forma di W1-08, `notice` per avvisi); `request_permission` ↔ `ApprovalRequested`/`approve`; terminale ACP ↔ `terminal-ws.mjs` (W1-01: una scheda per sessione ACP).
4. Verso contrario: una richiesta ACP che chiede un tool non ammesso ⇒ `notice` e rifiuto, mai esecuzione; una delega inversa (ACP che chiede a TALOS di pilotare l'IDE) ⇒ non supportata, dichiarato.
5. Prova live: sessione TALOS aperta da Zed sulla macchina dell'owner, screenshot; stato `LIVE_CONNECTION_PASSED` con data.
6. Criterio: stessi permessi e stesse ricevute della UI; nessuna delega inversa. Commit `feat(labs): adapter ACP con permessi e ricevute della UI (W4-07)`.

## W4-03 — Code graph e ricerca semantica locale

**File**: `labs/code-intelligence/{README.md,manifest.json,graph.mjs,embeddings.mjs,search.mjs}`, `tests/labs/code-intelligence.test.mjs`.

1. Dipende da P-13 (repo map con budget, K-10): il grafo dei simboli è lo stesso; qui si aggiunge la ricerca semantica con embedding **locali** (runtime locale già presente: `local-runtime-llama-server.mjs`), spenta di default.
2. Regola: la ricerca deterministica (`cerca` per nome, W1-04 full-text) resta **primaria**; la semantica propone, non decide; ogni risultato semantico porta il punteggio e il file.
3. Test: un corpus di 50 file finti; una query sinonima trova il simbolo giusto nei primi 3; un test al contrario: query fuori corpus ⇒ nessun risultato inventato.
4. Criterio: semantico spento di default; misura sul banco TALOS-BANCO (task `storia`) prima/dopo con e senza semantica. Commit `feat(labs): code graph e ricerca semantica locale, spenta di default (W4-03)`.

## W4-01 — Backend avanzati (VM/microVM, Kubernetes, Modal, Daytona, Vercel, Apptainer, nodo TALOS, SDK)

**File**: `labs/execution-fabric/{README.md,manifest.json,adapters/<nome>.mjs,conformance.mjs}`, `tests/labs/execution-fabric.test.mjs`.

1. Manifesti prima del codice: un file per adapter con `capacita` (rete, persistenza, gpu, background, filesystemIsolato), requisiti (binario, credenziali via Secret Broker W2-04), stato `DESIGN_VALIDATED`.
2. Conformance suite (`conformance.mjs`): per ogni adapter le stesse prove del contratto W2-03a (probe, esegui con output in streaming, annulla, timeout, stato) con backend finto; l'adapter passa solo se la suite è verde.
3. **Un** adapter live BYOK scelto dall'owner (es. Daytona o Modal con la sua chiave): prova reale, numeri (latenza di avvio, costo), stato `LIVE_CONNECTION_PASSED`; gli altri restano manifesti.
4. Criterio: nessun adapter «Core Certified» senza prova live scritta nel ledger. Commit `feat(labs): execution fabric avanzato con conformance e un adapter live (W4-01)`.

## W4-04 — Talos Remote Node

**File**: `labs/remote-node/{README.md,manifest.json,contract.mjs,auth.mjs,lease.mjs}`, `tests/labs/remote-node.test.mjs`.

1. Contratto: un nodo remoto è un backend W2-03c (SSH) con in più identità (coppia di chiavi Ed25519 per nodo, stessa libreria delle ricevute), mutual auth e lease a scadenza; niente control plane cloud (dichiarato nel README).
2. Ispirazione misurata: Goose `goose-roaming` (iroh/QUIC, `TrustBook`) — si adotta il **modello di fiducia** (chiavi reciproche, `ConnectionCard`), non la dipendenza iroh finché non provata.
3. Test: handshake con chiave sconosciuta ⇒ rifiuto; lease scaduto ⇒ comando rifiutato; ricevuta del comando con l'id del nodo.
4. Criterio: `NOT_LIVE_VALIDATED` finché non provato su un secondo PC dell'owner. Commit `feat(labs): remote node con mutual auth e lease (W4-04)`.

## W4-05 — Memory provider SDK

**File**: `labs/memory-providers/{README.md,manifest.json,contract.mjs,adapters/}`, `tests/labs/memory-providers.test.mjs`.

1. Contratto: `{ cerca(query), leggi(id), proponi(candidata) }`; gli adapter esterni possono **proporre** memorie (P-08: candidate con citazione), mai scriverle; il modello semantico TALOS (`memory-store.mjs`) resta invariato.
2. Test: un adapter finto propone una memoria senza citazione ⇒ respinta; con citazione ⇒ candidata visibile in UI.
3. Criterio: nessuna scrittura diretta da un provider esterno. Commit `feat(labs): memory provider SDK in sola proposta (W4-05)`.

## W4-02 — Computer use desktop (UI Automation), opt-in, emergency stop

**File**: `labs/computer-use/{README.md,manifest.json,driver.mjs,allowlist.json,stop.mjs}`, `tests/labs/computer-use.test.mjs`.

1. Regole prima del codice (dal dossier competitor, OpenClaw L10): capacità dichiarate dal driver (`computer.act`, `screen.snapshot`), **mai** fallback silenzioso fra provider; allowlist di app per finestra (titolo/processo), password manager e finestre di sistema sempre bloccati; stop di emergenza globale (tasto e rotta) che chiude la sessione.
2. Driver Windows via UI Automation (`node-ffi`? no: si valuta un helper `.NET` in `scripts/windows/` come per W2-16, con contratto JSON su stdio); screenshot prima/dopo ogni azione nella ricevuta.
3. Test: azione su finestra fuori allowlist ⇒ rifiutata; stop di emergenza ⇒ nessuna azione dopo.
4. Criterio: opt-in per sessione, allowlist, stop provato; rischio 5: la prova live la fa l'owner davanti allo schermo. Commit `feat(labs): computer use opt-in con allowlist e stop di emergenza (W4-02)`.

## W4-06 — Sync E2EE selettiva (MONITOR)

Nessun codice. Prima della stima l'owner decide: cosa si sincronizza (sessioni? memoria? impostazioni?), fra quali dispositivi (desktop ↔ Pad), con quale chiave. La scheda in `labs/sync/README.md` elenca le tre domande e le opzioni; la riga resta `MONITOR` finché non risponde.

## FIN-01 — Monorepo `Ninozzz95/talos` `apps/desktop`

**File**: `docs/MONOREPO-FINAL.md` (nel repo desktop, poi nel monorepo).

1. Prerequisito: W3-08 chiusa (UI modulare in produzione) e test mobile verdi sul commit di partenza (misurati, con hash).
2. Ledger di migrazione file per file: per ogni file di `harness-ui/` la destinazione in `apps/desktop/`, e per i file **condivisi** col mobile (`talosHarness.mjs`, contratti, fixture) una delle tre vie: (a) resta nel kernel e il desktop lo importa, (b) copia con test di identità (hash) finché non si unifica, (c) unificazione con un solo test che gira in entrambi.
3. Prova: `npm ci` + suite desktop + suite mobile nel monorepo, verdi, prima del merge; script di ritorno (`git subtree split`) provato una volta.
4. Criterio: solo dopo Wave 3; test mobile verdi prima del merge; nessun file condiviso senza la sua via scritta. Commit nel monorepo, mai push senza il sì dell'owner.
