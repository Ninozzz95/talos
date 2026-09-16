# Consegna — “Apri cartella con TALOS” su Windows

Data: 1 settembre 2026  
Lane: `AVM-harness-desktop`, branch `lane/harness-desktop`  
Perimetro: Harness Desktop e integrazione Windows per-utente; `mobile/` in
sola lettura e non modificato in questa tranche.

## Esito

Il flusso di sviluppo è implementato dall'inizio alla fine. Esplora file può
consegnare una cartella al server locale tramite un'intenzione autenticata e
monouso; TALOS apre una nuova sessione con quella cartella già selezionata.
Il browser non riceve mai il percorso assoluto nel link e la selezione non
promuove silenziosamente i permessi a `Full access`.

La registrazione reale per l'utente Windows corrente è presente in:

- `HKCU\Software\Classes\Directory\shell\Talos.OpenWorkspace`;
- `HKCU\Software\Classes\Directory\Background\shell\Talos.OpenWorkspace`.

Le voci sono **Apri cartella con TALOS** e **Apri questa cartella in TALOS**.
Su Windows 11 questa integrazione legacy di sviluppo può comparire in
**Mostra altre opzioni**. L'installer definitivo dovrà sostituirla con
`IExplorerCommand` e un eseguibile stabile posseduto dall'installazione.

## Contratto implementato

1. `open-with-talos.ps1` valida la cartella e parla soltanto con un endpoint
   loopback.
2. Il server autentica il launcher con una credenziale locale, valida e
   canonicalizza la cartella e crea un identificatore opaco con scadenza di
   quindici minuti.
3. Il link contiene solo `#open-workspace=<id>`, mai il percorso.
4. Il client rimuove subito il frammento dall'indirizzo e prepara la nuova
   sessione mostrando nome e radice scelta.
5. Alla creazione il registro sessioni risolve il percorso server-side,
   conserva `Workspace write` e consuma l'intenzione una sola volta.
6. Errori, token errati, file al posto di cartelle, scadenza e doppio consumo
   falliscono con messaggi espliciti e senza ampliare i permessi.

## File di prodotto

Creati:

- `harness-ui/src/workspace-launch-store.mjs`;
- `harness-ui/scripts/windows/open-with-talos.ps1`;
- `harness-ui/scripts/windows/register-open-with-talos.ps1`.

Modificati:

- `harness-ui/src/http-app.mjs`;
- `harness-ui/src/session-registry.mjs`;
- `harness-ui/server.mjs`;
- `harness-ui/public/app.js`;
- `.gitignore`;
- `harness-ui/README.md`.

## Test e contratti permanenti

Creati:

- `harness-ui/tests/workspace-launch-store.test.mjs`;
- `harness-ui/tests/http-routes-workspace-launch.test.mjs`;
- `harness-ui/tests/windows-open-with-talos.test.mjs`.

Estesi:

- `harness-ui/tests/session-registry.test.mjs`;
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`;
- `harness-ui/frontend/tests/browser/visual-matrix.spec.mjs`;
- `harness-ui/frontend/tests/contract/legacy-contract-snapshot.test.mjs`;
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`.

Ogni prova HKCU usa una radice univoca e ora la elimina integralmente nel
teardown. Sono state inoltre rimosse undici radici vuote lasciate dai primi
cicli RED; le due chiavi prodotto reali non sono state toccate.

## Evidenze fresche

- test focalizzati server/registro Windows: **204/204**;
- test backend completi: **1184/1184**;
- verifica frontend: **3/3**;
- suite browser: **37/37**;
- matrice visuale: **24/24**;
- build frontend: **22 asset verificati**;
- test PowerShell Windows isolati, ultimo rerun: **5/5**;
- `git diff --check`: superato.

La prova reale è stata eseguita su un server separato alla porta 4175, poi
spento. Il launcher ha creato un link vero, TALOS ha mostrato
`Nuova · AVM-harness-desktop`, la cartella corretta nel pannello Files,
`Workspace write`, una sola vista attiva e un indirizzo già ripulito dal
frammento.

Screenshot ispezionati per intero:

- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/open-with-talos-1440x900.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/open-with-talos-real-4175.png`;
- tutti i 24 screenshot rigenerati dalla matrice visuale.

Durante l'ispezione è stata scoperta e corretta una regressione preesistente:
Impostazioni poteva restare sovrapposta alla chat e al composer. Lo scenario
permanente `SETTINGS-VIEW-ISOLATION-01` verifica ora che esista una sola vista
attiva dopo ogni transizione.

## Ricerca e decisione upstream

Il dossier completo è
`.claude/DOSSIER-RICERCA-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`; il ledger a
livello di codice è
`.claude/LEDGER-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`.

Decisione: **ADAPT** per lo sviluppo odierno, con chiavi HKCU reversibili e
launcher isolato; **ADOPT** dell'integrazione moderna `IExplorerCommand` nella
fase installer. Sono state confrontate le documentazioni ufficiali Microsoft
per Esplora file, Registro e `Start-Process`, oltre all'implementazione reale
di VS Code fissata al commit
`df2411cf7d8f2e0cfc79109a3bc8eaab2c69165b`.

## Gate owner completato dopo autorizzazione

L'owner ha autorizzato il riavvio. Prima della fermata sono stati ricontrollati
listener, nome e comando: PID `9352`, `node.exe`,
`harness-ui/server.mjs`. È stato terminato esclusivamente quel PID. Il server è
tornato sulla stessa porta come PID `25424`, con salute `200`, chiave
OpenRouter disponibile, runtime owner configurato e una workspace esposta.

Il launcher Windows reale è stato invocato su
`C:\Users\Antonino\Desktop\projects\AVM-harness-desktop` contro il nuovo
owner. Ha creato l'intenzione
`bYfAfGoDN8V4tNGg3HLPw5vRsA4Vcq8u`; da questa è partita la sessione reale
`486e464b-ad72-4b2f-96a2-6daccf350456` con:

- task `libero:workspace-launch`;
- cartella esatta `AVM-harness-desktop`;
- branch `lane/harness-desktop`;
- permesso `Workspace write`;
- unico modello autorizzato per il gate, `qwen/qwen3.8-flash`;
- richiesta `Rispondi soltanto con OK` e risposta reale `OK`;
- `RunFinished` con esito `success` e persistenza JSONL completa.

Dopo il successo la stessa intenzione restituisce `410`: il consumo monouso è
quindi provato anche sul server owner, non soltanto nei test sintetici. Salute
finale: PID `25424`, HTTP `200`.

### Limite umano dichiarato

Il browser integrato ha riportato zero browser collegati e il bridge di
controllo Windows era già fallito in due tentativi. Non è quindi possibile
automatizzare il gesto fisico dentro Esplora file né produrne uno screenshot
senza inventare una prova. Registrazione HKCU, comando quotato, launcher,
endpoint, creazione sessione, risposta Qwen e persistenza sono stati tutti
esercitati realmente; resta soltanto una conferma manuale dell'aspetto della
voce in **Mostra altre opzioni** su questo Windows 11.

## Riepilogo semplice

Windows e TALOS ora sanno passarsi una cartella senza chiedere all'utente di
copiarne il percorso e senza concedere permessi extra. Il server usato
dall'owner è stato aggiornato ed è nuovamente disponibile; dalla cartella è
partita una sessione vera, Qwen ha risposto `OK` e tutto è stato salvato. Il
solo elemento non osservabile automaticamente è l'aspetto del menu nativo di
Windows: per quello serve un click manuale dell'owner in **Mostra altre
opzioni**.
