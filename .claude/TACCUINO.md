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
