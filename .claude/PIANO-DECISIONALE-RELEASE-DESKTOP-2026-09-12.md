# Piano decisionale — la prima release desktop di TALOS (12/09/2026)

> Owner, 12/09/2026, verbatim: «appena terminiamo la coda che ti ho detto io, appiattiamo tutti i
> bug, i debiti possibili; mi dici tu quando fare un piano per prepararci alla prima release desktop.
> Nella repository adesso è prevista solo la versione mobile, con le release mobile, i ritmi mobile:
> si deve riprogettare e mettere il desktop come piattaforma principale, ma non che copra la versione
> mobile. La mobile è comunque una piattaforma principale, ma deve essere associata al desktop. Il
> collegamento fra le due (magari un tunnel SSH) ne parleremo dopo la prima release. Voglio un piano
> decisionale con le domande decisionali per fare un'applicazione desktop, che possa anche girare sul
> browser, ma io voglio un'applicazione desktop un po' come Hermes. Prima di tutto Windows.»

Fonte dei fatti: `.claude/RICERCA-RELEASE-DESKTOP-2026-09-12.md` (ricerca del 12/09, fonti primarie
con data; Hermes letto nel codice del clone dell'08/09 e sul suo sito). Qui non c'è un numero che non
stia lì con la sua fonte. Le durate non misurate non sono scritte.

---

## 0 · Cosa è già deciso, e resta

| decisione | quando | conseguenza per questo piano |
|---|---|---|
| Repo pubblico **nuovo** `talos-harness-desktop`, `harness-ui/` come radice, primo commit «TALOS Harness Desktop v0.1.0», storia non riscritta | owner 07/09 | la catena di rilascio desktop nasce nel repo nuovo; il monorepo resta la casa del mobile e dello sviluppo |
| `main` avanza solo a ridosso del rilascio | owner 07/09 | nessun merge prima del tag |
| Nessuna traccia di agenti AI nel repo pubblico | owner 07/09 | il repo nuovo parte da un albero ripulito (commenti nel codice ancora in corso) |
| Tabella di marcia di pre-release con ricerca «dell'ultimo mese» rifatta allora, prove da utente appena installato, UX rifinita | owner 07/09, `PIANO-PRE-RELEASE-2026-09-07.md` | scatta al trigger (§12), non ora |
| Kernel nel repo, CI desktop, pacchetto zip 5,2 MB che si avvia in CI | 07/09, chiusi | base su cui si costruisce l'installer |
| Collegamento mobile↔desktop (tunnel, controllo remoto) | owner 12/09: «dopo la prima release» | fuori dalla v0.1, dichiarato nel README |

---

## 1 · Le undici decisioni

Per ognuna: i fatti, cosa fa Hermes, il mio consiglio, e **cosa decidi tu**. Dove non c'è niente da
decidere lo dico: è tecnica, e la faccio.

### D1 · Il guscio — Electron, Tauri, o niente

**Fatti.** Il lab `harness-ui/labs/electron-shell/` (04/09) è già un guscio Electron 44.2.0 sottile:
server Node come figlio con token di loopback, finestra unica, istanza unica, riavvio del figlio su
crash, `contextIsolation`/`sandbox` accesi. Manca: tray, notifiche, installer, updater, hardening.
Electron stabile oggi è **44.3.0** (08/09/2026, Chromium 152, Node 24.20). Tauri 2.11.5 non porta
Node: il nostro server resterebbe un sidecar e pagheremmo Rust + MSVC senza guadagno; il peso non lo
decide il guscio ma cosa ci metti (Ollama 1,57 GB, Jan/Tauri 57,8 MB).
**Hermes.** App desktop Electron (40.10.2) + Vite + electron-builder, agente Python come processo
separato su `127.0.0.1:0`, token riletto dalla fonte di verità.
**Consiglio.** **Electron**, il lab promosso a pezzo di prodotto, aggiornato a 44.3.0. Il server resta
un figlio Node: `node-pty` non chiede rebuild (Hermes, che lo tiene dentro Electron, porta
`@electron/rebuild` e uno script di staging).
**Decidi tu:** sì / no al guscio come prodotto.

### D2 · Server: figlio o dentro il guscio

**Consiglio.** Figlio, come oggi e come Hermes. Niente da decidere: è tecnica.

### D3 · Formato di installazione su Windows

**Fatti.** electron-builder 26.16.1: NSIS di serie, MSI, MSIX/AppX, portable, zip; l'auto-update di
electron-builder funziona **solo su NSIS**. winget vuole installazione silenziosa e manifest 1.12.
**Hermes.** NSIS (e MSI su richiesta) per Windows, DMG per macOS, curl per Linux; installer sottile.
**Consiglio.** **NSIS per-utente** (niente amministratore, come chiedono le regole di casa
[[per-user-installs-only]]) **più lo zip di oggi** per chi ha Node; winget dopo la v0.1; Store più
avanti.
**Decidi tu:** se vuoi anche l'MSI (uso aziendale) già nella v0.1.

### D4 · La firma del codice — la decisione che cambia da sola il calendario

**Fatti (Microsoft, pagine aggiornate 12/09 e 17/08/2026).** «Trusted Signing» oggi è **Azure
Artifact Signing**: *individual developers must be located in the United States or Canada* ⇒
dall'Italia solo **come organizzazione**; da **$9,99/mese** dichiarati, sottoscrizione Azure a
pagamento, validazione **1-20 giorni lavorativi**; *EV certificates no longer bypass SmartScreen*.
Senza firma ogni release riparte da reputazione zero («several weeks and hundreds of clean
installs») e Smart App Control su Windows 11 può bloccare l'avvio.
**Hermes.** `signAndEditExecutable: false`: non firma, o non nel repo.
**Consiglio.** **v0.1 senza firma**, con attestazione di provenienza GitHub (gratis sui repo pubblici)
e SHA256 nelle note di rilascio, e **una frase nel README e nella pagina di download che dice cosa
vedrà chi installa** («Windows protected your PC») e come verificare l'impronta. **Niente EV.**
**Decidi tu (prima della v0.2):** aprire la pratica Azure Artifact Signing come persona giuridica —
sì subito / dopo la v0.1 / mai. Se «mai», si accetta la reputazione zero a ogni release.

### D5 · Aggiornamenti

**Fatti.** electron-updater solo su NSIS, provider GitHub, `stagingPercentage`; MSIX ha
l'aggiornamento nativo; Velopack 1.2.0 esiste (documentazione **non letta**: non lo consiglio su
fiducia). Hermes **non usa** electron-updater e ha scritto il perché (`windows.ps1`, incidente del
09/08/2026: l'updater congelato nel binario restava indietro): aggiorna con `hermes update` (git +
rebuild) e «fail closed».
**Consiglio.** **v0.1 senza auto-update**: solo l'avviso «c'è una versione nuova» che apre la pagina
di download. **v0.2 electron-updater su NSIS**, due canali (stabile/beta), rollback documentato.
**Decidi tu:** quando accendere l'auto-update (v0.2 è il mio consiglio).

### D6 · Runtime e binari pesanti

**Fatti.** `llama-server` sul nostro disco pesa 161 MB; un GGUF va da centinaia di MB a decine di GB.
Ollama porta tutto dentro (1,57 GB); Jan scarica i modelli dopo (57,8 MB); Hermes scarica Python, git
portatile e ripgrep al primo avvio.
**Consiglio.** **Installer sottile**: Node dentro Electron, mai un GGUF nel pacchetto, `llama-server`
(CPU e Vulkan) scaricato **su richiesta** al primo uso del motore locale, con impronta verificata.
Niente da decidere: i numeri decidono.

### D7 · La modalità browser

**Fatti.** Il lab ha già il token di loopback (cookie HttpOnly, SameSite=Strict) e la porta effimera;
il browser sulla stessa macchina apre `http://127.0.0.1:<porta>/?token=…` una volta e poi vive col
cookie. Hermes espone i gateway remoti con header dedicati; Open WebUI è nato per la LAN.
**Consiglio.** **v0.1: solo la stessa macchina** (loopback + token); dalla finestra un'azione «Apri
nel browser» che copia il collegamento con il token. LAN e tunnel: dopo, con il mobile.
**Decidi tu:** conferma che LAN/tunnel restano fuori dalla v0.1.

### D8 · La catena di rilascio con due piattaforme

**Fatti.** Oggi `release.yml` ha `apk` su `v*` e `desktop` su `desktop-v*`, ma **tutti e quattro i
job di CI girano su `ubuntu-latest`**: un `.exe` richiede un runner `windows-latest`, che non esiste.
`VERSION` e `CHANGELOG.md` sono del mobile.
**Consiglio.** Repo nuovo (già deciso): **versioni indipendenti**, desktop da `0.1.0` con
`CHANGELOG` proprio; nel monorepo resta la lane di sviluppo con il job `desktop` che continua a
provare lo zip. Nel README del desktop **una riga** che dice quale versione mobile è la compagna e
che il collegamento arriva dopo. Attestazione di provenienza in tre righe di workflow; SBOM da
valutare a parte (documentazione non letta).
**Decidi tu:** conferma del repo nuovo e della **licenza** (oggi il repo è Apache 2.0; Hermes è MIT).

### D9 · Cosa dichiara la v0.1

**Fatti.** `node-pty` impone **Windows 10 1809 o più recente**; il motore locale vuole una GPU
Vulkan per andare veloce, altrimenti CPU.
**Consiglio.** Requisiti scritti (Windows 10 1809+/11, RAM, GPU facoltativa), limiti per nome (niente
auto-update, niente firma, niente collegamento mobile, solo Windows), **niente telemetria**, dati
solo sul disco della persona, licenza dichiarata.
**Decidi tu:** telemetria zero sì/no; licenza (vedi D8).

### D10 · Prova da macchina pulita

**Fatti.** Windows Sandbox (non su Home, usa e getta, rete attiva di serie) per il giro umano;
`windows-latest` in CI per il cancello che installa, avvia e chiede `/api/v1/health`. Hermes ha
`test-desktop.mjs fresh/existing/nsis`.
**Consiglio.** Entrambe. Niente da decidere.

### D11 · Quando fare i due piani

**Il piano decisionale è questo, adesso**: le scelte D1/D4/D8 cambiano il lavoro della coda (il
guscio diventa prodotto con i suoi cancelli; la pratica di firma vuole 1-20 giorni lavorativi
davanti). **La tabella di marcia di pre-release** scatta al trigger già scritto il 07/09, con la
ricerca «dell'ultimo mese» rifatta allora (questa non la sostituisce). Criterio osservabile:
1. nessuna riga **bloccante** aperta nella coda (le non bloccanti si dichiarano);
2. cancelli verdi **due volte di fila** sullo stesso codice;
3. un giro vero col modello, con foto durante, su un profilo che non ha mai visto TALOS.
Nessuna data da me: non ho una misura del ritmo di chiusura della coda.
**Decidi tu:** il via alle righe di lavoro di §2 dopo aver risposto alle sei domande.

---

## 2 · Le righe di lavoro che seguono (dopo le tue risposte)

Ordine consigliato; ogni riga con il suo cancello. Niente ore: si misurano quando si fanno.

| riga | cosa | cancello | chi |
|---|---|---|---|
| R-01 | Guscio: il lab diventa `harness-ui/desktop/` (Electron 44.3.0, `contextIsolation`, `sandbox`, istanza unica, tray minima, «Apri nel browser») | Playwright `_electron`: finestra, health 200 col cookie, PTY vero nel Terminale, chiusura che uccide il figlio | Opus 5 High |
| R-02 | electron-builder: NSIS per-utente + zip; icona, nome, versione da `package.json`; niente GGUF, niente `.local-runtime` nel pacchetto | pacchetto costruito su `windows-latest`, peso misurato e scritto | Opus 5 High |
| R-03 | `llama-server` su richiesta: download al primo uso con impronta, scelta CPU/Vulkan dalla macchina | test nei due versi (impronta sbagliata ⇒ rifiuto); foto del primo avvio | Opus 5 High (dopo BC-13) |
| R-04 | CI: job `windows-latest` che costruisce, installa in silenzio, avvia, chiede `/health`, disinstalla; attestazione di provenienza; SHA256 nelle note | il job verde due volte di fila | Opus 5 High |
| R-05 | **Monorepo pubblico nuovo** (vedi §4): script di esportazione dell'albero pulito, tracce di agenti nei commenti tolte, `LICENSE` AGPL-3.0 + `NOTICE`, `VERSION`/`CHANGELOG` desktop, README con requisiti, limiti, avviso SmartScreen, riga sulla mobile compagna | cancello dei dati personali su tutto l'albero; README letto da un utente nuovo | io + Opus |
| R-06 | Misure mai prese: peso installer, RAM a riposo, tempo dal doppio clic alla prima schermata | tre numeri nel ledger, macchina dichiarata | io |
| R-07 | Pratica Azure Artifact Signing (solo se dici sì): apertura, validazione, `AZURE_*` in electron-builder | primo `.exe` firmato che SmartScreen non ferma | owner (pratica) + Opus |
| R-08 | Pre-release: ricerca «dell'ultimo mese», dieci passi da utente nuovo in Windows Sandbox, UX pulita/rifinita/fluida | `PIANO-PRE-RELEASE-2026-09-07.md`, riga per riga | io + Opus |
| R-09 | Tag `desktop-v0.1.0`, `main` che avanza, pubblicazione nel repo nuovo | pagina delle release con installer, zip, SHA256, attestazione | owner (push e tag) |

---

## 3 · Le sei domande, secche

1. **Guscio Electron** come pezzo di prodotto: sì / no / dopo.
2. **Pratica di firma** Azure Artifact Signing come organizzazione ($9,99/mese dichiarati, Azure a
   pagamento, 1-20 giorni lavorativi): sì subito / dopo la v0.1 / mai.
3. **La v0.1 esce non firmata** con l'avviso scritto: sì / no.
4. **Licenza** del repo nuovo: Apache 2.0 come oggi / altro.
5. **Telemetria zero**, dichiarata: sì / no.
6. **Via alle righe R-01…R-06** (quelle senza firma) appena la coda è chiusa: sì / dopo.

Le decisioni tecniche (D2, D6, D10) e i consigli su D3/D5/D7/D9 li applico così come sono scritti,
salvo tuo contrordine.

---

## 4 · Le risposte dell'owner e i consigli dati (12/09/2026, ore 13)

Owner, verbatim: «1 cosa consigli? 2 cosa consigli? 3 cosa consigli? 4 mettiamo tutto AGPL 3 · 5 cosa
consigli? 6 cosa consigli?» e poi: «ATTENZIONE, mettiamo tutto nel repo pubblico o consigli di fare
un nuovo repo? io avevo pensato un monorepo».

| # | domanda | risposta / consiglio | stato |
|---|---|---|---|
| 1 | guscio Electron | **sì**: il lab diventa prodotto, aggiornato a 44.3.0 | consigliato, attende il sì |
| 2 | pratica di firma | **dopo la v0.1**, e solo se esiste una persona giuridica con cui aprirla (dall'Italia la via individuale non c'è). Senza persona giuridica: «mai per ora», si vive con l'avviso. Aprirla ha senso insieme all'auto-update della v0.2: un aggiornamento automatico non firmato è peggio di un installer non firmato | consigliato, attende il sì |
| 3 | v0.1 non firmata con avviso scritto | **sì** | consigliato, attende il sì |
| 4 | licenza | **AGPL-3.0 su tutto** — DECISO dall'owner. Conseguenze: chi offre TALOS come servizio in rete deve pubblicare le modifiche (è il motivo per cui si sceglie AGPL); le dipendenze Apache-2.0/MIT/ISC/BSD entrano in un progetto AGPL senza problemi; da fare: `LICENSE` nuovo, intestazioni/`NOTICE`, `package.json` `"license": "AGPL-3.0-only"`, controllo di `THIRD_PARTY_NOTICES.md` (nessuna licenza SSPL/BUSL/non-commercial trovata al 12/09); l'owner è l'unico autore dei commit (`antoninorizzo`/`Ninozzz95`), quindi il cambio da Apache 2.0 non ha bisogno di consensi di terzi | **deciso** |
| 5 | telemetria zero, dichiarata | **sì** | consigliato, attende il sì |
| 6 | via alle righe senza firma appena la coda è chiusa | **sì** | consigliato, attende il sì |
| repo | «tutto nel repo pubblico o repo nuovo? pensavo un monorepo» | **Monorepo pubblico NUOVO, storia appiattita** — vedi sotto | consigliato, attende il sì |

### Il repo: perché un monorepo nuovo e non «questo reso pubblico»

- Questo repo è **privato** oggi, ed è già un monorepo (`harness-ui/`, `mobile/`, `core/`,
  `control-plane/`, i worker, `docs/`): la forma che vuoi esiste già, non va creata.
- Renderlo pubblico così com'è porta in pubblico **tutta la storia**: 122 trailer di agenti AI negli
  ultimi 400 commit, `.claude/` passata per 540 commit e 1.299 file, `scratchpad/`, percorsi
  personali nei messaggi, tre sottomoduli (`.gitmodules`). Riscriverla (`filter-repo`) cambia 2.077
  SHA, obbliga a un force-push che le regole di casa vietano di far eseguire a me, e non garantisce
  di aver tolto tutto.
- Un repo **solo desktop** (deciso il 07/09) separerebbe la mobile che vuoi «associata»: contratti
  condivisi in due posti, due CI da tenere allineate.
- ⇒ **Consiglio: un monorepo pubblico nuovo** (nome da decidere, es. `talos`), con la stessa
  struttura di questo, un primo commit «TALOS v0.1.0 — desktop e mobile», licenza AGPL-3.0, senza
  `.claude/`, `scratchpad/`, `.talos/`, `test-results/`, e con il cancello dei dati personali passato
  su tutto l'albero. **Questo repo resta privato ed è dove si sviluppa**; a ogni release uno script
  esporta l'albero pulito nel pubblico (snapshot, non merge). Le release restano per piattaforma:
  `desktop-v*` e `v*` (mobile) come già in `release.yml`.
- Costo dichiarato: lo script di esportazione con il cancello dei dati personali (R-05 cambia forma:
  «monorepo pubblico» invece di «repo desktop»), e il fatto che i contributi esterni arrivano sul
  pubblico e vanno riportati a mano nel privato finché non si decide di sviluppare in pubblico.
- Alternativa se preferisci un solo repo: sviluppare direttamente nel pubblico nuovo dopo la v0.1,
  archiviando questo. Si decide dopo la prima release, non ora.

---

## Cosa devi fare tu · Cosa faccio io · Cosa rimane

**Cosa devi fare tu:** le sei risposte qui sopra, quando vuoi; nessuna blocca la coda di oggi.
**Cosa faccio io:** finisco la coda (BC-13, BC-08/10, L10, BC-35, BC-36, BC-37, P-D…P-L); al tuo sì
parto con R-01/R-02/R-04 in parallelo (file disgiunti); R-08 solo al trigger di §D11.
**Cosa rimane, non misurato:** peso/RAM/avvio del guscio; tempo di build su `windows-latest`; prezzi
Azure in cifre; livello SLSA delle attestazioni; dimensioni degli installer di Hermes e LM Studio;
Velopack non letto; SBOM non valutata.
