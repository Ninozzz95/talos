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

Fatte il 13/09 sull'app INSTALLATA dal pacchetto R-03 (Windows 11, RX 9070 XT), profilo dati
vergine (`TALOS_DESKTOP_DATA_DIR` nuovo), chiavi e token tolti dall'ambiente, con
`scratchpad/giro-utente-nuovo.mjs`; taccuino `.claude/foto-r08-2026-09-13/R08-giro-utente-nuovo.json`,
foto nella stessa cartella. Ciò che vale solo su una macchina che non ha mai visto TALOS è
segnato «macchina pulita».

| # | passo | misurato qui | attrito / difetto | resta |
|---|---|---|---|---|
| 1 | scarico | exe 145,0 MiB, zip 244,0 MiB (R-06) | — | download dalla pagina Releases dopo il tag |
| 2 | README | README del monorepo (inglese) e del guscio: requisiti, SmartScreen, dati, disinstallazione | — | lettura da una persona nuova |
| 3 | installo e avvio | silenziosa 39–48 s; prima finestra 1,4 s dal lancio (profilo vergine) | ⛔ l'installer silenzioso AVVIA l'app a fine installazione; un'installazione sopra un'app viva non sovrascrive i file bloccati (visto due volte) | SmartScreen al doppio clic |
| 4 | prima schermata | intro «Primo avvio · 2 di 4» (Cartella · Modello · Permessi · Fine), parole piane, «Salta per ora» | apre direttamente sul passo Modello (la cartella è già proposta): da guardare a occhio se è chiaro | macchina pulita |
| 5 | chiave assente | ogni fornitore è etichettato «· serve una chiave»; il riquadro «Chiave del fornitore» dice dove finisce la chiave; «Usa il modello locale» esiste | **D1 curato**: con «Motore locale» e zero modelli sul disco la lista proponeva 200 modelli cloud | — |
| 6a | scarico un modello | dall'app (rotta del catalogo): Qwen3-0.6B-Q8_0, 639 MB in **15 s**, impronta verificata, stato «pronto»; carica su Vulkan in **2,1 s** | **D2 curato**: senza `license` la rotta rispondeva 500 «Errore interno» invece di 400 col campo mancante | — |
| 6b | prima sessione | senza attrezzi: primo pezzo in **125 ms**, giro finito in 135 ms («ciao») | **DR1 aperto**: «Leggi README.md e dimmi cosa contiene» → attrezzo `leggi` eseguito, poi al secondo turno «La risposta del fornitore si è interrotta» dopo 421 pezzi di ragionamento; la stessa conversazione mandata direttamente al motore risponde bene (`finish_reason: stop`, 132 token). Il kernel non legge `finish_reason`: serve il flusso grezzo. Modello da 0,6B: da riprovare con uno più grande | macchina pulita |
| 7 | cinque superfici | chat, terminale (PTY vera, `Git Bash`), impostazioni fotografate; review e browser non catturate (la sonda ha cliccato la voce sbagliata) | **D3 curato**: la riga della sessione stampava «local:Qwen-Qwen3-0-6B-GGUF-…-gguf»; il suggerimento «Impostazioni (Ctrl ,)» resta a schermo dopo il clic (minore, aperto); al primo ingresso nel Terminale ci sono già due schede «Git Bash» e «Git Bash 2» (da capire, aperto) | review e browser a occhio |
| 8 | chiudo e riapro | riaperta in ~4 s; la sessione è nell'elenco (1) | — | — |
| 9 | fermo e riprendo | secondo giro avviato, «ferma» risponde 200 (`rimosso:false` perché il giro era già finito in errore), ripresa 200 | da rifare con un giro lungo su un modello che non si interrompe (dipende da DR1) | macchina pulita |
| 10 | disinstallo | zero processi/collegamenti/registro residui, dati conservati (R-02/R-04) | la cartella `Programs\talos-desktop` resta vuota finché un handle non si chiude (visto 3 volte oggi) | — |

Sul banco (server su porta effimera, mai il 4174) la catena «download → carica → prima risposta» misura: 15 s + 2,1 s + 0,13 s.

## 3 · UX: pulita, rifinita, fluida

- **Pulita** (misurato il 13/09 sull'albero di release): `veli:sani` ⇒ 6 veli su 13 «hanno qualcosa che non si vede o non si raggiunge» e 10 veli senza una via dichiarata per aprirli (`VIE_PER_APRIRE` incompleta: il cancello stesso dice che è un difetto suo); test dei testi (nomi tecnici) e degli errori a runtime dentro le suite unit (999 verdi); nomi tecnici a schermo trovati dal giro: 1 (D3, curato).
- **Rifinita**: spazzata A-bis a due viewport e due temi non fatta oggi: le foto del giro (1440×900, chiaro e scuro) non mostrano disallineamenti evidenti nelle tre superfici viste; le altre due vanno guardate a occhio.
- **Fluida**: va misurata nel browser dell'owner con la GPU accesa; qui solo tempi di rete/API (prima finestra 1,4 s, prima risposta 125 ms col modello locale).

## Cosa resta aperto e perché si rilascia lo stesso

Aperti, dichiarati nelle note di rilascio: (1) il job di release non è mai girato sui runner
GitHub (il tag lo prova); (2) Windows 10 1809, macchina senza Vulkan, SmartScreen da download
reale: non provati (serve un'altra macchina); (3) DR1: con un modello da 0,6B un giro con
attrezzo può interrompersi al secondo turno; (4) `veli:sani` con 6 veli non raggiunti dal
cancello; (5) due schede del Terminale al primo ingresso e suggerimento delle Impostazioni che
resta a schermo; (6) intestazioni SPDX nei sorgenti (R-05c, Astra dal 19/09); (7) UX «fluida»
non misurata nel browser dell'owner.
Si rilascia lo stesso perché la v0.1 è dichiarata sviluppo iniziale (SemVer 0.y), il pacchetto
si installa, si avvia, scarica e carica un modello e risponde in locale senza chiave, si
disinstalla pulito, la licenza e la provenienza sono a posto, e ognuno dei sette punti è
scritto nel changelog e nelle note come limite noto, non nascosto.
