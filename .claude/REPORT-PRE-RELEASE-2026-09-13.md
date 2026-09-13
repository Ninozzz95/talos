# Report pre-release — TALOS Desktop v0.1.0 (13/09/2026, in corso)

Contratto: `.claude/PIANO-PRE-RELEASE-2026-09-07.md` (owner 07/09: tabella di marcia allineata allo
stato dell'arte dell'ultimo mese, prove fresche da utente appena installato, UX pulita/rifinita/
fluida). Scatta ora: la coda dei difetti è chiusa o dichiarata debito, R-01…R-06 ✅, il monorepo
pubblico esiste (`Ninozzz95/talos` main `5ec6797`, desktop R-03 in `6db3c21` da pushare).

## 1 · Tabella di marcia, allineata allo stato dell'arte (fonti lette il 13/09/2026)

⛔ Il tetto di ricerche web della sessione era esaurito (200/200): le fonti sono pagine ufficiali
lette per intero (WebFetch), non risultati di ricerca. Data della pagina dove dichiarata.

| riga | stato dell'arte (fonte, data) | TALOS oggi | cosa manca | chi decide | costo misurato |
|---|---|---|---|---|---|
| Firma del codice Windows | Microsoft «Artifact Signing» (ex Trusted Signing), pagina del 02/01/2026 agg. 03/08/2026: servizio gestito con validazione dell'identità (account Basic/Premium), pensato per organizzazioni; SmartScreen è a reputazione: «se un file, un'app o un certificato non ha reputazione, viene marcato a rischio e mostra un avviso» (learn.microsoft.com, SmartScreen overview, 23/04/2026) | non firmata (decisione owner 12/09: nessuna persona giuridica) | niente per v0.1; avviso SmartScreen scritto in README e note; **mitigazione possibile**: inviare l'exe a Microsoft per revisione (SmartScreen «Submit files for analysis», stessa pagina) dopo la release | owner | 0 (firma rimandata); invio a Microsoft: minuti |
| Provenienza e livello SLSA | SLSA v1.0: Build L2 = piattaforma ospitata con provenienza firmata (slsa.dev/spec/v1.0/levels); GitHub Actions + `actions/attest` = L2, non L3 (nessun isolamento rafforzato) | job `desktop` con `actions/attest` v4 su exe e zip (R-04), mai eseguito sui runner | il primo giro del job sul tag; verifica `gh attestation verify <file> -R Ninozzz95/talos` (docs.github.com, attestazioni) dichiarata nelle note | io + owner (tag) | job ~45 min max, misura al primo giro |
| Verifica dell'integrità all'installazione | SHA256 pubblicato + attestazione verificabile con `gh` (docs.github.com) | `SHA256SUMS.txt` generato da `release-assets.mjs`, note con i comandi PowerShell (R-04) | niente | — | fatto |
| SBOM | GitHub esporta SPDX 2.3 dal Dependency graph (UI «Export SBOM» e REST) (docs.github.com) | nessun SBOM allegato | attivare il Dependency graph sul repo pubblico e allegare l'SBOM alla release (un passo `gh api` o azione SPDX) | owner (impostazione del repo) → io (passo nel job) | ~30 righe di workflow, non misurate |
| Riproducibilità della build | staging a inclusioni con MANIFEST (file, byte, impronte) e binari llama.cpp con SHA256 (R-02); Electron/electron-builder/NSIS fissati | build ripetibile a parità di lock; non bit-per-bit (electron-builder non lo promette) | dichiarare nel README che si riproduce «lo stesso albero», non «gli stessi byte» | io | 0 |
| Canale di aggiornamento | Electron: `update.electronjs.org` gratuito richiede repo GitHub pubblico + release su GitHub + firma solo su macOS (electronjs.org/docs/latest/tutorial/updates); Windows via Squirrel `RELEASES` | nessun auto-update (decisione owner: v0.1 no) | v0.2: valutare `update-electron-app` sul monorepo pubblico (ora esiste); su Windows senza firma resta l'avviso SmartScreen a ogni aggiornamento | owner (v0.2) | 0 in v0.1 |
| Distribuzione senza installer | Ollama Windows: installer senza amministratore, avvio in background, Windows 10 22H2+ (docs.ollama.com/windows); LM Studio: 3 passi (installa, scarica modello, carica) (lmstudio.ai/docs) | installer NSIS per utente senza amministratore + zip completo con `TALOS.exe` (niente Node a parte) | niente | — | installer 145,0 MiB, zip 244,0 MiB (R-06) |
| Requisito minimo di Windows | Ollama dichiara 10 22H2+; node-pty richiede 10 1809+ | dichiariamo 10 1809+ x64, **non provato** su 10 | prova su Windows 10 (VM o macchina) o alzare la dichiarazione a 22H2 come Ollama | owner (macchina) | 0 se si alza la soglia dichiarata |
| Prima esecuzione | LM Studio 3 passi; Ollama pronto dopo l'installazione con API su 11434 | installazione 39–48 s, prima finestra 3,8 s (R-06), modello 0.6B pronto in 1,8 s (R-03); GGUF da scaricare dall'app | il giro da utente nuovo (§2) misura download→prima risposta | io (parti sul disco) + owner (macchina pulita) | vedi §2 |
| Sicurezza del guscio | checklist Electron ufficiale, 20 punti (electronjs.org/docs/latest/tutorial/security) | contextIsolation, sandbox, niente nodeIntegration né preload, navigazione e nuove finestre bloccate, CSP con nonce dal server, Electron 44.3.0 corrente (R-01) | punto 19 «fuses» non verificato; punto 15 `shell.openExternal` usato per «Apri nel browser» con URL locale (contenuto nostro) | io | fuses: da leggere, non misurato |
| Note di rilascio e versione | SemVer: 0.y.z = sviluppo iniziale, «tutto può cambiare» (semver.org); Keep a Changelog 1.1.0: sezione Unreleased, tipi Added/Changed/Fixed/…, date ISO, «per gli umani» (keepachangelog.com) | `desktop/CHANGELOG.md` con `desktop-v0.1.0 — non rilasciata`, limiti noti; note generate con requisiti, SmartScreen, contenuto, hash, `gh attestation verify` (R-04) | riscrivere il changelog nei tipi di Keep a Changelog e mettere la riga «cosa NON fa ancora» in testa alle note | io | ~20 righe |
| Telemetria | dichiarata assente in README, note, NOTICE (R-05a) | nessuna | niente | — | fatto |

## 2 · Le dieci prove da utente appena installato

Regola del piano: valgono solo su una macchina che non ha mai visto TALOS. Qui ogni passo dice
**cosa è misurato su questa macchina** (con profilo dati nuovo, chiavi tolte dall'ambiente) e
**cosa resta alla macchina pulita**.

| # | passo | qui | resta |
|---|---|---|---|
| 1 | scarico | exe 145,0 MiB / zip 244,0 MiB, nomi `TALOS-Setup-0.1.0.exe`, `TALOS-0.1.0-win.zip` (R-06) | download vero dalla pagina Releases (dopo il tag) |
| 2 | leggo il README | README del monorepo (inglese, R-05b) e del guscio: requisiti, SmartScreen, dati, disinstallazione | lettura da parte di una persona che non conosce TALOS |
| 3 | installo e avvio | 39–48 s silenziosa, prima finestra 3,8 s (R-06); doppio clic vero non misurabile da script | SmartScreen al doppio clic sull'exe scaricato |
| 4–9 | prima schermata, chiave assente, prima sessione con modello locale, cinque superfici, chiudi/riapri, ferma/riprendi | **da fare adesso** con la app installata e un profilo dati vergine (§2-bis, in corso) | stessa cosa su macchina pulita |
| 10 | disinstallo | zero residui, dati conservati (R-02/R-04 smoke); ⛔ lezione del 13/09: l'installer silenzioso avvia l'app e un'installazione sopra un'app viva non sovrascrive i file bloccati | — |

## 3 · UX: pulita, rifinita, fluida

- **Pulita**: cancelli esistenti — `nessun-errore-a-runtime.spec.mjs` (errori JS a schermo), il
  test dei testi (`cancello-testo.test.mjs`: nomi tecnici), `veli:sani`. Da rilanciare sul
  candidato di release e riportare i conteggi qui.
- **Rifinita**: spazzata A-bis (testate, padding, gap, azioni uguali) a 1024×800 e 1440×900, due
  temi: da fare sul candidato.
- **Fluida**: si misura nel browser dell'owner con la GPU accesa (lezione del 02/09): apertura
  schermate, dialoghi, primo pezzo di risposta, scorrimento della chat lunga. Serve l'owner
  davanti al suo Chrome: non misurabile da qui.

## Cosa resta aperto e perché si rilascia lo stesso

Da compilare alla chiusura, dopo §2-bis e dopo il primo giro del job sui runner.
