# CONSEGNA — 0.1.17 (motore su GPU) e 0.1.18 (voce personale)

> Scritto il **2026-08-20** per una **sessione Claude Code separata**, che
> lavora da sola su queste due release mentre la sessione principale lavora
> all'harness di coding.
>
> ⛔ Questo documento **non riassume** i brief dell'owner: li **indirizza**.
> Riassumere è il modo in cui un vincolo si perde. Ogni volta che qui c'è un
> numero o una regola, sotto c'è il documento che la contiene per esteso, e
> quello è la fonte.

---

## 0-bis. ⛔ LA PRIMA COSA CHE FAI, PRIMA DI LEGGERE IL RESTO

```bash
node .claude/preflight-consegna.mjs
```

Controlla da solo l'ambiente intero: le otto guardie, i divieti invalicabili,
i due brief, gli indici di memoria, il ramo, i remoti, il Pad, gli attrezzi, e
poi typecheck + suite + build. Ci mette circa tre minuti.

- **uscita 0** → puoi partire da solo. Vai al punto 1.
- **uscita 1** → ⛔ **NON COMINCI.** Riporti all'owner le righe con ⛔, con le
  loro parole, e aspetti.

⛔ Non è burocrazia. Il 2026-08-20 le otto guardie erano state cancellate da una
scrittura sbagliata, e non se n'era accorto nessuno per ore: la configurazione
sta in memoria, quindi gli hook sparavano ancora nella sessione aperta e
sarebbero spariti alla prima sessione nuova, in silenzio. Un ambiente rotto che
sembra sano è il modo esatto in cui si lavora ore per niente.

---

## 0. In una riga

Implementi la **0.1.17** (backend GPU del motore locale) e poi la **0.1.18**
(motore vocale personale), **una alla volta**, ciascuna sul suo ramo, seguendo
i due brief che l'owner ha già scritto. **Committi. Non spingi mai.**

---

## 1. ⛔⛔ LA RINUMERAZIONE — leggila prima di aprire qualsiasi cosa

I due brief dell'owner portano dentro **numeri di versione vecchi**. Sono stati
scritti il 19 agosto, e il 20 il piano è cambiato.

| il brief dice | è in realtà |
|---|---|
| GPU → «versione **0.1.16**» | **0.1.17** |
| voce → «per la **0.17**» | **0.1.18** |

Perché: la **0.1.16 è già uscita il 2026-08-20** ed è **la UI della Ricerca
approfondita**. Il tag `v0.1.16` è sul repo pubblico.

⛔ I documenti dell'owner **non si riscrivono**. La nota della rinumerazione sta
già in testa alle due memorie corrispondenti — vedi §3.

---

## 2. ⛔⛔ COSA NON FAI, MAI

1. **Non spingi.** Nessun `git push`, su nessun remoto, per nessun motivo. Un
   hook lo impedisce; anche senza, la regola resta. Il push lo fa l'owner dopo
   una code review nostra.
2. **Non tocchi l'harness di coding.** È il lavoro dell'altra sessione. In
   pratica: niente `banco/`, niente `mobile/docs/superpowers/`, niente
   `.codex/`.
3. **Non rilasci.** Nessun tag, nessuna preparazione della copia pubblica,
   nessuna corsa dei workflow. La release la fa l'owner.
4. **Non inventi la rotta.** Se il brief non copre un caso, vedi §9.
5. **Non modifichi codice senza ordine** se l'owner è in linea; quando lavori
   da solo su queste due release, l'ordine **è questo documento** e i due
   brief. Fuori da quel perimetro si chiede.

---

## 3. LE ROTTE ESATTE — dove sta ogni cosa

### I due brief dell'owner (la fonte, fuori dal repo)

```
C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\
  2026-08-19-talos-llama-implementation-research-kickoff.md   2.042 righe   ← 0.1.17
  2026-08-19-talos-personal-voice-engine-blueprint.md         3.648 righe   ← 0.1.18
```

⛔ Sono **custoditi fuori dal repo di proposito** e non ci entrano. Si aprono
da lì.

### Le memorie che li indicizzano (con la nota della rinumerazione)

```
C:\Users\Antonino\.claude\projects\C--Users-Antonino-Desktop-projects-AVM\memory\
  kickoff-motore-locale-gpu-016.md      ← 0.1.17, con ⛔ RINUMERATO in testa
  voce-personale-blueprint-017.md       ← 0.1.18, con ⛔ RINUMERATO in testa
  ricerche-custodite-fuori-dal-repo.md  ← il ledger di tutte le ricerche
```

### Gli indici che si caricano da soli a ogni sessione

- `MEMORY.md` — regole vincolanti, aperti, chi è l'owner
- `.claude/MEMORIA-LEZIONI.md` — le lezioni chiuse (importato da `CLAUDE.md`)

⛔ **Si leggono, non si assumono.** Contengono difetti già pagati: il ponte che
si riaggancia da solo, la grammatica pigra, il build che non arriva al
telefono, gli strumenti che mentono.

### Il repository

```
C:\Users\Antonino\Desktop\projects\AVM        ← privato, sviluppo. L'app sta in mobile/
C:\Users\Antonino\Desktop\projects\AVM-PUBBLICA ← pubblico, SOLO rilascio. Non lo tocchi.
```

⛔ Perché due, e perché conta:
[`due-repo-e-la-ci-sta-su-quella-giusta.md`](../../../.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/due-repo-e-la-ci-sta-su-quella-giusta.md)
nella memoria. In breve: le chiavi di firma stanno **solo** sul pubblico, i tag
di release **solo lì**, e i cancelli girano su `main` e sulle PR — non sul ramo
di lavoro.

---

## 4. LE OWNERSHIP — chi possiede cosa, mentre lavoriamo in due

### Il dispositivo: **è tuo**

Il Pad OnePlus `2ea6573c` è **assegnato a te** per tutta la durata delle due
release. La sessione principale lavora host-side e non lo tocca.

```
adb devices -l          → 2ea6573c  product:OPD2415  model:OPD2415
pacchetto di produzione → ai.talos
```

⛔ È **uno solo**. Se ti serve e non risponde, non è occupato da noi: è caduto
il ponte. Vedi [[ponte-si-riaggancia-da-solo]] e
[[il-debug-wireless-non-si-riaccende-da-solo]].

### I rami

| ramo | release | da |
|---|---|---|
| `lane/motore-gpu` | 0.1.17 | `lane/talos-mobile` |
| `lane/voce-personale` | 0.1.18 | `lane/motore-gpu` una volta chiusa |

⛔ **Sequenziali, non paralleli.** Il Pad è uno, e le due release lo vogliono
entrambe.

Il ramo principale resta `lane/talos-mobile`: è dove lavora l'altra sessione, e
tu ci fai solo `git merge` in ingresso quando serve, mai in uscita.

### I file, per non pestarci i piedi

| tuoi | dell'altra sessione |
|---|---|
| `mobile/android/**` (JNI, llama.cpp) | `banco/**` (quando nascerà) |
| `mobile/src/lib/models/**` | `mobile/docs/superpowers/**` |
| `mobile/src/services/speech*.ts` | `.codex/**` |
| `mobile/src/lib/voice/**` | |

Se una cura tua deve toccare un file dell'altra colonna: **si chiede**, non si
tocca.

---

## 5. LA ROTTA DELLA 0.1.17 — backend GPU del motore locale

⛔ Il brief contiene **un execution contract scritto per un agente**: struttura
degli artifact raw, schema JSONL delle misure, matrice C0/C1/C2, fasi, gate di
promozione, Definition of Done. **Quello è la rotta.** Qui sotto c'è solo
l'ordine di attraversamento e i vincoli che non si possono sbagliare.

### I vincoli che, se ignorati, sbagliano l'intera fase

1. **Baseline congelata**: TALOS `803d8fdd…` + llama.cpp `d2f83055…`.
2. ⛔ **OpenCL è VIETATO** alla qualification Flash Attention senza `60addddf`
   (race P0). Il candidato è **Vulkan**, con `98d1e92` + `dc72703`.
3. **Threadpool separati** si mantengono anche dopo il revert upstream.
4. ⛔ **Stop/cancel è P0.** L'API llama.cpp dichiara l'abort callback ancora
   **CPU-only**, e sotto GPU nessuno sa cosa succede. Si lega alla sonda
   `cancel` della parity, che misurava **il segnale** e non il motore: un
   motore che ignorava lo stop passava `pass`.
5. ⛔ **Prima di qualsiasi benchmark GPU**: fase **research-only** sul targeting
   esplicito dei device. TALOS passa `n_gpu_layers`, ma `llama_model_params`
   accetta una **lista esplicita di devices**; con OpenCL e Vulkan entrambi
   presenti l'ordine del registry sceglierebbe la GPU **implicitamente**. Serve
   inventario strutturato dei device ggml e prova dell'**offload effettivo**.
6. **Benchmark PP / TG / TTFT separati.** ⛔ `tokensPerSecond` da solo non basta
   a scegliere un backend.
7. **Regression gate obbligatorio** su llama-common / Jinja / tool calling.

### L'ordine

1. Apri il brief. Per intero. Prima di scrivere qualsiasi cosa.
2. Fase research-only del targeting (vincolo 5) → artifact.
3. Inventario device ggml + prova dell'offload effettivo.
4. Matrice C0/C1/C2 come la definisce il brief.
5. Benchmark PP/TG/TTFT, schema JSONL come da brief.
6. Stress test della race OpenCL.
7. Stop/cancel sotto GPU — RED prima, cura poi.
8. Regression gate.
9. Definition of Done del brief. **Non una tua.**

---

## 6. LA ROTTA DELLA 0.1.18 — la voce personale

Il blueprint contiene: decisione ingegneristica iniziale, **invarianti TALOS non
negoziabili**, superficie d'integrazione attuale (TS e Android), architettura di
destinazione, **piano dei file esatto**, matrice di qualificazione dei backend
(prima scelta: **MOSS**), test, sicurezza, benchmark.

### ⛔ I sette invarianti che dichiara intoccabili

1. **Il locale resta locale.**
2. `speech.ts` resta il punto d'ingresso semantico della sanificazione del testo.
3. Lo **streaming per frasi** resta il confine di coda a livello di prodotto.
4. `talosSpeechDone` continua a significare che la riproduzione è **davvero**
   finita — vedi [[ha-finito-e-una-domanda-al-motore]]: `onDone` è per frase,
   non per turno.
5. L'**arbitraggio del microfono** con la wake-word è obbligatorio.
6. e 7. — **sono nel blueprint.** Aprilo: qui ne stanno cinque perché cinque ne
   ricorda l'indice, e un invariante ricordato a metà è peggio di uno non
   ricordato.

⛔ Il TTS Android resta il **ripiego**, non sparisce.

---

## 7. I CANCELLI — in ordine, coi comandi esatti

Da `C:\Users\Antonino\Desktop\projects\AVM\mobile`:

```bash
npm run typecheck          # ⛔ non `tsc` a mano: non controlla niente
npx vitest run             # tutta la suite, non un file
npm run build              # include il tetto del chunk d'avvio e la parity
cd android && ./gradlew lintDebug
```

⛔ **Il tetto del chunk non si aggira azzoppando una funzione: si alza**, con la
ragione scritta dove si legge — `scripts/verify-initial-chunk.mjs`. Al
2026-08-20 è **609.000** e il pezzo sta a 607.865.

⛔ **Toccato il nativo, si lancia comunque `vitest`**: legge anche il Java. Due
release sono già fallite per questo.

### E poi il dispositivo, che è l'unico cancello che conta

```bash
npm run build && npx cap copy android      # ⛔ senza cap copy misuri il build PRECEDENTE
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Poi, dalla cartella `mobile`:

```bash
TALOS_PACKAGE=ai.talos node scripts/device.mjs find
TALOS_PACKAGE=ai.talos node scripts/device.mjs tap "…"
TALOS_PACKAGE=ai.talos node scripts/device.mjs shot nome
```

⛔ **Quattro viewport**, non quattro tocchi: tablet verticale e orizzontale,
**e** risoluzione telefono in tutti e due gli orientamenti.

```bash
adb shell wm size 1080x2400 && adb shell wm density 420
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0   # 1 = orizzontale
# ⛔ SEMPRE, subito dopo:
adb shell wm size reset && adb shell wm density reset
adb shell settings put system accelerometer_rotation 1
```

---

## 7-bis. ⛔ LE CORSE LUNGHE SI STACCANO DALLA SESSIONE

I benchmark del brief GPU durano ore. **`run_in_background` non basta**: muore
quando il processo padre esce.

MISURATO il 2026-08-15: una generazione da ~10 ore lanciata così è stata uccisa
dall'uscita della sessione — **650 clip su ~12.000**, e *nessun errore da
nessuna parte*. La corsa non era fallita: era stata terminata.

La forma che regge, su Windows:

```powershell
Start-Process -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","$S\corsa.ps1" `
  -RedirectStandardOutput "$S\corsa.log" `
  -RedirectStandardError  "$S\corsa.err" `
  -WindowStyle Hidden
```

⇒ La corsa scrive su file, tu leggi il file. Non tieni la corsa dentro la
sessione.

---

## 7-ter. LE IMPOSTAZIONI CON CUI SEI STATA AVVIATA

`.claude/settings.json` (locale, non entra nel repo pubblico) porta già:

- `defaultMode: acceptEdits` — le modifiche ai file scorrono senza chiedere.
- **35 comandi consentiti**: `npm`, `npx vitest`, `cap copy`, `gradlew`, `adb`,
  `git` in lettura e commit, gli attrezzi di ricerca.
- **10 divieti**, e sono la rete:
  `git push`, `git tag`, `gh release`, `gh workflow`, `git reset --hard`,
  `git clean`, `rm -rf`, e le keystore illeggibili.

⛔ Se un comando ti viene negato **non cercare la strada intorno**: è negato
apposta. Scrivilo nel ritorno (§11) e vai avanti su altro.

---

## 8. LE REGOLE D'ORO CHE VALGONO ANCHE PER TE

Si caricano da sole dagli indici. **Non le riassumo**: le nomino, e vai a
leggerle.

- ⛔⛔ **SI STRUMENTA SEMPRE, MAI IPOTESI** — [[si-strumenta-sempre-mai-ipotesi]].
  Regola d'oro del 20/8. Prima di una riga di cura serve **un dato misurato**.
  Leggere il sorgente è ricerca, non misura.
- ⛔⛔ **Taccuino ispettore** — [[taccuino-ispettore-sempre-acceso]]. Ogni
  screenshot si guarda **tutto**, cercando difetti **fuori** da ciò che stai
  facendo.
- ⛔⛔ **Se la tocchi, la provi tutta** — [[se-la-tocchi-la-provi-tutta]].
- ⛔ **Ogni funzione anche al contrario** —
  [[provare-sempre-anche-il-verso-contrario]].
- ⛔ **Niente è chiuso senza dispositivo reale** — [[device-verified-or-not-done]].
- ⛔ **Ricerca web prima del codice** — [[web-research-before-implementation]].
  Un hook la impone: se provi a scrivere codice senza, ti ferma.
- ⛔ **Una funzione coi test e nessun chiamante** —
  [[funzione-con-i-test-e-nessun-chiamante]]. Successo **due volte** il 20/8.
  Prima di dire fatto: `grep -rn "nomeFunzione" src/ | grep -v il-file-che-la-definisce`.
- ⛔ **Fuori si scrive in inglese** — [[fuori-si-scrive-in-inglese]]. Commit,
  CHANGELOG, stringhe `en`. L'italiano solo nei documenti interni e nelle
  stringhe `it`.

---

## 9. QUANDO IL BRIEF NON COPRE UN CASO

Succederà. Il brief è del 19 agosto e il mondo si muove.

1. **Prima misura**, poi decidi (§8, regola prima).
2. Se la misura contraddice il brief: **fermati e scrivilo**. Non «adatti» un
   vincolo dell'owner perché sul dispositivo sembra scomodo. Un vincolo che
   sembra sbagliato è il caso in cui serve lui, non tu.
3. Se manca un pezzo di rotta: proponi, **non eseguire**. Lo scrivi nel
   documento di consegna di ritorno (§11) e vai avanti su ciò che è coperto.

---

## 10. COMMIT — sì, e come

- Si committa spesso, a blocchi coesi.
- Il messaggio dice **cosa era sbagliato e come si è misurato**, non cosa hai
  toccato. In **inglese**.
- In coda a ogni commit:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

⛔ **E nessun push.** Mai.

---

## 11. COME SI CONSEGNA INDIETRO

Quando una delle due release è pronta, scrivi
`.claude/RITORNO-0.1.17.md` (o `-0.1.18`) con:

1. **Cosa è chiuso**, e per ognuno **la misura** che lo prova — numeri, non
   aggettivi.
2. **Cosa è aperto**, e perché.
3. **Dove il brief e la realtà hanno divergito**, se è successo.
4. **Gli artifact**: dove stanno i JSONL delle misure, gli screenshot, i log.
5. **I cancelli**, con l'esito: typecheck, quanti test, byte del build contro il
   tetto, lint, e le quattro viewport.
6. **Cosa serve dall'owner** per il push.

Poi ti fermi. La code review e il push sono nostri.

---

## 12. LO STATO DA CUI PARTI

- Ramo `lane/talos-mobile`, ultimo commit al 2026-08-20: `8fce486e`.
- **0.1.16 rilasciata** il 20/8 (tag `v0.1.16` sul pubblico).
- Suite: **5.858 test verdi**, typecheck verde, build 607.865 / 609.000, lint
  Android verde.
- Sul Pad è installato un build **debug** (`versionName 0.0.0`): è normale, la
  versione la inietta la CI dal tag.
- ⛔ Aperti che potresti incrociare, e che **non sono tuoi**: la sezione
  «Estendi con una linea» della Ricerca approfondita, e i difetti registrati in
  `MEMORY.md` sotto 🔜.
