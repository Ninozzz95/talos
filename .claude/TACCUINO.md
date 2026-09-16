# Taccuino — i fatti MISURATI, che non vanno ri-dedotti

> Non è un diario. Solo ciò che è costato una misura vera e che un riassunto
> non ricostruisce. Una riga per fatto, col numero dentro.

## 2026-09-08 — il browser pilotato: fluidità, finestre, spazio

- **Il trasporto CDP consegna ~100 fotogrammi al secondo** su 127.0.0.1, e sono **gli stessi** con la
  finestra davanti (599 in 6 s), con la finestra COPERTA da un'altra (599) e in headless (599).
  ⇒ una finestra visibile non serviva a vedere: serviva solo a disturbare. Il collo era nostro:
  `FOTOGRAMMI_AL_SECONDO_PREDEFINITI = 15` buttava l'85% di fotogrammi già compressi in JPEG.
- **Con la pagina in movimento si dipingono 32,3 fotogrammi al secondo**, pausa più lunga 62 ms
  (misurato contando i `drawImage` sulla tela, non le rotelle mandate).
- ⛔ **La sonda dei fotogrammi ha mentito due volte prima di dare quel numero**: la prima contava le
  rotelle che mandavo io (8/s, che era la mia cadenza), la seconda misurava una pagina ferma dopo
  una spinta sola (1,2/s, che è giusto ma non dice niente sulla fluidità). Una sonda sui fotogrammi
  si prova con una leva di effetto noto: `everyNthFrame:3` deve dare esattamente un terzo (499 → 166)
  e senza `screencastFrameAck` il flusso deve fermarsi a 3 fotogrammi.
- **`maxWidth`/`maxHeight` di `Page.startScreencast` sono un TETTO, non una misura**: la dimensione
  del fotogramma la decide il viewport (`Emulation.setDeviceMetricsOverride`), che si cambia a caldo,
  mentre lo screencast non si ri-negozia da solo. Con un tetto a 800 un riquadro alto 830 riceveva
  893×800 per sempre.
- **Cambiare il viewport non basta a far arrivare un fotogramma nuovo**: una pagina ferma non
  ridisegna e lo schermo resta con la forma vecchia. Si ri-chiede `Page.startScreencast` (è
  idempotente e il primo fotogramma dopo la chiamata è completo).
- **Lo spazio del pannello Browser**, stessa finestra, prima → dopo: riquadro **571 → 962 px** a
  1920×1200, con lo scoperto a **0**. I 24 px che non riuscivo a togliere venivano da
  `#schermoBrowser .talos-page`, non dalla regola che stavo modificando: il valore CALCOLATO a
  schermo diceva 24px mentre nel sorgente ne avevo appena scritto 0.
- **Le sei azioni della riga stanno in 559 px** + 5 gap; a 1280×620 l'area utile è 582 e ne servivano
  583: mancava **un pixel**, e prima ancora lo spaziatore `flex-grow` si prendeva il residuo
  spingendo l'ultimo pulsante a capo.
- **L'agente riceve una fetta della pagina**, e il numero è grosso: su `github.com/Ninozzz95/talos`
  **4,1k caratteri su 492k** (meno dell'1%); su 7 letture, 5 erano tagliate.

## 2026-08-08 — motore locale
- GBNF per 46 tool = **55.871 byte**; il parser rifiuta con *«number of rules
  that are going to be repeated multiplied by the new repetition exceeds sane
  defaults»*. Causa: `maxLength` dei nostri `z.string().max(N)`.
- `stderr` su Android **non va da nessuna parte**: llama.cpp ci scrive le
  diagnosi. Senza la pipe verso logcat non si vede niente.
- ⛔ REGRESSIONE APERTA: con la grammatica applicata il tool **non parte più**, e
  il modello risponde «Fatto, torcia spenta» lo stesso. Nessuna scheda di
  consenso, nessun evento in `dumpsys media.camera`. Grammatica **pigra, 1 solo
  innesco** — è la prima cosa da guardare.
- Prefisso congelato: **9.282 token riusati su 9.498**, 216 nuovi per messaggio.
  ⇒ accorciare il prompt di sistema NON è la leva.
- Generazione ~4 tok/s, **5-14% della banda del chip**: la leva è lì.

## 2026-08-08 — telefono e permessi
- Il Pad **non ha il motore della vibrazione**: `no-vibrator` è un esito vero.
- La torcia si verifica con `dumpsys media.camera | grep "torch for camera"`:
  elenca ogni **cambio di stato** con ora e PID. Chiamare «accendi» su una
  torcia già accesa NON lascia traccia.
- Lo sfondo si verifica con `dumpsys wallpaper | grep "id:"` (37 → 38).
- `KEEP_SCREEN_ON` si verifica in `dumpsys window` sulla finestra di TALOS.
- Le chiavi dei provider stanno in `WSSecureStorageSharedPreferences.xml`,
  **non** in `CapacitorStorage.xml`.
- Libreria: **4 righe, 3 file su disco** — `button_a.png` non ha il file.

## 2026-08-08 — il telecomando
- `adb shell input text` si rompe sugli **apostrofi** («no closing quote»).
- Una chiave lunga non entra in un colpo: pezzi da ~18 caratteri con pausa.
- Il tocco parte prima che lo scorrimento si fermi: `find` → **pausa** → `tap`.
- Il chip del modello nel compositore compare **col fuoco sul campo**: è lo
  stato compatto voluto dall'owner, non un difetto.

## 2026-08-19 — parity e sonda cancel
- La sonda `cancel` della diagnostica parity misurava il **segnale** di abort
  (~0 ms), non lo stop del motore: un motore che ignora lo stop passava
  `pass`. RED permanente: motore che si spegne a 30 s con tetto 2,5 s → `fail`.
- MDN, `Promise.race()`: la corsa **marca come gestite** tutte le promesse in
  ingresso — il rigetto tardivo del ramo perdente NON diventa unhandled
  rejection. Nessun guardiano aggiuntivo serve.
- Tree parity (19/8): suite 620 file / 5.622 test / 0 rossi; typecheck verde;
  catena npm build → cap sync → assembleDebug verde (588 task, 29 eseguiti).
- Sul Pad: GGUF del gate byte-exact — Gemma 2.489.758.112, Qwen3
  1.673.007.232; residuo di campagna `talos-fixture.gguf` (shell,
  2.019.377.696 B) da pulire.
- I due APK «Desktop» citati dall'handoff 19/8 non esistono sul Desktop: sul
  disco ci sono `TALOS-apk/TALOS-0.1.8.apk` e `Downloads/TALOS-0.1.11.apk`;
  v0.1.13 solo su GitHub (sha `52ffd15d…`).
- `versionName 0.0.0` sul Pad = default dei build locali (`build.gradle`); la
  CI inietta la versione dal tag.
- Regola owner 19/8: **mai** modifiche di codice senza suo ordine esplicito;
  i documenti li aggiorna l'agente.

## 2026-08-19 sera — le sonde della 0.1.15 (Pad, ai.talos di produzione)
- IL PERCORSO DELLA RELEASE: i secret di firma stanno SOLO sul repo pubblico
  Ninozzz95/talos; il privato agent-virtual-machine ne ha ZERO ed e' giusto
  cosi'. Un tag pushato sul privato accende un workflow che non puo' firmare.
  I tag di release si pushano SOLO sul pubblico.
- tar in PowerShell risolveva a Git Bash (usr/bin/tar), che legge un percorso
  C:\ come HOST REMOTO: "Cannot connect to C: resolve failed". Lo script di
  preparazione estraeva ZERO file e committava la cancellazione di 1.612 file.
  La copia si controlla SEMPRE con git -C <copia> diff --stat <pubblicato> HEAD
  prima del push. Cura senza toccare codice: System32 in testa al PATH.
- Con Qwen3-1.7B.Q4_K_M gli strumenti offerti sono 64 e il template nativo li
  supporta (supporta=true): NON e' vero che i locali non hanno accesso ai tool.
  Il difetto e' che non li CHIAMANO.
- "Dove mi trovo adesso?" -> device_location PARTE e torna lat/long veri
  (41.899925, 12.478631 = Roma), ma il modello scrive "Location: Milan, Italy".
  Il tool NON restituisce la citta' e la sua descrizione lo vieta: la citta' e'
  INVENTATA dal modello. Difetto grave.
- "fai una ricerca web sulle novita di Android 16" -> NESSUN tool chiamato, ne'
  web_search ne' research_start: risposta inventata a memoria. Il logcat mostra
  "Grammar still awaiting trigger" per tutta la generazione: la grammatica
  pigra dell'8 agosto, ancora aperta.
- Le risposte arrivano in inglese a domande in italiano.

## 2026-08-23 — campagna `storia` chiusa 40/40, e l'ambiente che si eredita da solo
- Rapporto finale (`rapportoCampagna.mjs` su `esiti-22ago-storia`, modello
  `z-ai/glm-4.7-flash`/openrouter): **risolti su 5** — aider 2, claude 2, dsh 2,
  hermes 1, codex 0, pi 0, talos 0, (nessuno) 0.
- **Costo per risolto**: aider $0,0021, dsh $0,0504, hermes $0,1020,
  claude $0,1158. codex/pi/talos/(nessuno) non hanno la colonna: zero risolti.
- ⛔ Con 5 task a testa **nessuna coppia di harness si distingue** (bootstrap
  95%, 1.000 giri): intervalli larghi ~27 punti, si sovrappongono TUTTI —
  anche "2 risolti" contro "0 risolti" resta ufficialmente "ignoto".
- talos, i 5 fallimenti uno per uno: `storia-297adb2` e `storia-0b81c88`
  dicono ORA testualmente *"⛔ giri esauriti: 24 su 24"* (l'harness ha
  imparato a dirlo); `storia-07f0799` (22/8, prima della cura) si fermava a
  meta' frase per lo stesso motivo senza ancora saperlo dire;
  `storia-1a20be5` e' `rottoAltrove` (`cambiamenti.quanti:0`, anomalia MAI
  spiegata); `storia-2b1eb34` e' fallimento di ragionamento genuino.
- ⛔⛔ **`corsaCoding.mjs` senza `BANCO_PROVIDER`/`BANCO_MODELLO`/`BANCO_CORPUS`
  espliciti nell'ambiente non fallisce e non avvisa**: gira lo stesso, silenzioso,
  su `claude-haiku-4-5-20251001`/anthropic (il default del harness) e sul
  corpus INTERO non filtrato. Scoperto dal vivo: un rilancio della riga
  `codex` e' partito cosi' per errore, ha speso credito Anthropic reale su 12
  task del corpus «progetti» prima di essere fermato — zero relazione con la
  riga che doveva riempire. Quarta forma dello stesso difetto di
  [[lambiente-del-figlio-si-dichiara]].
- Il rilancio corretto (`BANCO_ESITI`/`BANCO_CORPUS=storia`/
  `BANCO_PROVIDER=openrouter`/`BANCO_MODELLO=z-ai/glm-4.7-flash` espliciti) ha
  chiuso la riga `storia-0b81c88`/codex: 3 giri reali, costi
  $0,0875+$0,0561+$0,0867, esito passato da "ignoto" a **"fallito"** (misura
  vera, non piu' un buco). Il campo `costoUsd` di riga vale $0,0867 — quello
  dell'ULTIMO giro, non la somma dei tre ($0,230): stessa firma di
  [[tre-ripetizioni-pagate-una-usata]], confermata con numeri freschi.
- Saldo OpenRouter **$2,4858** su un budget autorizzato di €2,50, misurato
  DOPO il primo tentativo (quello finito ignoto) e PRIMA del rilancio
  corretto — non ri-misurato dopo, quindi non dichiaro qui il saldo attuale.
- Stadio A (compattazione ogni 8 giri + riflessione ogni 6, commit `587f989`
  su `lane/harness-coding`, 28/28 test verdi): verifica dal vivo su
  `esiti-23ago-stadioA-verifica` avviata lo stesso giorno, **ancora in corso**
  — 7/35 task quando scritto qui, tutti falliti finora (atteso su questo
  corpus: la campagna intera risolve 10/40), non ancora arrivata ai 2 task di
  riferimento congelati (`storia-07f0799`, `storia-297adb2`).
- Ricerca delle 22 fonti per il piano di auto-miglioramento: custodita per
  intero in `C:\Users\Antonino\.claude\plans\elegant-spinning-dongarra.md` —
  non duplicata qui.
- ⛔ Il campo `costoUsd` in cima alla riga NON e' in modo affidabile «l'ultimo
  giro»: su `storia-297adb2` (vecchia riga) combacia col giro **1**, su
  `storia-07f0799` (vecchia riga) col giro **3**. Raffina
  [[tre-ripetizioni-pagate-una-usata]] — quel campo non si usa da solo per
  confronti; si usa la SOMMA dei tre `giriDelTask[].costoUsd` (sempre
  inequivocabile) o i conteggi token diretti.
- ⭐⭐ **Confronto vero sui DUE task di riferimento congelati, prima/dopo
  Stadio A** (righe jsonl complete, costo = somma dei 3 giri):

  | campo | `storia-07f0799` | `storia-297adb2` |
  |---|---|---|
  | token dentro | 234.393→**149.498** (−36,2%) | 276.549→**119.090** (−56,9%) |
  | di cui da cache | 218.304→**116.672** (−46,5%) | 253.248→**83.712** (−67,0%) |
  | token fuori | 2.339→**4.069** (+74,0%) | 1.528→**3.946** (+158,2%) |
  | costo totale (3 giri) | $0,02481→**$0,01973** (**−20,5%**) | $0,01856→**$0,01407** (**−24,2%**) |
  | tempo mediano | 105.142→90.963 ms (−13,5%) | 106.636→**160.565 ms (+50,6%, molto piu' lento)** |
  | esito | fallito/giri esauriti, invariato | fallito/giri esauriti, invariato |
  | **`storia-0b81c88`** (terzo, aggiunto dopo) | | |
  | token dentro | 434.940→**152.569** (−64,9%) | |
  | di cui da cache | 399.424→**123.136** (−69,2%) | |
  | token fuori | 1.534→**4.215** (+174,8%) | |
  | costo totale (3 giri) | $0,01699→**$0,01333** (**−21,6%**) | |
  | tempo mediano | 53.850→65.265 ms (+21,2%) | |
  | esito | fallito/giri esauriti, invariato | |

  ⇒ **Con tre task su tre**: il costo scende sempre (~20-25%), il contesto
  grezzo scende sempre di piu' (fino a −65%), la cache cade ancora di piu'
  (fino a −69%) — la fonte #16 del piano aveva ragione a segnalarlo, ma il
  taglio sul contesto vince comunque sulla cache persa. Il tempo di parete
  peggiora in 2 casi su 3 (la compattazione stessa costa un giro pieno di
  andata/ritorno col modello, senza avanzare il task). **Nessuno dei tre
  riferimenti si chiude**: 24/24 giri esauriti in tutti e tre, prima e dopo.
  Coerente col piano: Stadio A doveva abbassare il costo per giro, non
  alzare `GIRI_MASSIMI` — quella mossa resta la prossima, non ancora presa.
- Sweep piu' ampia (35 task): fermata **killed** dall'esterno a **33/35**
  (non da me, nessun `TaskStop` chiamato) — tally finale sulle 33 righe scritte:
  **2 riuscito** (`storia-493fc6c`, `storia-3d9be1d`), **29 fallito**,
  **2 rottoAltrove**. Le 2 mancanti non toccano nessuna delle conclusioni
  sopra: i 3 riferimenti congelati e i 2 esempi positivi erano gia' dentro
  le 33.
- Sweep piu' ampia (35 task fino a difficolta' 4, `esiti-23ago-stadioA-verifica`,
  non solo i 2 congelati): primo **riuscito** a `storia-493fc6c` (difficolta' 2,
  243 s, $0,010) — 1 risolto su 27 fatti quando scritto qui, il resto fallito
  o `rottoAltrove`. Non e' un confronto prima/dopo (talos non aveva mai
  corso questo task nella campagna originale), ma prova che Stadio A non
  impedisce di risolvere un task vero quando il ragionamento regge.

## 2026-08-24 — voce personale, "Codifica la voce" rotta al 100%, non un caso raro
- Screenshot dal Pad: `TalosPocketEnrollmentProfileBuilder.kt:90-92` aveva
  `require(acceptedPhrases.none(::cancelled)) { "a cancelled capture cannot
  be used for voice enrollment" }`, mostrato GREZZO in inglese sullo schermo
  italiano (`buildError.value = cause.message`, tre siti nello stesso file).
- Tracciato end-to-end, 6 file: `TalosVoiceRecorder.kt` marca
  `cancelled=true` ogni volta che il ciclo si ferma perche' `isCancelled()`
  torna true — ed `e' esattamente il segnale che parte a OGNI `pointerup`
  (rilascio deliberato del pulsante "tieni premuto per registrare"), non
  solo su un'interruzione vera. `TalosVoiceQuality.evaluate()` non legge mai
  `.cancelled`. `TalosNeuralVoicePlugin.kt` non filtra `enrollmentSlots` per
  quel campo. ⇒ **ogni frase registrata nel modo previsto (rilascio del
  pulsante) porta `cancelled=true` fino al build**, e il `require()` la
  respingeva SEMPRE, non in un caso limite. Confermato via ricerca web (spec
  W3C Pointer Events): `pointerup` = rilascio deliberato, `pointercancel` =
  interruzione di sistema — semanticamente diversi, ma
  `TalosMobilePersonalVoiceEnrollment.vue` li instradava allo stesso
  `stopRecording()`, perdendo la distinzione prima che raggiungesse il nativo.
- Zero test, in nessuna direzione, esercitavano quel `require()` (verificato
  a grep sull'intero file di test) — il difetto non poteva essere visto
  finché qualcuno non registrava 12 frasi vere.
- Cura: rimosso il `require()` rotto (la vera protezione resta
  `TalosVoiceQuality.evaluate()`, che già copre durata/silenzio/clipping/DC
  offset), due chiavi i18n nuove (`buildFailed`/`saveFailed`, it+en) al posto
  del messaggio grezzo, 2 test di regressione nuovi (PVOICE-UI-12/13) che
  provano SIA il testo localizzato SIA l'assenza della stringa nativa a
  schermo — prima non esisteva nessuna prova in nessuna delle due direzioni.
  Verificato: Kotlin 8/8, vitest componente 13/13, `npm run build` pulito
  (612.822 B, sotto i 613.000), typecheck pulito. APK debug consegnato
  spezzato per conferma sul Pad — non ancora verificato da una voce reale.
- Trovato guardando lo STESSO screenshot, non ancora curato: il banner verde
  "Verifica sull'insieme superata" (`reviewTitle`/`reviewPassed`) e' mostrato
  SEMPRE allo stage 'review', senza nessuna chiamata reale dietro — il vero
  cancello sull'insieme unito gira solo dentro `build()`, DOPO. E il catch di
  `onMounted` scrive `buildError` mentre lo stage e' ancora 'consent', dove
  il template non lo mostra mai: un errore di avvio del plugin sparirebbe
  in silenzio.
- ⛔⛔⛔ **VERIFICATO SUL PAD REALE, dall'inizio alla fine, owner presente in
  tempo reale sulla stessa sessione** (24/8, dopo l'ordine "non si chiude se
  prima non lo fai"): installato `ai.talos` (non `ai.talos.dev` - il build
  side-by-side fallisce a freddo, `ggml_cpu_has_neon` non definito, causa
  probabile `build.gradle`/JNI di Agente 19 non committati - MAI toccato),
  motore Pocket scaricato per davvero (158 MB, non simulato), 12 frasi
  registrate con hold reali via `adb input swipe` (non testo finto: il
  microfono vero cattura il rumore ambiente, e le soglie di qualità - picco
  ≥0,001, silenzio ≤90% - lo accettano onestamente, senza bisogno di parlare
  davvero), "Codifica la voce" **premuto e riuscito**, "Ascolta com'è venuta"
  **sintetizzato per davvero**, "Salva la voce" **committato** - il profilo
  "ProvaFix24Agosto" è comparso nell'elenco accanto a "Nino" (quello vero,
  preesistente, mai toccato), poi eliminato per pulizia (verificato anche sul
  file system: solo il `.tvp` di Nino resta). Zero crash, zero stringa
  inglese a schermo.
- ⛔ Due rilievi minori nello stesso giro, NON ancora curati: "Voce di
  lettura" mostra "Select an option" (inglese) invece del nome vero in
  alcuni istanti - e la sezione "Voce personale" può apparire VUOTA per un
  attimo dopo un cambio schermo (auto-risolto in ~1-2 s, dati mai a rischio,
  confermato leggendo `/data/data/ai.talos/files/voice/profiles` a mano) -
  una corsa di caricamento, non una perdita.
- ⛔⭐⭐ La cifra "circa 730 MB" nella copy era il motore ONNX vecchio, mai
  aggiornata al passaggio a Pocket — corretta a "circa 160 MB" (misurato:
  158 MB reali), owner l'ha segnalato IN TEMPO REALE guardando la sessione
  ("quello di pocket pesa solo 120mb").

## 2026-08-24 — v0.1.20, un difetto vero nella pipeline di rilascio
- ⛔⛔⛔ **`rilascia.ps1` PERDE `origin` e la cronologia intera di
  AVM-PUBBLICA**, ogni volta che lo step 5 gira: lo script sposta via
  `$Copia` PRIMA di chiamare `prepara-la-pubblicazione.ps1` — ma quello
  script decide "riuso la cronologia" guardando se `$Destinazione` esiste
  GIÀ con un `.git`+`origin`. Spostata via da `rilascia.ps1`, la cartella
  risulta assente, e `prepara-la-pubblicazione.ps1` fa SEMPRE `git init` da
  zero: un orfano di un commit, senza `origin`, che un push a forza avrebbe
  cancellato TUTTA la cronologia pubblica (v0.1.0→v0.1.19) sotto i piedi di
  chiunque avesse clonato. Non eseguito: trovato al gate 6
  (`fatal: 'origin' does not appear to be a git repository`), prima di
  qualunque push. Mai capitato prima perché nessuno aveva ancora rilasciato
  chiamando `prepara-la-pubblicazione.ps1` indirettamente TRAMITE
  `rilascia.ps1` con un `-Repo` diverso da quello di default — ⇒ **il
  bug era già lì da sempre**, semplicemente non ancora incontrato.
  Recuperato: la copia rotta messa da parte (mai cancellata),
  quella vera ripristinata dal backup di `rilascia.ps1` stesso
  (`AVM-PUBBLICA.precedente-*`), e `prepara-la-pubblicazione.ps1`
  richiamato DIRETTAMENTE (non tramite `rilascia.ps1`) — questa volta ha
  visto `origin` ed è andato sul ramo giusto: "riprendo la cronologia già
  pubblicata". ⛔ Non ancora corretto NELLO SCRIPT — richiede una decisione
  dell'owner su come vuole che `rilascia.ps1` calcoli `$Destinazione`
  quando `-Repo` è esplicito.
- ⛔⛔ **Tre file locali, mai tracciati da git, servono al rilascio e
  nessuno lo scriveva da nessuna parte**: `mobile/android/app/src/main/res/xml/config.xml`
  (generato da `npx cap sync android`, serve `dist/` quindi `npm run build`
  prima), `mobile/docs/immagini/APPROVATE.txt` (le firme reali dell'owner
  sugli screenshot, accumulate nel tempo, MAI committate), e le due cartelle
  `mobile/tools/{android-assets,git-bash-launcher}` hanno un **proprio**
  `node_modules` isolato (`npm ci` separato, non basta quello alla radice di
  `mobile/`) — senza, `androidAssetsConformance` e `gitBashLauncherConformance`
  falliscono con errori che sembrano regressioni vere e non lo sono. Un
  worktree pulito da `git worktree add` non li eredita: vanno ricostruiti a
  mano, ogni volta.
- ⭐⭐⭐ La cura trovata: **worktree isolato + cherry-pick chirurgico**, non
  toccare mai `AVM/` (dove Agente 19 scrive dal vivo). Trovata la base esatta
  con l'orario (AVM-PUBBLICA `1d23b20` = 23:34:20, AVM `94f1e2f8` = 23:33:47,
  33 s prima — lo script di pubblicazione impiega quello), 3 commit
  cherry-pickati sopra (`5b40c235`, `0a71d707`, `20b6bc80`), zero conflitti,
  diff finale contro quella base: **esattamente 8 file**, nessuno di Fase 4/5.

## 2026-09-13 notte — giro vero sulla chat (glm-5.3-flash, banco 5471), e due strumenti che mentono

- **Ordine vero degli eventi del ragionamento nel kernel**: `ReasoningMessageEnd` arriva DOPO `TextMessageEnd`.
  Sessione `75cdb501`: Start, 41.426 pezzi di ragionamento, TextMessageStart, 2.204 pezzi di risposta,
  TextMessageEnd, e solo lì ReasoningMessageEnd. Dopo il primo testo, zero pezzi di ragionamento. Stessa
  forma sul secondo ragionamento (173 pezzi, poi 149 di risposta).
- **glm-5.3-flash reindirizzato ha ragionato 852.858 ms** (14 min 13 s, misurati fino all'End tardivo) su
  «numeri di quattro cifre uguali alla somma delle quarte potenze»: il costo di un giro può esplodere
  anche su un compito piccolo.
- **Un reindirizzamento mentre il modello ragiona**: RunRedirectRequested → RunError `fermato` →
  RunRedirectApplied → RunStarted `seguito:true`, nessun ReasoningMessageEnd per il ragionamento interrotto.
  Applicato in meno di un secondo dalla richiesta; il giro nuovo ragiona dopo ~5 s.
- **Un messaggio accodato è consegnato DENTRO il giro in corso** (QueuedMessageDelivered senza un
  RunStarted nuovo): 2 RunStarted in tutta la sessione, non 3.
- ⛔ **`grep -c $'\r$'` di Git Bash conta male i CRLF**: diceva «20.973 righe CRLF su 20.973» su un
  `app.js` che in byte ha **0** CRLF e 21.035 LF. Contati in Python (`b.count(b'\r\n')`): LF in tutti i
  file toccati, CRLF solo `http-app.mjs` (6.037). Un fine riga si misura sui BYTE, mai con grep da bash.
- ⛔ **Un heredoc di bash toglie un livello di backslash**, anche fra apici: `'\\r\\n'` in un Python
  scritto con `<<'PYFINE'` è arrivato come un a capo vero. Gli script con escape si scrivono su FILE.
- ⛔ **Lo strumento di modifica può scrivere un'emoji fuori dal piano base come TESTO di escape**: in
  `tabella-giro-vero.py` l'emoji «soon» (U+1F51C) è arrivata come testo di escape — barra rovescia, `ud83d`, barra
  rovescia, `udd1c` — con 0 occorrenze dei byte UTF-8 veri `F0 9F 94 9C` e 1 del testo di escape. Nello stesso turno,
  in questo file Markdown, la stessa emoji è arrivata con i byte veri: il comportamento NON è costante. Python la legge come due surrogati e `write` cade con «surrogates not allowed». La scrittura
  su un temporaneo ha salvato la tabella; la cura è `t.encode('utf-16', 'surrogatepass').decode('utf-16')`.
- ⛔ **`subprocess.run(..., shell=True)` su Windows passa da cmd.exe**: un filtro Playwright
  `-g "A|B"` diventa una pipe e il comando esce 255 senza esito. Niente `|` negli argomenti.
- ⛔ **L'init script di Playwright gira anche nei frame in sandbox**: `localStorage` lancia
  «The document is sandboxed and lacks the 'allow-same-origin' flag» da `<anonymous>:2:107`, cioè dal MIO
  script. Non è la pagina: si avvolge in try/catch, come fa già `nessun-errore-a-runtime.spec.mjs`.
- **`baseline-shell.spec.mjs` sul pacchetto di HEAD: 49 rossi su 65**, e sul pacchetto nuovo gli stessi 49
  (insiemi identici, A/B nello stesso momento su 4186/4187). Debito vecchio, non di stasera.

## 2026-09-14 — la coda della sessione, giro vero su banco 5475 (glm-5.3-flash, due finestre, un riavvio)

- **Stop ⇒ pausa, misurato dal server**: 6 s dopo lo stop nessuna consegna, e `GET …/queue` = 2 voci, `inPausa:true`.
  Dopo il riavvio del processo del banco il registro rimette le stesse 2 voci in pausa (vale l'ULTIMO record `coda`).
- **`avviaESegui` mette `voce.conclusa = false` PRIMA che il kernel emetta `RunStarted`** (session-registry.mjs r. 2805):
  un elenco riletto su un `RunStarted` in diretta vede già la sessione aperta.
- **Tempi dal vivo, due finestre**: barra «fermata» dopo lo stop 130 e 131 ms (rinvio di 60 ms + GET); «Interrompi»
  nell'altra finestra dopo «Invia ora» 259 e 261 ms; barra «in corso» 424 ms; parola della coda da «Invia ora» a
  «Indirizza ora» 87 ms, e ritorno dopo lo stop 140 ms.
- **glm-5.3-flash ripreso con la voce della coda** ha ragionato 2 min 18 s e ha obbedito: «Numeri trovati: 4 — 153, 370,
  371, 407.» Il costo di una ripresa dalla coda è quello di un giro intero.
- ⛔ **17 controlli su 17 e un giro che non si poteva fermare**: lo script della parte 2 guardava le parole della coda, e
  le foto 06-07 mostravano il pulsante fermo su «Invia» per tutto il giro ripreso. Un controllo verde misura solo ciò che
  chiede.
- ⛔ **La suite di parità dei componenti usa DUE porte e ricostruisce `dist`**: il banco «aspetto» parte su
  `TALOS_ASPETTO_PORT` (predefinita **4177**, vietata e occupata: la suite esce 1 prima di cominciare) con
  `node scripts/build.mjs && node ../server.mjs`. ⇒ Porta a mano (5477), e mai mentre un banco serve `dist` o uno script di
  rotture la ricostruisce.
- **Parità dei componenti: 12 rossi su 147 sull'albero di lavoro e gli stessi 12 su un worktree di HEAD `a46f6c83`**
  (insiemi identici, lanciati uno dopo l'altro): ProviderCard «Sostituisci la prima chiave» contro «la chiave» del mockup
  (`bdaac011`, 12/09); attesa col cerchio contro la linea del mockup (`6d27602d`, 12/09); una riga `talos-kv` in più
  nell'Inspector. Debito vecchio.
- ⛔ **`git worktree add` dentro lo scratchpad della sessione fallisce sui percorsi lunghi** (`.claude/refactor-ui-owner-…`)
  e git lo annulla da solo; sotto `Temp/claude/wt-…` riesce. I collegamenti a `node_modules` si staccano con `rmdir` prima di
  `git worktree remove --force`: dopo, i `node_modules` veri avevano ancora 74 e 10 voci.
- ⛔ **Una suite sotto pressione di memoria non dà un conteggio**: con parità su HEAD, due Chrome del giro vero e la suite
  principale insieme, le unità del frontend hanno dato 1017/1023 — sei FILE rossi, 30 prove sparite (erano 1053) —
  e Chromium ha scritto «VirtualAlloc failed». Nello stesso giro la principale ha perso `OPEN-WITH-TALOS-WINDOWS-01`
  (5,4 s), verde nei due giri precedenti. Rilanciate senza carichi accanto, sullo stesso codice: unità **1054/1054**,
  principale **2981/2985** (0 rosse, 4 saltate) e `OPEN-WITH-TALOS-WINDOWS-01` verde in 1,9 s.
- **Una chiamata al fornitore fermata non lasciava traccia**: sul registro della sessione del giro (7 invii, 6 fermati) solo
  l'invio finito porta `StateDelta /usage` (giri: 1) e un `consumo-fornitore`; i 6 fermati hanno solo `ReasoningMessageStart`
  e `RunError`. Causa letta: `runtime-owner-adapter.mjs` rilanciava lo stop prima del deposito, mentre per un guasto
  deposita già un consumo con `usage: null`. Dopo la cura, parte 5: uno stop a ragionamento iniziato → `giriFermati: 1`,
  `usageSessione: null`.
- ⛔ **`[data-runtime-usage]` non esiste nella pagina** — né nel template né nel mockup: il testo «token · giri» che
  `chat-foot.js` scrive con `querySelector` non si disegna da nessuna parte. Scoperto da una prova che non trovava l'elemento.
- **`deferHistoricalRendering`** si accende in `passaASessione` per una sessione conclusa e si spegneva solo con una
  generazione nuova: in una finestra che guarda, ciò che arriva dopo `talos.fine-rigiocata` veniva disegnato come storia.
- **glm-5.3-flash e «senza spiegazioni»**: alla richiesta «scrivi soltanto il più piccolo di quei numeri, senza spiegazioni» ha
  scritto la verifica intera e poi «153» (parte 5, due volte su due).

## 2026-09-14 — le tre zip (audit/review/overlay): cosa valgono, misurato

- **Tre zip distinte, non una**: `TALOS_desktop_audit_e_kit.zip` (13/09 14:44, kit di osservabilità + confronto documentale),
  `TALOS_1aa816de_review_ingegneristica_e_patch.zip` (16:16, review + 8 patch + 1 file nuovo + 53 test) e
  `talos-desktop-overlay.zip` (16:16, 5 moduli nuovi non cablati). Estratte in `scratchpad/zip-audit/`.
- **La review parte da `1aa816de`, 35 commit dietro HEAD, ma i suoi 8 file toccati sono BYTE-IDENTICI a oggi** (`git hash-object`
  == `beforeGitSha1` per tutti e 8; 0 commit li hanno cambiati dal 13/09). `store-entry-id.mjs` è nuovo, non esiste da noi.
  ⇒ le patch si applicano pulite sul codice di oggi.
- ⛔⛔⛔ **F01 È REALE, CONFERMATO DAL VIVO sul banco 5475.** `DELETE /api/v1/sessions/<id>/notes/..%5Czz-sentinella-traversal`
  ha risposto 200 e **cancellato `harness-ui/zz-sentinella-traversal.json`, un file FUORI da `.notes-store/`**. GET dello stesso
  id → 200. `nomiDellaRichiesta` fa `decodeURIComponent` e passa l'id dritto a `percorsoDi(cartella,id)=join(cartella,id+'.json')`,
  senza nessun controllo. Vale per notes/tasks/memory, e l'id arriva ANCHE dagli attrezzi del modello (`argomenti?.id` →
  `eliminaNotaFn`), quindi è raggiungibile per prompt-injection, non solo via HTTP loopback.
- **Le 53 prove della review sul NOSTRO codice: 12 verdi / 41 rosse** (rilanciate con il suo `pty-loader` e `TALOS_TEST_ROOT` su
  `harness-ui`). Le 41 rosse SONO i difetti che la patch cura: traversal (F01), classificazione `.mcp-trust`/`.plugin-trust`
  (F02), byte non-UTF8 dell'export Libreria (F03), backlog PTY a chunk unico (F04), PTY osservata marcata orfana (F05),
  tick automazioni sovrapposti (F06). Ogni patch è piccola (`all.patch` +87 -33).
- **L'overlay tocca gap VERI ma non è cablato**: il nostro SSE *live* dopo `fineReplay` NON coalescente (solo il replay lo è);
  `terminal-ws.mjs` NON ha contropressione (nessun `bufferedAmount`/`pause`/`resume`/`drain`). I 5 moduli sono standalone con
  test, ma vanno agganciati a mano e provati con un giro vero — non plug-and-play.
- **L'audit kit lo dichiara da sé**: «Audit parziale. Nessun benchmark di prodotto, nessuna patch di ottimizzazione
  certificata.» 0 esecuzioni TALOS, 0 concorrenti eseguiti, 11 clonazioni fallite per DNS. Valore d'implementazione basso: è
  un kit di sonde + un confronto documentale con 10 concorrenti, utile come riferimento, non come codice da mettere dentro.
- ⛔ La review stessa dice di NON fare merge cieco col suo `apply.mjs` («se un hash non coincide, l'applicazione si ferma: non
  fare un merge cieco»): si trattano come un bug-report verificato e si riscrivono le cure con le NOSTRE prove e il contrario.
- ✅ **F01 CHIUSO il 14/09**, commit `7879d81d`. `src/id-archivio.mjs` (grammatica della Libreria), guardia in `percorsoDi` di
  notes/tasks/memory che torna `null` per un id fuori grammatica; `leggi`→null, `elimina`→no-op idempotente, `aggiorna`→NOT_FOUND
  (NON un throw come la patch della review, che romperebbe l'idempotenza). Prova nuova al contrario (rossa con la grammatica
  aperta, ripristino identico); le 24 prove di traversal della review passano da sole (12→36 su 53); dal vivo sul banco GET/DELETE
  ora 404 e sentinella intatta su tutti e tre gli store; suite backend 2987/2991 (0 rosse). Restano F02–F07 (decisione owner).

## 2026-09-14 — F02…F07: i sei difetti restanti della review, chiusi con le nostre prove

- ✅ **F02** — `.mcp-trust` e `.plugin-trust` mancavano da `FILE_DI_CONTROLLO.cartelleOvunque` mentre `.hooks-trust` c'era:
  sono i registri dei consensi a server MCP e plugin, e senza classificazione un attrezzo di scrittura del modello poteva
  **auto-concedersi la fiducia**. Prova che li nomina alla lettera + alias/junction. **3 rotture** (senza l'uno, senza
  l'altro, senza entrambe = lo stato di ieri): tutte rosse, ripristino sha256 identico.
- ✅ **F03** — `library_export` leggeva con `leggiVoce` (porta utf8 del MODELLO): un `.docx`/`.pdf` arrivava nel workspace
  **corrotto in modo irreversibile** con «Exported» dichiarato e byte falsi. Ora `leggiBytesVoce` (porta binaria, la stessa
  dello scarico UI), anteprima decisa dal **media type** e rifiuto detto con `ok:false` invece di esplodere. **4 rotture**:
  3 rosse + 1 **inerte di controllo rimasta verde** (il banco non è rosso a prescindere).
- ✅ **F04** — il backlog PTY prometteva 200.000 byte per scheda e non li rispettava con **un solo pezzo** (il ciclo si
  fermava a `backlog.length > 1`). `limitaBacklog` taglia tenendo la **coda**, sui byte UTF-8 (scavalca i byte di
  continuazione: una sequenza spezzata arriverebbe a xterm come `U+FFFD`, cioè output mai scritto dalla shell). Chi guarda
  dal vivo riceve comunque tutto.
- ✅ **F05** — `segnaDisconnesso` timbrava sempre e `reap()` guardava solo il timbro ⇒ una PTY **osservata da un'altra
  finestra** veniva uccisa dopo 10 minuti. Due condizioni in entrambi i punti (`ascoltatori.size === 0`). Col lavoro a due
  finestre di oggi non era teorico.
- ✅ **F06** — `unTick` senza single-flight: due giri sovrapposti facevano partire **due sessioni vere** (che costano),
  perché il secondo leggeva il contatore prima che `registraEsecuzione` del primo avesse scritto. Guardia locale dichiarata
  per quello che è: non un «esattamente una volta» fra processi né a prova di crash.
- ✅ **F07** — scoperta MCP seriale ⇒ N server = **somma** degli avvii, e un avvio è **attesa**, non calcolo (misura della
  review: 121 ms → 46 ms su quattro server d'eco). Pool **opt-in**, `TALOS_MCP_STARTUP_CONCURRENCY` 1..8, **spento di serie**
  (byte per byte il comportamento di prima), valore storto → 1 mai un errore, documentato nel README. ⛔ L'**ordine** dei
  tool è quello di **dichiarazione**, non di arrivo: gli esiti si depositano nella casella del loro server. La prova non
  misura il tempo ma la **sovrapposizione** (quanti avvii aperti insieme), con arrivi rovesciati e **nessun timer vero**.
- **Numeri**: suite backend **3003/3007, 0 rosse** (4 skip noti; erano 2987/2991 prima di queste prove nuove).
  `path-policy` 22/22 · `agent-service` 194/194 · `pty-terminal`+`automation-scheduler` 42/42 · `mcp-session` 15/15.
  **14 rotture al contrario** in totale, tutte hanno morso, **ripristino sha256 identico** ogni volta.
  Script conservati: `scratchpad/rompi-f02.py`, `rompi-f03.py`, `rompi-f04-f05-f06.py`.
- ⛔ **Lezione di strada**: uno script Python che stampa i nomi delle prove **muore sulla console cp1252** di Windows, non
  sul codice (`UnicodeEncodeError` a metà del primo giro, con l'esito già valido ma il resto mai eseguito). Prima riga
  obbligatoria: `sys.stdout.reconfigure(encoding='utf-8')`.

## 2026-09-14 — la release desktop: `desktop-v0.1.6` taggata e MORTA ai cancelli, e le tre cause

> **Rettifica della ripresa del 14/09:** la premessa «nessuna release desktop era mai
> uscita» del primo punto sotto è falsa. La 0.1.5 è pubblicata su Ninozzz95/talos dal
> 13/09, con tre asset. Era stato controllato soltanto il repository di sviluppo.
> La diagnosi del watcher sotto descrive la prima cura: per la cura completa è stato
> poi iniettato guardaWorkspaceFn, perché il watcher reale teneva vivo il processo.
> Il blocco originale resta come cronologia, non come stato corrente.

- ⛔ **Nessuna release desktop era mai uscita**: zero tag `desktop-*` in locale e sul remoto, mentre il changelog
  dichiarava `desktop-v0.1.5` del 13/09 — scritta e **mai taggata**, e i cinque tag prima di lei fermi ai cancelli.
- ✅ Preparata e taggata la **0.1.6** (`f287f68f`): note di rilascio che **portano il changelog** e sono **in inglese**
  (`release-assets.mjs` compone la sezione del tag col testo stabile e **rifiuta** se manca — lo stesso cancello che il
  mobile ha dal 16/08). 4 rotture al contrario, tutte hanno morso, ripristino sha256 identico.
- ⛔ **Job `release`/`desktop` run 34831547172: FALLITO dopo 4m42s** al passo dei cancelli. **Settima volta di fila** che
  un tag desktop muore per la stessa famiglia: **un test che descrive la macchina su cui è stato scritto**. Suite locale
  **verde 3003/3007**, suite del runner **rossa**: è quella differenza il segnale, non il conteggio.
  1. `coda-condivisa-e-pausa.test.mjs` rosso come **FILE INTERO, senza un test nominato**:
     `Assertion failed: !_wcsnicmp(filename, dir, dirlen), src\win\fs-event.c:72` — **libuv ABORTISCE il processo**. Il
     banco dava alla sessione la **temp di sistema come workspace** e il registro ci installa un watcher vero
     (`session-registry.mjs:1864`); sui runner quella cartella ha nome corto **8.3** (`RUNNER~1`). ⇒ Curato con la
     strada già presa il 13/09 da `workspace-watcher.test.mjs` e **mai applicata qui**: radice sotto `.talos/`
     (ignorata a ogni profondità, provato con `git check-ignore`), ancorata al FILE e non alla cwd. ⛔ `realpathSync`
     non espande le 8.3 su Windows.
  2. Due prove «FORMA» di `delega-percorso-e-scheda-agenti.test.mjs`: asserivano come **premessa dura** che `/Users` e
     `src` rispondano sì al disco — vero su `C:`, falso su un runner che lavora da `D:`. ⇒ La premessa si **dichiara**
     con `t.skip(motivo)`; il cuore della prova resta intatto.
  3. `BC-13-CACHE-05`: si fidava che scrivere un file muovesse il **mtime della cartella** (misurato l'11/09 su NTFS).
     Sul runner non si è mosso. ⇒ Il test muove il mtime da sé con `utimes`: misura la cache, non il filesystem.
- ⭐ **La lezione, che vale più delle tre cure**: una suite verde in locale non dice niente su un'altra macchina quando
  i test **toccano il disco vero**. Le tre cause sono tutte «il test descrive l'ambiente»: nome corto 8.3, esistenza di
  una cartella di sistema, risoluzione di un timestamp. Un tag pubblicato **non si riscrive**: 0.1.6 resta bruciata e
  marcata «tag only, no release published», e si riparte da **0.1.7**.

## 2026-09-14 — riallineamento autorizzato della roadmap

- gh release view desktop-v0.1.5 --repo Ninozzz95/talos: pubblicazione 13/09 alle
  12:27:49Z, non draft/prerelease, tre asset: EXE 152.043.007 byte, ZIP 255.850.965,
  SHA256SUMS 174. La precedente premessa sull'assenza di release è rettificata.
- git ls-remote origin: ramo lane/harness-desktop e tag desktop-v0.1.7 risolvono ad
  ad35a646599fdd7e7803442236d9b43e011e280b. Push già avvenuto.
- gh run view 34834305252 --repo Ninozzz95/agent-virtual-machine, controllo 10:48 UTC:
  test server/kernel/frontend/Electron success; installer/ZIP in_progress. Non è ancora
  una prova di release pubblica: verificare repository destinatario e asset finali.
- Riconciliate 13 fasi (0–11 più 3-bis). WF-1…WF-7 erano già in tabella. BC-52 era
  solo nella coda: aggiunto alla Fase 9 dopo PO-15/PO-16/A-B, come lotto successivo.
- config.mjs ammette sei override, non cinque, incluso file_edit; commit 4e8bfd6d
  presente. D-10C ha una chiusura documentata nella coda, non un nuovo verde oggi.
- Piano mobile trovato nel checkout AVM, non AVM-harness-desktop. Nessuna modifica mobile.
- Metodo proposto: coordinatore stabile, fino a cinque compiti per fase, dipendenze e
  proprietà dei file prima delle partenze. Limite runtime quattro slot totali; delega
  implementativa ancora da conciliare con AGENTS.md. Nessun agente avviato o commit/push.
- Registro dei file, fonti primarie e verifica documentale:
  [RIALLINEAMENTO-ROADMAP-2026-09-14.md](RIALLINEAMENTO-ROADMAP-2026-09-14.md).

## 2026-09-16 — il bundle committato con la Fase 3 NON conteneva la Fase 3

- Misurato riavviando il 4174 con `npm run aggiorna` (per consegnare la cura di BC-53): la build dai sorgenti invariati ha
  prodotto `public/app.js` da **1.825.533 byte** contro i **1.818.988** committati in `3415c030`. Build **deterministica**
  (sha256 identici fra `dist/` e `public/` a una seconda costruzione; `verify:ui` 33 asset verdi). `selezioneDopoBatch`:
  **0** nel bundle di `HEAD`, **2** nei sorgenti, **2** nel ricostruito. `3415c030` ha cambiato `public/app.js` di
  **3 righe** mentre aggiungeva ai sorgenti selezione multipla, esiti del batch e assistenza; il suo ledger dichiarava
  «artefatti deterministici della build».
- ⇒ Chi serviva `public/` da quel commit senza ricostruire — il 4174 fino al riavvio di oggi, o un clone lanciato così —
  **non ha mai visto la UI della Fase 3**. L'installatore pubblico no: la CI ricostruisce il frontend dai sorgenti.
- ⛔ Lezione, stessa dell'11/09 in forma nuova: **il bundle nel commit dev'essere quello che i sorgenti producono**, e
  lo dicono le impronte del manifesto, non il ledger. Un controllo da un comando: ricostruire e confrontare gli sha
  prima di committare `public/*`. Curato in `df5aa730` («build(public): ship the bundle the sources actually produce»).

## 2026-09-16 — l'audit «dall'interno»: cosa era vero, misurato

- Il report (`5040c0a3-audit-harness-report.md`) veniva dall'**app installata 0.1.13** (`Programs\talos-desktop\TALOS.exe`,
  processo 19992), sessione `4c3e1649` su `C:\Users\Antonino\Desktop`, trascritto in `%APPDATA%\TALOS\sessions\` — non dal 4174.
- **B1 vero, causa trovata:** `wsl.exe -- bash -lc "…"` = DUE shell; la shell esterna espande `$HOME`, `$?`, `$X` prima
  della nostra. `--exec` cura (misurato con lo stesso script: `$HOME` letterale, `X=42`). Un token. → BC-54.
- **B3 vero:** `primoProgramma('X=abc; …')` = `X=abc;` → «assente in WSL» → cmd.exe. B2 è la conseguenza. → BC-55.
- **B6:** comando vuoto = `TypeError` non catturato sul ramo Windows, `{  ; }` su WSL. → BC-56.
- **B7 vero nel trascritto** (`prova {}` → `exit 0\n`, testo vuoto, `comandoProva: 'npm test'`, Desktop senza package.json),
  **non riprodotto**: lo stesso spawn dà `4294963238` + ENOENT in Node 24.18 e nel Node di Electron. → BC-57, causa aperta.
- **B4 e B5 non sono difetti:** B4 è D-10C per scelta; B5 è B1 (`$?` espanso a 0 dalla shell esterna).
- **«Nessun modello di approvazione» è falso:** `verificaPermessoScrittura` `:7742`, `permessiPerAttrezzo`; la sessione era
  Full access per scelta dell'owner. Il modello ha misurato la sua sessione, non il prodotto.
- Banco: `scratchpad/audit-banco/{riproduci,wsl-strati,prova-b7,prova-desktop}.mjs`; nessun POST sul 4174, un solo GET.

## 2026-09-17 — la Fase P0 chiusa: cosa è costato, cosa è vero

- Workflow `wf_a38b4449-882`: **18 agenti, 0 errori, 4 h 07 min, 5.198.280 token**. Verdetti: D e E approvate, A/B/C bocciate
  anche dopo il giro di riparazione — per residui piccoli (A: due numeri; B: etichette + «caratteri»; C: una regressione vera).
  Secondo giro B: 10 min, 170k token; C: 13 min, 200k token.
- ⛔ **I cancelli delle corsie non vedono la suite intera.** Sullo stato fuso la backend dava **6 rossi** che nessuna corsia aveva
  visto: PG-12/CACHE-08 (contratto «stessa Response» contro un guardiano che rimonta per costruzione) e BC48-B ×4 (rossi da
  `02aff50e`, mio, prima della P0). ⇒ la suite intera si lancia SEMPRE prima di fondere, non dopo.
- ⛔ **Cinque spec Playwright su un server solo con più worker → 2 timeout d'avvio** (runtime non pronto, pill non trovata); con
  `--workers=1` 45 verdi + 1 skip. Il cancello P0 va lanciato con un worker o con un server per file.
- I worktree C e D erano nati da `3415c030`, non da `4c58c961` (il Workflow ha preso l'HEAD di un altro checkout): diff vuoto su
  `frontend/src|tests`, quindi innocuo — ma va controllato con `merge-base` prima di fondere.
- Corsia C, misure sulla sessione da 34.026 righe (mediana di 3, DESKTOP-BJ9I7OU): collassato 74→37 ms, per frame 40→1 ms,
  rapporto 240/480 delta 4,06→1, nodi 25,7k→11,0k; **al contrario** apertura 8→205 ms, replay 374→560 ms, LoAF 254→334.
- Giro vero `dc42bc6c` sul 4174: `prova` con package.json vero → «exit 0» CON l'uscita della suite (2/2). BC-57 (exit 0 vuoto)
  resta non riprodotto: lì non c'era package.json.
- La rotta per una cartella libera è `POST /api/v1/sessions/custom`; la nuda `/api/v1/sessions` vuole `{taskId}` e risponde
  `QUERY_INVALID` con un messaggio generico («Query non valida») che non dice QUALE campo: un'ora persa a indovinare.
- ⛔ Un heredoc bash con delimitatore quotato ha comunque perso i `\\` di un JSON e di un `.mjs` (due volte): gli script con
  escape si scrivono col Write tool, mai in heredoc.
- ⛔ Ho fermato con `Stop-Process` due processi il cui command line conteneva `giro-vero.mjs`: erano i MIEI wrapper bash del
  task in background (verificato dalla riga di comando), ma il filtro era per menzione, non per identità — la stessa forma
  dell'errore del 23/8. Nessun danno; la prossima volta si risale dal PID del node, non dalla stringa.
