# Prompt d'avvio — agente 0.1.18, la voce personale

> Da incollare in una sessione nuova. Tutto il resto sta nei documenti che
> nomina: questo serve solo a farti partire dalla parte giusta.

---

Implementi la **0.1.18 di TALOS: la voce personale** — il motore che si addestra
sulla voce dell'owner e la usa al posto di quelle di sistema.

## Prima di scrivere una riga

Apri questi tre, in quest'ordine. ⛔ **Non riprogettare a memoria**: il piano dei
file esatto esiste già, e ricostruirlo a intuito è il modo più veloce per
sbagliare fase 3 avendo fatto bene la 1 e la 2.

1. **`.claude/CONSEGNA-0.1.18-VOCE.md`** — sul ramo `lane/voce-personale`. È il
   tuo ticket: da dove parti, i sette invarianti per intero, i cancelli, e le
   decisioni che l'owner ha già preso.
2. **`C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\2026-08-19-talos-personal-voice-engine-blueprint.md`**
   — 3.648 righe, 54 sezioni, scritto dall'owner. Custodito **fuori dal repo** e
   ci resta. Porta il piano dei file, la matrice dei backend, il piano di test e
   i cancelli di accettazione.
3. Le memorie, per nome: `voce-personale-blueprint-017`,
   `ha-finito-e-una-domanda-al-motore`, `barge-in-interrompere-mentre-parla`,
   `il-silenzio-non-e-un-esito`, `sul-pad-la-parola-funziona-e-la-soglia-non-si-alza`.

## Da dove parti davvero: la Fase 0 è già fatta

Commit `1efd233e` su `lane/voce-personale`. Misurato sul Pad, non dichiarato:

```
TalosMossDemoEngine.kt         653 righe
TalosMossPhase0SmokeTest.kt    176 righe
RTF 0,57                       ⭐ sotto l'1,0 che il blueprint §38.2 pretende
PSS 248 MB → 1.458 MB          ⛔ con quattro sessioni ONNX
```

Solo ricerca: dietro `assumeTrue` sui modelli presenti, **niente si spedisce e
niente si scarica da solo**.

⭐ **Il numero che comanda tutto il resto è il PSS.** 1,4 GB con quattro sessioni
è vicino al tetto di un'app Android, e la voce deve convivere col motore locale
che gira sulla stessa GPU. ⇒ Affrontalo nel **blocco 2**, non alla fine.

## I quattro blocchi — e la 0.1.18 finisce al quarto

**B1 · Il nucleo, zero UI.** `TalosVoceHost`, `TalosMossRuntime`, ciclo di vita
della sessione, **tokenizzazione nativa** (il blueprint §9 la dichiara confine di
correttezza P0), voce di riferimento incorporata, PCM16 su file per i test.
*Cancello:* stessa struttura d'uscita dell'esempio upstream, con la disciplina di
ciclo di vita nostra.

**B2 · Riproduzione vera, e la memoria.** Decodificatore incrementale,
`TalosPcmPlayer`, evento di **drain completo** di AudioTrack, semantica
cancel/flush/add. ⛔ **Nessun PCM attraverso il ponte JS.** E qui si risolve il
1.458 MB: quante sessioni ONNX servono davvero insieme.
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

## ⛔ I cancelli sono ZERI, non soglie

```
0 disallineamenti del tokenizer sul corpus d'oro
0 crash nativi/ORT non catturati nella suite di stress
0 eventi di completamento STANTII che cambiano una lettura più nuova
0 casi in cui l'arruolamento lascia il microfono CEDUTO per sempre
0 caricamenti di profilo fra impronte di codec incompatibili
```

E le prestazioni, **sul OnePlus Pad 3** — è il dispositivo di riferimento, sempre
collegato, e i numeri valgono su quello:

```
TTFA a caldo < 500 ms  ·  RTF < 1,0  ·  cancel p95 < 150 ms  ·  0 underrun in 10 min
```

⛔⛔ **Ogni numero va etichettato con la sua banda termica.** Il Pad sotto carico
non rallenta: **oscilla** — 19,84 ↔ 14,17 tok/s, dieci salti in dieci minuti, un
terzo del tempo in basso, e né `thermal` né la batteria lo vedono. Lo strumento
c'è già: `.claude/strumenti/termica.mjs`, che campiona le otto zone `gpuss-*`
dall'host. Una media presa a cavallo di un salto è **due misure sommate**.

⛔ Il Pad **non ha il motore della vibrazione**: se una schermata di arruolamento
prevede un ritorno tattile, qui non c'è.

## ⛔ La trappola di casa — presa due volte il 21/8

> **Implementata sì. Testata sì. Chiamata in produzione NO.**

`TalosBackendChoice` è rimasta senza chiamanti per giorni. E nel banco
`provaOracolo` era dichiarata, usata nella regola, coperta da **otto test**
compresa una prova end-to-end — e nessuno dei due chiamanti di produzione gliela
passava.

⇒ Al blocco B4, quando il router esiste, **segui la guardia dalla dichiarazione
al punto d'uso** e scrivi il test che passa dalla **porta vera**, non quello che
chiama la funzione direttamente. Se qualcuno la scollega, quel test dev'essere
l'**unico** a diventare rosso.

## Le regole d'ingaggio

- Ramo **`lane/voce-personale`**. ⛔ **Committa e non spinge mai** senza un sì
  esplicito dell'owner, ogni volta, nella forma `git -C <percorso> push`.
- ⛔ **Niente `git add -A`**: `git status --short` **prima** dell'add. È già
  costato 208 righe di produzione sotto un commit di documentazione.
- ⛔ Niente `Co-Authored-By:` né `Claude-Session:` nei commit.
- ⛔ **Fuori si scrive in inglese.** Italiano solo nei documenti interni.
- ⛔ **I documenti di ricerca non entrano nel repo.**
- ⛔ **Una ricerca web a ogni singolo dubbio**, non solo prima di implementare. Il
  segnale è la parola «probabilmente».
- ⛔ **Si strumenta sempre, mai ipotesi.** Una grep non è una prova, e leggere il
  proprio codice non è provarlo.
- ⛔ **Ogni funzione si prova anche al contrario**, e niente è chiuso senza
  **dispositivo reale** in **quattro viewport** con tocchi `adb`.
- ⛔ **Lo screenshot si scatta DURANTE**, non alla fine: ciò che scorre sparisce.
- ⛔ `connectedAndroidTest` **disinstalla l'app e porta via i GGUF**.
- ⛔ Toccato il nativo, **si lancia comunque `vitest`**: legge anche il Java, e
  due release sono già fallite per questo.

## I cancelli, coi comandi

Da `C:\Users\Antonino\Desktop\projects\AVM\mobile`:

```bash
npm run typecheck          # ⛔ non `tsc` a mano: non controlla niente
npx vitest run             # tutta la suite — oggi 5.900 verdi
npm run build              # include il tetto del chunk d'avvio
cd android && ./gradlew lintDebug
```

⛔ **Il tetto del chunk è a 610.000** ed è stato appena alzato per il sondaggio
della 0.1.17. La 0.1.18 porta UI nuova: **preventivalo**. E non si aggira
azzoppando una funzione — **si alza**, con la ragione scritta dove si legge.

⛔ **Senza `npx cap copy android` misuri il build PRECEDENTE**, con numeri
plausibili e nessun errore.

## Quando hai finito

Scrivi `.claude/RITORNO-0.1.18.md` con, per ogni commit, **la prova misurata**
accanto — non il titolo. E dichiara ciò che NON hai fatto: un limite dichiarato è
un debito, un limite taciuto è un buco.
