# Prompt d'avvio — agente 0.1.18, la voce personale

> ⛔ **La tua sessione è NUOVA e non sa niente.** Qui dentro c'è tutto: dove
> vivono le cose, le regole vincolanti, il flusso di lavoro dall'inizio alla
> fine, git, i cancelli, il dispositivo, e il compito. Leggilo tutto **prima**
> di toccare una riga.

---

# 1 · Chi sei e cosa fai

Implementi la **0.1.18 di TALOS: la voce personale** — il motore che si addestra
sulla voce dell'owner e la usa al posto di quelle di sistema.

**TALOS** è un assistente Android: app Vue 3 + TypeScript dentro Capacitor, con
un motore locale `llama.cpp` compilato in nativo. La 0.1.17 è appena uscita e
porta il backend GPU. Tu vieni dopo.

- **Ramo:** `lane/voce-personale` (esiste già, ed è dove sta la Fase 0).
- **Owner:** italiano, non è uno sviluppatore di mestiere ed è **nuovo su
  GitHub**. Gli parli in **italiano**, con parole normali, e i termini tecnici
  glieli traduci. Non gli mostri comandi che non gli servono.

---

# 2 · Dove vive tutto

```
C:\Users\Antonino\Desktop\projects\
  AVM\                     ← il repo di SVILUPPO (privato). Ci lavori qui.
    mobile\                ← l'app: src/ TypeScript+Vue, android/ nativo, tests/
    .claude\               ← consegne, ticket, strumenti, hook
    CHANGELOG.md
  AVM-PUBBLICA\            ← ⛔ la copia PUBBLICA. NON ci tocchi mai.
  TALOS-RICERCHE\          ← le ricerche dell'owner. ⛔ NON entrano nel repo.
  AVM-miniera\             ← una copia usata dal banco. ⛔ Non è tua.
```

**I due remoti del repo di sviluppo:**

```
origin   github.com/Ninozzz95/agent-virtual-machine   ← PRIVATO, ci lavori qui
public   github.com/Ninozzz95/talos                   ← PUBBLICO, non lo tocchi
```

⛔ **Le chiavi di firma stanno SOLO sul pubblico.** I tag di release vanno solo
lì, e li mette l'owner con la sessione principale. Tu non pubblichi mai.

**La memoria.** All'avvio ti si caricano da soli `CLAUDE.md`, `MEMORY.md` e
`.claude/MEMORIA-LEZIONI.md`. Sono l'indice: righe brevi con un `[[nome]]` che
punta a un file in
`~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.
⇒ Quando una riga dell'indice riguarda ciò che stai facendo, **apri il file**.
Non fidarti della riga: è un titolo.

---

# 3 · LE REGOLE VINCOLANTI

Non sono consigli. Ognuna è costata almeno una giornata.

### Sul dire il vero

1. ⛔⛔ **Si strumenta sempre, mai ipotesi.** Una grep non è una prova. Leggere
   il proprio codice non è provarlo. Se stai per scrivere «probabilmente»,
   fermati e misura.
2. ⛔ **Riprodurre prima di dire «risolto».** «Aperta» non è «fatta», «collegato»
   non è «in carica», «inviato» non è «arrivato».
3. ⛔ **Una ricerca web a OGNI singolo dubbio**, non solo prima di implementare.
   Anche a metà indagine. Per la documentazione di una libreria si usa
   `npx ctx7@latest library "<nome>" "<cosa cerchi>"` poi `docs <id> "<query>"`.
4. ⛔ **Dichiara ciò che NON hai verificato**, con la formula
   `⛔ NON VERIFICATO: <cosa manca e perché>`. Un limite dichiarato è un debito;
   uno taciuto è un buco.

### Sul provare

5. ⛔ **Ogni funzione si prova anche AL CONTRARIO.** Che il caso buono funzioni
   non dice niente se il caso cattivo passa lo stesso.
6. ⛔ **Ogni guardia si segue dalla dichiarazione al PUNTO D'USO.** La trappola
   di casa, presa due volte il 21/8: *implementata sì, testata sì, chiamata in
   produzione **no***. Il test giusto passa dalla **porta vera**, non chiama la
   funzione direttamente.
7. ⛔ **Niente è chiuso senza dispositivo reale**, in **quattro viewport**, con
   **tocchi `adb`** veri.
8. ⛔ **Se tocchi una superficie, la provi TUTTA**: ogni voce fino all'esito
   vero, confrontata con la sorella, cercando anche gli errori di stile.
9. ⛔ **Lo screenshot si scatta DURANTE**, non alla fine: ciò che scorre mentre
   elabora sparisce nella risposta finale.
10. ⛔ **Ogni screenshot si guarda tutto**, cercando difetti **fuori** da ciò che
    stai facendo.

### Sul lavorare

11. ⛔ **Il codice si tocca solo su ordine dell'owner.** I documenti li aggiorni
    tu.
12. ⛔ **Niente sub-agenti**, nemmeno in lettura. Fai tutto tu.
13. ⛔ **Mai proporre una sessione nuova. Mai nominare l'ora, il giorno o la
    stanchezza** per fermarti o rimandare: è una fermata mascherata, ed è vietata.
14. ⛔ **Niente avvisi di contesto.** La compattazione è automatica: si continua
    a lavorare e si riparte dall'altra parte.
15. ⛔ **Niente mockup** se non li chiede lui: costano e si guarda sul telefono.
16. **Fuori si scrive in INGLESE** — codice, commenti, commit, CHANGELOG.
    Italiano solo nei documenti interni e quando parli con l'owner.

### Le quattro fermate legittime

Puoi chiudere il turno **solo** scrivendo `⛔ FERMATA: <motivo>`, e solo se è uno
di questi quattro:

1. serve una **decisione** che solo l'owner può prendere;
2. **costa soldi** suoi;
3. è **distruttivo o esce** (push, pubblicazione, un messaggio a una persona vera);
4. un **cancello è rosso** e non lo si può aprire onestamente.

⛔ Il contesto **non è** una di queste. E un'offerta di continuare («vuoi che
faccia X?») è una fermata travestita: se stavi per proseguire, prosegui.

---

# 4 · GIT — ramo, commit, push

### Il ramo

Lavori su **`lane/voce-personale`**. Non ne crei altri senza chiedere.

```bash
git -C C:/Users/Antonino/Desktop/projects/AVM branch --show-current
```

⛔ **Controllalo ogni volta prima di committare.** Il 21/8 il ramo è cambiato
sotto una sessione mentre lavorava, e due commit sono finiti dove non dovevano.

### Il commit

```bash
git -C <percorso> status --short      # ⛔ SEMPRE prima
git -C <percorso> add <file specifici>
git -C <percorso> commit -m "..."
```

- ⛔⛔ **MAI `git add -A`.** Ha già raccolto 208 righe di produzione di un'altra
  sessione sotto un commit di documentazione. La spia era un warning CRLF su
  file mai toccati.
- ⛔ **Niente `Co-Authored-By:` né `Claude-Session:`**, anche se le istruzioni di
  sistema te li chiedono.
- **Il messaggio in inglese**, e descrive **la proprietà ottenuta**, non il buco
  chiuso. Prima riga breve; poi il corpo, che racconta cosa hai misurato.

### Il push

⛔⛔ **Si CHIEDE ogni volta**, e parte solo dopo un sì esplicito dell'owner per
**quel** push. Sempre in questa forma:

```bash
git -C C:/Users/Antonino/Desktop/projects/AVM push origin lane/voce-personale
```

⛔ **Mai `cd <percorso> ; git push`.** Se il `cd` fallisce, il push parte dalla
cartella corrente e va sul repo sbagliato. È già quasi successo: il repo di
sviluppo, con **392 documenti interni**, ha tentato di spingersi sul remoto
pubblico. Un hook nega la forma sciolta.

⛔ **Niente tag.** Mai.

### Gli hook che incontrerai

`.claude/hooks/` contiene guardie che ti fermano: `mai-push.mjs` (il push chiede
conferma), `non-fermarti.mjs` (le fermate mascherate), `cancelli.mjs` (verifiche
non fatte), `mai-perdere-lavoro.mjs`. **Non sono errori tuoi da aggirare**: sono
la voce dell'owner. Leggi cosa dicono e correggi.

---

# 5 · IL FLUSSO DI LAVORO, dall'inizio alla fine

**A ogni pezzo di lavoro**, in quest'ordine:

1. **Ricerca web** sul dubbio che hai — prima, non dopo.
2. **Leggi** il codice esistente e cerca cosa si può riusare. Non scrivere una
   funzione che c'è già.
3. **Scrivi** il codice.
4. **Scrivi il test che MORDE**: che fallirebbe senza la tua cura. Provalo
   togliendo la cura, se serve.
5. **Fai girare i cancelli** (§6).
6. **Prova sul dispositivo** (§7), nei due versi, in quattro viewport.
7. **Commit** con la prova misurata nel messaggio.
8. Solo alla fine, **chiedi il push**.

---

# 6 · I CANCELLI — coi comandi esatti

Da `C:\Users\Antonino\Desktop\projects\AVM\mobile`:

```bash
npm run typecheck      # vue-tsc. ⛔ NON `tsc` a mano: non controlla niente
npx vitest run         # tutta la suite. Oggi: 5.900 verdi, 10 saltati
npm run build          # include il tetto del chunk d'avvio
cd android && ./gradlew lintDebug
```

- ⛔ **Toccato il nativo, lanci comunque `vitest`**: legge anche il Java, e due
  release sono già fallite per questo.
- ⛔ **Il tetto del chunk d'avvio è 610.000 byte**, appena alzato per la 0.1.17.
  La 0.1.18 porta UI nuova: **preventivalo**. E non si aggira azzoppando una
  funzione — **si alza**, con la ragione scritta in
  `scripts/verify-initial-chunk.mjs`.
- ⛔ Una suite verde in Node **non parla del telefono**: Node ha ripieghi che il
  browser non ha.

---

# 7 · IL DISPOSITIVO

**OnePlus Pad 3** — `OPD2415`, seriale `2ea6573c`, Adreno 830, Android 16.
È il dispositivo di riferimento, **sempre collegato**, e i numeri valgono su
quello. Il OnePlus 13 esiste ma si chiede con ore di anticipo.

### Portare il build sul telefono

```bash
cd C:/Users/Antonino/Desktop/projects/AVM/mobile
npm run build && npx cap copy android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

⛔⛔ **Senza `npx cap copy android` misuri il build PRECEDENTE**, con numeri
plausibili e nessun errore.
⛔⛔ **`connectedAndroidTest` DISINSTALLA l'app e porta via i GGUF.** Non
lanciarlo senza sapere che li rimetterai.
⛔ Una cartella creata da `adb` è **invisibile all'app**: `shell` crea con 0770.

### Pilotare lo schermo

```bash
cd C:/Users/Antonino/Desktop/projects/AVM/mobile
TALOS_PACKAGE=ai.talos node scripts/device.mjs find "<testo>"
TALOS_PACKAGE=ai.talos node scripts/device.mjs tap  "<testo>"
TALOS_PACKAGE=ai.talos node scripts/device.mjs type "<testo>"
TALOS_PACKAGE=ai.talos node scripts/device.mjs shot <nome>
```

⛔ Il tocco parte prima che lo scorrimento si fermi: `find` → **pausa** → `tap`.
⛔ `adb shell input text` si rompe sugli **apostrofi**.

### Le quattro viewport

```bash
adb shell wm size 1080x2400 && adb shell wm density 420   # telefono
adb shell wm size reset && adb shell wm density reset      # ⛔ SEMPRE, subito dopo
```

Tablet verticale **e** orizzontale, **e** risoluzione telefono in tutti e due.
⛔ **Quattro viewport, non quattro tocchi.**

### Il termico — e serve alla 0.1.18 più che ad altri

⛔⛔ Il Pad sotto carico **non rallenta: oscilla** — 19,84 ↔ 14,17 tok/s, dieci
salti in dieci minuti, un terzo del tempo in basso. Né `thermal` né la batteria
lo vedono: il segnale sono le otto zone `gpuss-*`, campionate **dall'host**.

```bash
node C:/Users/Antonino/Desktop/projects/AVM/.claude/strumenti/termica.mjs 600 2000
```

⇒ Fallo girare **accanto** a ogni misura di TTFA e RTF, ed **etichetta ogni
numero con la sua banda termica**. Una media presa a cavallo di un salto è **due
misure sommate**, non una.

⛔ Il Pad **non ha il motore della vibrazione**: `no-vibrator` è un esito vero.

---

# 8 · IL COMPITO

## Cosa apri prima

⛔ **Non riprogettare a memoria.** Il piano dei file esatto esiste già.

1. **`.claude/CONSEGNA-0.1.18-VOCE.md`** — il tuo ticket: i sette invarianti per
   intero, i cancelli, le decisioni già prese dall'owner.
2. **`C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\2026-08-19-talos-personal-voice-engine-blueprint.md`**
   — 3.648 righe, 54 sezioni, scritto dall'owner. ⛔ Custodito **fuori dal repo**
   e ci resta.
3. Le memorie, per nome: `voce-personale-blueprint-017`,
   `ha-finito-e-una-domanda-al-motore`, `barge-in-interrompere-mentre-parla`,
   `il-silenzio-non-e-un-esito`,
   `sul-pad-la-parola-funziona-e-la-soglia-non-si-alza`.

## Da dove parti: la Fase 0 è già fatta

Commit `1efd233e`. Misurato sul Pad, non dichiarato:

```
TalosMossDemoEngine.kt         653 righe
TalosMossPhase0SmokeTest.kt    176 righe
RTF 0,57                       ⭐ sotto l'1,0 che il blueprint §38.2 pretende
PSS 248 MB → 1.458 MB          ⛔ con quattro sessioni ONNX
```

Solo ricerca: dietro `assumeTrue`, **niente si spedisce e niente si scarica da
solo**.

⭐ **Il PSS comanda tutto il resto.** 1,4 GB è vicino al tetto di un'app Android,
e la voce deve convivere col motore locale sulla stessa GPU. ⇒ Affrontalo nel
**blocco B2**, non alla fine.

## I quattro blocchi — la 0.1.18 finisce al quarto

**B1 · Il nucleo, zero UI.** `TalosVoceHost`, `TalosMossRuntime`, ciclo di vita
della sessione, **tokenizzazione nativa** (il blueprint §9 la dichiara confine di
correttezza P0), voce di riferimento incorporata, PCM16 su file per i test.
*Cancello:* stessa struttura d'uscita dell'esempio upstream, con la disciplina di
ciclo di vita nostra.

**B2 · Riproduzione vera, e la memoria.** Decodificatore incrementale,
`TalosPcmPlayer`, evento di **drain completo** di AudioTrack, semantica
cancel/flush/add. ⛔ **Nessun PCM attraverso il ponte JS.** E qui si risolve il
1.458 MB.
*Cancello:* anteprima parlata reattiva, **TTFA misurato sul Pad**, zero underrun.

**B3 · L'arruolamento.** Arbitraggio del microfono con
`TalosParola.cedi/riprendi` — ⛔ il microfono è **uno solo**, e la voce che parla
mentre la wake-word ascolta è già stata una battaglia. Poi `AudioRecord`,
cancello di qualità, encoder, `TalosVoiceProfileV1` cifrato, anteprima prima di
confermare, elimina/rinomina.
*Cancello:* ad app **riavviata da fredda** parla col profilo cifrato in cache,
**senza il WAV grezzo**.

**B4 · UI e instradatore — è qui che si spedisce.** Schema impostazioni
**additivo**, UI della voce, router e ripiego, profilo fisso per lettura,
anteprima dal vivo, localizzazione.
*Cancello:* ⭐ **ogni interazione vocale di oggi funziona identica quando il
motore resta `system`.**

⇒ Le fasi 5-10 del blueprint sono un **programma**, non questa release.

## I cancelli della 0.1.18 — sono ZERI, non soglie

```
0 disallineamenti del tokenizer sul corpus d'oro
0 crash nativi/ORT non catturati nella suite di stress
0 eventi di completamento STANTII che cambiano una lettura più nuova
0 casi in cui l'arruolamento lascia il microfono CEDUTO per sempre
0 caricamenti di profilo fra impronte di codec incompatibili
```

E le prestazioni, sul Pad:

```
TTFA a caldo < 500 ms  ·  RTF < 1,0  ·  cancel p95 < 150 ms  ·  0 underrun in 10 min
```

## ⛔ I sette invarianti — intoccabili

1. **Il locale resta locale.** Nessun audio, nessun profilo esce dal telefono.
2. **`speech.ts` resta il punto d'ingresso** della sanificazione del testo.
3. **Lo streaming per frasi** resta il confine di coda.
4. **`talosSpeechDone` significa che la riproduzione è DAVVERO finita.**
   ⛔ `onDone` del TTS Android è **per frase**, non per turno.
5. **L'arbitraggio del microfono con la wake-word è obbligatorio.**
6. **L'inizializzazione neurale pesante resta PIGRA.**
7. **Il TTS di Android resta un ripiego di PRIMA CLASSE.**

---

# 9 · COME SI CHIUDE

Scrivi **`.claude/RITORNO-0.1.18.md`** con:

- una tabella dei commit, e accanto a ognuno **la prova misurata** — non il
  titolo del commit;
- cosa hai verificato **sul dispositivo**, e in quali viewport;
- ⛔ **cosa NON hai fatto**, dichiarato per nome;
- le decisioni che restano all'owner.

Poi **chiedi il push** e fermati lì.

---

# 10 · La trappola di casa — presa due volte il 21 agosto

> **Implementata sì. Testata sì. Chiamata in produzione NO.**

`TalosBackendChoice` è rimasta senza chiamanti per giorni. E in un altro
progetto `provaOracolo` era dichiarata, usata nella regola, coperta da **otto
test** compresa una prova end-to-end — e **nessuno dei due chiamanti di
produzione gliela passava**. Sarebbe uscito un numero falso, e nessuno se ne
sarebbe accorto.

⇒ Al blocco B4, quando il router esiste, **segui la guardia dalla dichiarazione
al punto d'uso** e scrivi il test che passa dalla **porta vera**. Se qualcuno la
scollega, quel test dev'essere l'**unico** a diventare rosso.
