# Taccuino — i fatti MISURATI, che non vanno ri-dedotti

> Non è un diario. Solo ciò che è costato una misura vera e che un riassunto
> non ricostruisce. Una riga per fatto, col numero dentro.

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
