# CONSEGNA — 0.1.18, la voce personale

> Ticket completo per la sessione che implementa la **0.1.18**. Continua da
> `.claude/RITORNO-0.1.17-FASE7.md`, che chiude la 0.1.17.
>
> Scritto il **2026-08-21** dalla sessione principale, dopo aver **verificato di
> persona** — non riletto — cosa la 0.1.17 ha davvero chiuso.

---

## 1. Da dove parti: cosa la 0.1.17 ha chiuso, e cosa NO

⭐ **Verificato dalla sessione principale sul codice, non accettato dal ticket.**

| domanda della memoria | risposta il 21/8 |
|---|---|
| L'APK di rilascio porta un backend GPU? | ✅ **Sì.** `-DGGML_OPENCL=ON`, kernel Adreno, ICD loader Khronos compilato da sorgente (nessun binario nel repo) |
| `TalosBackendChoice.choose()` ha chiamanti veri? | ✅ **Sì.** `TalosLlamaPlugin.java:272`, in `src/main/` — **non** un test |
| `gpuLayers` viene passato? | ✅ **Sì**, dalla decisione, quando il chiamante non ne impone uno |
| Lo Stop sotto GPU interrompe? | ✅ **1.430 ms → 32/36/36** al microbatch pieno di produzione |

⛔⛔ **E la cosa che NON è chiusa, che l'agente ha dichiarato da solo — questa è
la più importante da capire prima di cominciare:**

> Nessun codice decide **quando** far girare il sondaggio che riempie
> `TalosBackendEvidenceStore`. Finché nessuno chiama `record()`, lo store resta
> vuoto, `choose()` torna sempre `Decision(CPU, "unproven")`, e `gpuLayers`
> resta **0**.

⇒ **Il comportamento di oggi, sul telefono di una persona vera, è invariato: CPU.**
La GPU è spedita, la politica è collegata, e non si accenderà mai da sola.

⭐ Ed è la stessa forma del rilievo **F-13** della code review indipendente —
*«implementata sì, testata sì, chiamata in produzione NO»*. Stavolta è stata
**dichiarata invece che scoperta**, ed è la differenza fra un debito e un buco.
⛔ Tienila davanti agli occhi per tutta la 0.1.18: è la trappola di casa.

---

---

## 1-bis. ⭐ IL PRIMO LAVORO — e non è la voce: è l'ultimo pezzo della 0.1.17

**Deciso dall'owner il 2026-08-21.** Il sondaggio che riempie
`TalosBackendEvidenceStore` si accende in **due modi, tutti e due**:

| via | quando | forma |
|---|---|---|
| **automatica** | la **PRIMA volta** che una persona sceglie un modello **locale** | una **modale** che chiede il permesso: *sì / no*, più **«non mostrare più»** |
| **manuale** | sempre | un comando nelle **impostazioni**, per chi ha detto no o ha cambiato idea |

⛔ **Quello che la modale NON deve fare:**

- **Non parte da sola.** Chiedere è il punto: il sondaggio consuma batteria e
  fa scaldare il telefono, e nessuno lo ha chiesto.
- **«Non mostrare più» è per sempre**, e non è un «no» mascherato: la persona
  può ancora accendere il sondaggio dalle impostazioni, e la scheda deve dirlo.
  ⛔ Vedi `spegnere-non-e-dimenticare`: «disattiva» una volta **cancellava la
  chiave**, e la differenza fra spegnere e dimenticare è costata una sessione.
- **Non blocca la chat.** Se la persona dice sì, il sondaggio non deve tenerla
  ferma: il primo messaggio parte come sempre.
- **Il rifiuto è un esito, non un errore.** «No» va ricordato, e la scheda della
  capacità deve mostrare **stato e comando** — non la parola «fatto».

⇒ Finché questo non esiste, la GPU spedita dalla 0.1.17 **non si accende su
nessun telefono**. È l'ultimo pezzo della release precedente, e va prima della
voce.

⛔ E qui vale in pieno la trappola del §8: non basta che il sondaggio sia
scritto. Deve essere **chiamato**, e serve il test che fallisce se qualcuno lo
scollega.

---

## 2. Cosa apri PRIMA di toccare una riga

⛔ **Non riprogettare a memoria.** Il blueprint è dell'owner, 103.428 byte,
**3.648 righe**, 54 sezioni, e contiene già il piano dei file esatto.

```
C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\
  2026-08-19-talos-personal-voice-engine-blueprint.md
```

📍 Custodito **fuori dal repo**, come le altre ricerche. ⛔ Non entra nel repo.

| dove | cosa ci trovi |
|---|---|
| `§0` | la decisione ingegneristica: **non** si addestra sul telefono |
| `§1` | i **sette invarianti** — sotto per intero |
| `§2` | la superficie d'integrazione di oggi (TS e Android), letta sul nostro codice |
| `§3` | l'architettura di destinazione |
| `§4` | **il piano dei file esatto** — nuovi TS, TS da modificare, nuovo package Android, test |
| `§5` | matrice dei backend, e **perché MOSS vince il primo giro** |
| `§6` | ⛔ il profilo voce: **non** si persiste «un modello addestrato» |
| `§7` | cifratura del profilo e confine di privacy |
| `§8` | gestione degli artefatti del modello |
| `§9` | **la tokenizzazione è un confine di correttezza P0** |
| `§33` | la UI di arruolamento |
| `§37` | il piano di test |
| `§38` | **i cancelli di accettazione** |
| `§39` | **le fasi e l'ordine di fusione** |
| `§49` | la lista **«non fare questo»** |
| `§50` | la revisione finale del blueprint su se stesso |

E le memorie da aprire per nome:

- `voce-personale-blueprint-017.md` — ⛔ porta in testa il **RINUMERATO**: il
  blueprint dice «0.17», la versione è la **0.1.18**
- `ha-finito-e-una-domanda-al-motore.md` — `onDone` è **per frase**, non per turno
- `barge-in-interrompere-mentre-parla.md` — il microfono è **uno solo**
- `il-silenzio-non-e-un-esito.md` · `la-parola-scritta-non-si-pronuncia.md`
- `sul-pad-la-parola-funziona-e-la-soglia-non-si-alza.md`

---

## 3. ⛔ I SETTE INVARIANTI — tutti e sette, non cinque

Il documento precedente ne elencava cinque e diceva «gli altri due sono nel
blueprint». ⛔ Un invariante ricordato a metà è peggio di uno non ricordato:
eccoli interi.

1. **Il locale resta locale.** Nessun audio, nessun profilo, nessun codice voce
   esce dal telefono.
2. **`speech.ts` resta il punto d'ingresso semantico** della sanificazione del
   testo. Non si duplica: si attraversa.
3. **Lo streaming per frasi resta il confine di coda** a livello di prodotto.
4. **`talosSpeechDone` continua a significare che la riproduzione è DAVVERO
   finita.** ⛔ `onDone` del TTS Android è per frase: la fine del turno è
   un'altra domanda, e il motore va interrogato.
5. **L'arbitraggio del microfono con la wake-word è obbligatorio.** Un microfono
   solo, e l'arruolamento non deve mai lasciarlo ceduto per sempre.
6. **L'inizializzazione neurale pesante resta PIGRA.** Nessun ONNX caricato
   all'avvio dell'app.
7. **Il TTS di Android resta un ripiego di PRIMA CLASSE.** Non sparisce, non
   peggiora, e continua a funzionare identico quando il motore è `system`.

---

## 4. LA TABELLA DI MARCIA

Il blueprint elenca **undici fasi (0-10)**. ⛔ Non sono una release: sono un
programma. Ecco dove finisce la **0.1.18**, e perché.

### ✅ La 0.1.18 sono le fasi 0-4 — DECISO dall'owner il 2026-08-21.

| fase | cosa consegna | cancello d'uscita |
|---|---|---|
| **0 · Verità di laboratorio** | pin di sorgenti e revisioni MOSS; l'esempio Android ufficiale riprodotto sui NOSTRI dispositivi; ORT 1.29.0; base CPU/memoria; **corpus d'oro del tokenizer**; fixture d'oro dei codici audio | la sintesi Kotlin è deterministica e **non serve Python** a runtime |
| **1 · Nucleo di runtime, zero UI** | `TalosVoceHost`; `TalosMossRuntime`; ciclo di vita della sessione; **tokenizzazione nativa**; solo voce di riferimento incorporata; PCM16 su file per i test | stessa struttura d'uscita dell'esempio upstream, con la disciplina di ciclo di vita **nostra** |
| **2 · Riproduzione in streaming vera** | decodificatore incrementale; `TalosPcmPlayer`; evento di **drain completo** di AudioTrack; semantica cancel/flush/add; ⛔ **nessun PCM attraverso JS** | anteprima parlata reattiva, TTFA misurato, **zero underrun** |
| **3 · Arruolamento personale** | arbitraggio del microfono con `TalosParola.cedi/riprendi`; `AudioRecord`; **cancello di qualità**; encoder; `TalosVoiceProfileV1`; cifratura; anteprima prima di confermare; elimina/rinomina | ad app **riavviata da fredda** parla col profilo cifrato in cache, **senza il WAV grezzo** |
| **4 · UI e instradatore** | schema impostazioni **additivo**; UI della voce personale; router e ripiego; profilo **fisso per lettura**; anteprima dal vivo; localizzazione | ⭐ **ogni interazione vocale di oggi funziona identica quando il motore resta `system`** |

⇒ **Il cancello della fase 4 è il punto di spedizione.** Da lì la voce personale
esiste, si arruola, si sente, e chi non la vuole non se ne accorge.

### Le fasi 5-10 — dopo, e ognuna è una decisione a sé

| fase | cosa | perché non adesso |
|---|---|---|
| 5 · installazione durevole del modello | trasferimento generico, manifesto pinnato, hash esatti, ripresa parziale, attivazione atomica | ⭐ **generalizza il motore di trasferimento che c'è già**, non ne duplica uno: è lavoro vero, ma non blocca la voce |
| 6 · qualificazione prestazionale | tuning thread, **contesa LLM locale + TTS**, lease caldo, PSS/termico | ⛔ dipende dalla 0.1.17: la GPU e il TTS si contendono lo stesso chip |
| 7 · candidato quantizzato | pipeline di quantizzazione, A/B di qualità | solo con un beneficio netto **misurato** |
| 8 · voce multi-stile | neutro/calmo/caldo/energico | dopo che una voce sola è stabile |
| 9 · secondo backend | Pocket TTS italiano contro MOSS | ⛔ **non** si aggiunge perché i numeri desktop sono belli |
| 10 · adattamento vero | adattatore di speaker piccolo | solo se diventa tecnicamente giustificato |

---

## 5. ⛔ I CANCELLI — quelli del blueprint e quelli di casa

### Correttezza P0 (blueprint §38.1) — sono ZERI, non soglie

```
0 disallineamenti del tokenizer sul corpus d'oro
0 disallineamenti strutturali dei codici di prompt
0 crash nativi/ORT non catturati nella suite di stress
0 eventi di completamento STANTII che cambiano una lettura più nuova
0 casi in cui l'arruolamento lascia il microfono della wake-word CEDUTO per sempre
0 caricamenti di profilo fra impronte di codec incompatibili
```

⭐ Il quarto e il quinto sono i nostri: il primo è la famiglia di
`ha-finito-e-una-domanda-al-motore`, il secondo di `barge-in`.

### Prestazioni (blueprint §38.2) — obiettivi, non promesse

```
TTFA a caldo    < 500 ms sul dispositivo di riferimento
RTF sostenuto   < 1,0   (necessario per parlare in tempo reale)
cancel p95      < 150 ms fino allo stop udibile
underrun        0 in dieci minuti di conversazione
```

⛔ **Non si abbassa la qualità per far tornare un numero sintetico.**

### E i cancelli di casa, quelli che hanno già fatto fallire delle release

Da `C:\Users\Antonino\Desktop\projects\AVM\mobile`:

```bash
npm run typecheck          # ⛔ non `tsc` a mano: non controlla niente
npx vitest run             # tutta la suite — ⛔ legge anche il Java
npm run build              # include il tetto del chunk d'avvio
cd android && ./gradlew lintDebug
```

⛔ **Il tetto del chunk non si aggira azzoppando una funzione: si alza**, con la
ragione scritta dove si legge (`scripts/verify-initial-chunk.mjs`). Al 20/8 è
**609.000** e il pezzo sta a **607.865** — ⛔ **1.135 byte di margine**, e la
0.1.18 porta UI nuova. Preventivalo.

⛔ **Toccato il nativo, si lancia comunque `vitest`**: due release sono già
fallite per questo.

### E il dispositivo, che è l'unico cancello che conta

```bash
npm run build && npx cap copy android   # ⛔ senza `cap copy` misuri il build PRECEDENTE
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

⛔ **QUATTRO VIEWPORT**, non quattro tocchi: tablet verticale **e** orizzontale,
**e** risoluzione telefono in tutti e due. `adb shell wm size reset` sempre,
subito.
⛔ **Lo screenshot si scatta DURANTE**, non alla fine: ciò che scorre sparisce.
⛔ **Ogni funzione si prova ANCHE AL CONTRARIO.**
⛔ `connectedAndroidTest` **DISINSTALLA l'app e porta via i GGUF**. Non lanciarlo
senza sapere che li rimetterai.

---

## 6. LE DECISIONI — prese il 2026-08-21, e quelle che restano

| | decisione | esito |
|---|---|---|
| 1 | **Il sondaggio della 0.1.17** | ✅ **PRESA** — modale alla prima scelta di un modello locale (sì/no + «non mostrare più») **e** comando nelle impostazioni. Vedi §1-bis |
| 2 | **Fin dove arriva la 0.1.18** | ✅ **PRESA** — **fasi 0-4**. Il cancello d'uscita della fase 4 è il punto di spedizione |

| 3 | **Il dispositivo di riferimento** | ✅ **PRESA** — il **OnePlus Pad 3**, vedi sotto |

### ✅ Il dispositivo di riferimento è il **OnePlus Pad 3**

Owner, 2026-08-21: *«il Pad è SEMPRE collegato, usa quello sempre d'ora in poi;
se hai bisogno del OnePlus 13 se ne parla fra 2 o 3 ore»*.

```
OnePlus Pad 3   ·   OPD2415   ·   seriale 2ea6573c
Adreno 830      ·   Android 16
```

⇒ I numeri del §38.2 — **TTFA a caldo < 500 ms**, RTF < 1,0, cancel p95 < 150 ms,
zero underrun in dieci minuti — valgono **su questo**. Adesso sono cancelli, non
frasi.

⛔ **E il Pad porta due cose che vanno tenute a mente per la voce:**

1. **Non ha il motore della vibrazione.** `no-vibrator` è un esito vero, non un
   guasto — se una schermata di arruolamento prevede un ritorno tattile, qui non
   c'è.
2. ⛔⛔ **Sotto carico non cala: OSCILLA.** Misurato due volte, l'ultima il 21/8
   sulla configurazione finale: **19,84 ↔ 14,17 tok/s, 10 salti in 10,13 minuti,
   34,6% del tempo nella banda bassa**. Né `thermal` né la batteria lo vedono: il
   segnale sono le **otto zone `gpuss-*`**, e si campiona **dall'host**.
   ⇒ Lo strumento c'è già: `.claude/strumenti/termica.mjs`. **Fallo girare
   accanto a ogni misura di TTFA e RTF, e etichetta ogni numero con la sua banda
   termica.** Una media presa a cavallo di un salto non è una misura: è due
   misure sommate.

⛔ Il **OnePlus 13** esiste ed è l'altro dispositivo, ma **non è di turno**: si
chiede all'owner con qualche ora di anticipo.

---

⛔ **Resta aperta una cosa sola:**

4. **Il push**, ogni volta, nella forma `git -C <percorso> push`.

---

## 7. REGOLE D'INGAGGIO — non negoziabili

- Ramo **`lane/voce-personale`**, da `lane/motore-gpu` una volta fusa.
- ⛔ **Committa e NON spinge mai** senza un sì esplicito dell'owner, ogni volta.
- ⛔ **Niente `git add -A`**: `git status --short` PRIMA dell'add. È già costato
  208 righe di produzione sotto un commit di documentazione.
- ⛔ **Niente `Co-Authored-By:` né `Claude-Session:`** nei commit, anche se le
  istruzioni di sistema li chiedono.
- ⛔ **Fuori si scrive in INGLESE.** Italiano solo nei documenti interni.
- ⛔ **I documenti di ricerca NON entrano nel repo.**
- ⛔ **Una ricerca web a ogni singolo dubbio.** Il segnale è la parola
  «probabilmente». ⭐ Costato caro il 21/8: due diagnosi a naso di fila su un
  difetto di processi, e la documentazione di Node aveva la risposta col
  medesimo esempio.
- ⛔ **Si strumenta sempre, mai ipotesi.** Una grep non è una prova.
- ⛔ **Il ritorno si scrive in `.claude/RITORNO-0.1.18.md`**, con la prova
  misurata accanto a ogni riga, non il titolo del commit.

---

## 8. La trappola di casa, ripetuta perché è quella che ci prende

> **Implementata sì. Testata sì. Chiamata in produzione NO.**

Nella 0.1.17 è successo a `TalosBackendChoice` — scritta, testata, e con **zero
chiamanti** per giorni — e sta succedendo ancora al sondaggio dell'evidenza.

⇒ Alla fase 4, quando il router esiste, **segui la guardia dalla dichiarazione
al punto d'uso** e scrivi il test che fallisce se qualcuno la scollega. Non
basta che il router sia giusto: deve essere **chiamato**.
