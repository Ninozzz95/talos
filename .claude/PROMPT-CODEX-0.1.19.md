# Ordine di lavoro per CODEX — 0.1.19, la voce che sta al passo

> ⛔ **Questo documento è autosufficiente.** Non hai una memoria che si carica da
> sola, non hai hook che ti fermano, non hai un indice di lezioni alle spalle:
> tutto ciò che serve è scritto qui dentro o nei file che questo documento cita
> per percorso. Leggilo tutto **prima** di toccare una riga.
>
> ⛔ **Se trovi una contraddizione fra due punti, FERMATI e chiedi.** Non
> sceglierne un lato. È già successo il 2026-08-04 e avevi ragione tu: il
> difetto era nel documento. La correzione si fa qui, datata, così chi legge
> dopo sa che quel punto è stato discusso.

---

# 1 · Il lavoro, in una riga

La 0.1.18 di TALOS è uscita e **funziona**: l'app parla con la voce dell'owner,
addestrata sul dispositivo. Poi, su una lettura lunga, **balbetta** — e peggiora
verso la metà.

Il tuo compito **non è aggiungere una funzione**. È far arrivare la voce che c'è
già in fondo a una lettura di 200 parole **senza un solo buco** — oppure
dimostrare che su questo hardware non si può, e far dire all'app un limite
onesto invece di uno streaming che non regge.

⛔ **Il primo blocco non scrive una cura: costruisce una misura.** Non è
prudenza: sono ore contro settimane, e la misura decide **quale** delle cinque
strade aprire.

---

# 2 · Dove lavori — ⛔ NON nella cartella principale

**C'è un altro agente al lavoro in questo momento**, e non nel tuo stesso
albero: sta ottimizzando il **motore dei modelli locali** (llama.cpp) sul ramo
`lane/voce-personale`, dentro `C:\Users\Antonino\Desktop\projects\AVM`.

⇒ Due agenti non possono condividere un albero di lavoro: il primo `checkout`
strapperebbe i file da sotto l'altro. Ti è stato preparato un **ramo tuo**, e ti
serve un **albero tuo**.

### Passo 0 — da fare per primo, una volta sola

```bash
# il ramo esiste già: lane/voce-fluida, staccato da lane/voce-personale @ b386197c
git -C C:/Users/Antonino/Desktop/projects/AVM worktree add \
    C:/Users/Antonino/Desktop/projects/AVM-voce lane/voce-fluida

cd C:/Users/Antonino/Desktop/projects/AVM-voce
git submodule update --init --recursive     # ⛔ mobile/third_party/llama.cpp
cd mobile && npm ci
```

⛔ **Da qui in poi il tuo percorso è `C:\Users\Antonino\Desktop\projects\AVM-voce`.**
Non scrivere mai dentro `AVM`: è dell'altro agente.

⛔ Se `worktree add` fallisce perché la cartella esiste già, **non cancellarla**:
fermati e chiedi.

### La mappa completa

```
C:\Users\Antonino\Desktop\projects\
  AVM\                 ⛔ ALTRO AGENTE (lane/voce-personale) — non ci scrivi
  AVM-voce\            ⭐ IL TUO (lane/voce-fluida)
  AVM-harness\         ⛔ un altro albero ancora (lane/harness-coding)
  AVM-PUBBLICA\        ⛔ la copia PUBBLICA dell'app. Non la tocchi mai.
  AVM-miniera\         ⛔ una copia usata dal banco. Non è tua.
  TALOS-RICERCHE\      📖 le ricerche dell'owner — si LEGGONO, non entrano nel repo
  TALOS-BANCO\         ⛔ il banco degli agenti. Non è tuo.
```

**I due remoti:**

```
origin   github.com/Ninozzz95/agent-virtual-machine   PRIVATO — è qui che lavori
public   github.com/Ninozzz95/talos                   PUBBLICO — non lo tocchi
```

⛔ **Le chiavi di firma stanno solo sul pubblico.** I tag di release li mette
l'owner. Tu non pubblichi e non tagghi mai.

---

# 3 · ⛔ IL CONFINE CON L'ALTRO AGENTE — file per file

Lavorate sullo stesso prodotto in due rami. Il confine è per **file**, e non si
negozia a metà lavoro.

### Tuoi — ci scrivi tu, lui no

```
mobile/android/app/src/main/java/ai/talos/voice/**
mobile/android/app/src/androidTest/java/ai/talos/voice/**
mobile/scripts/research/voice-*                      (file nuovi che crei tu)
.claude/RITORNO-CODEX-0.1.19.md                      (il tuo resoconto)
```

### Suoi — **non li apri in scrittura**, nemmeno per una riga

```
mobile/android/app/src/main/java/ai/talos/TalosLlama*.java|kt
tutto ciò che riguarda il motore di testo locale, il backend GPU/OpenCL,
il banco di prova delle prestazioni del modello locale
mobile/third_party/llama.cpp                         (sottomodulo)
```

### Condivisi — ⛔ si toccano solo se indispensabile, e si dichiara

```
CHANGELOG.md               ← l'owner lo aggiorna al rilascio. NON scriverci tu.
mobile/package.json        ← se ti serve uno script nuovo, CHIEDI prima
mobile/src/**              ← la parte TypeScript/Vue: al blocco B0 non serve
ai/talos/TalosThermal.kt   ← lo leggono tutti e due: SOLA LETTURA
```

⭐ Il blocco B0 — l'unico autorizzato adesso — sta **tutto** dentro i file tuoi.
Il confine regge senza sforzo. Se un blocco successivo dovesse uscirne, quello è
il momento di fermarsi e chiedere, non di allargare il confine da solo.

---

# 4 · LE REGOLE — ognuna è costata almeno una giornata

## Sul dire il vero

1. ⛔⛔ **Si strumenta sempre, mai ipotesi.** Una `grep` non è una prova.
   Rileggere il proprio codice non è provarlo. Se stai per scrivere
   «probabilmente», fermati e misura.
2. ⛔ **Riprodurre prima di dire «risolto».** «Compila» non è «funziona»,
   «parte» non è «finisce», «il test passa» non è «sul telefono va».
3. ⛔ **Dichiara ciò che NON hai verificato**, con questa formula esatta:
   `⛔ NON VERIFICATO: <cosa manca e perché>`. Un limite dichiarato è un debito;
   uno taciuto è un buco.
4. ⛔ **`IGNOTO` non è `ZERO`.** Un numero che non si è riusciti a leggere non
   diventa zero, non diventa una media, non sparisce: si scrive che è ignoto e
   si dice perché. Questa regola ha già salvato due misure sbagliate di 10 volte.

## Sul misurare — e questa release è quasi tutta misura

5. ⛔⛔ **Ogni proposta porta il suo FALSIFICATORE.** Prima di implementare una
   cura, scrivi il numero che, se non si muove, dice che avevi torto. Una cura
   senza falsificatore si scarta in un giorno invece che in un'ora.
6. ⛔⛔ **La colonna giusta, non quella comoda.** Qui la colonna giusta **non è
   l'RTF medio**: è l'**ultimo quarto** della lettura lunga. Una cura che
   migliora il primo quarto e lascia il quarto sopra il budget non ha curato
   niente di ciò che l'owner sente.
   *(Il 22/8, su un altro banco, una cura ragionata sul costo totale ha
   dimezzato i task risolti lasciando il totale quasi identico. Il totale non
   era la colonna giusta.)*
7. ⛔⛔ **Ogni numero etichettato con la sua banda termica.** Il tablet sotto
   carico **non rallenta: oscilla** — misurato 19,84 ↔ 14,17 tok/s, dieci salti
   in dieci minuti, un terzo del tempo in basso. Una media presa a cavallo di un
   salto è **due misure sommate**, non una. Lo strumento c'è già (§7).
8. ⛔ **Numeri troppo uguali sono un allarme, non una conferma.** Se una corsa
   A/B dà due numeri identici, il primo sospetto è che una delle due non sia
   partita.

## Sul provare

9. ⛔ **Ogni funzione si prova anche AL CONTRARIO.** Che il caso buono funzioni
   non dice niente se il caso cattivo passa lo stesso.
10. ⛔⛔ **Ogni guardia si segue dalla dichiarazione al PUNTO D'USO.** È la
    trappola di casa, e in questo repo è scattata **tre volte in un giorno**:

    > **Implementata sì. Testata sì. Chiamata in produzione NO.**

    Il test che vale passa dalla **porta vera** — la funzione che gira in
    produzione — non chiama la funzione direttamente. Se qualcuno la scollega,
    quel test dev'essere l'**unico** a diventare rosso.
11. ⛔ **Il test deve MORDERE.** Dopo averlo scritto, rompi di proposito la cura
    e verifica che diventi rosso — e che **solo lui** diventi rosso. Un test che
    passa anche col difetto è peggio di nessun test.
12. ⛔ **Niente è chiuso senza il dispositivo reale.**

## Sul lavorare

13. ⛔ **Non tocchi codice fuori dal tuo confine** (§3).
14. ⛔ **Fuori si scrive in INGLESE**: codice, commenti, messaggi di commit.
    Italiano nei documenti interni e quando parli con l'owner.
15. ⛔ **Niente `git push`, niente tag, niente pubblicazione.** Vedi §5.
16. ⛔ **Non proporre di rimandare.** Se un blocco è finito, si passa al
    successivo autorizzato; se non ce ne sono, si chiude col resoconto (§9).

## ⛔ Quando fermarsi — e sono solo quattro casi

Chiudi il turno **solo** scrivendo `⛔ FERMATA: <motivo>`, e solo se è uno di
questi:

1. serve una **decisione** che solo l'owner può prendere (compresa una
   contraddizione trovata in questo documento);
2. l'azione **costa soldi** suoi;
3. l'azione è **distruttiva o esce** (push, pubblicazione, cancellazione);
4. un **cancello è rosso** e non lo si può aprire onestamente.

⛔ «Il contesto sta finendo» **non** è uno di questi.

---

# 5 · GIT — e il push non lo fai tu

### Il ramo

```bash
git -C C:/Users/Antonino/Desktop/projects/AVM-voce branch --show-current
# deve dire: lane/voce-fluida
```

⛔ **Controllalo prima di ogni commit.** Il 21/8 un ramo è cambiato sotto una
sessione mentre lavorava e due commit sono finiti dove non dovevano.

### Il commit

```bash
git -C C:/Users/Antonino/Desktop/projects/AVM-voce status --short   # ⛔ SEMPRE prima
git -C C:/Users/Antonino/Desktop/projects/AVM-voce add <file specifici>
git -C C:/Users/Antonino/Desktop/projects/AVM-voce commit -m "..."
```

- ⛔⛔ **MAI `git add -A` né `git add .`** In questo repo ha già raccolto 208
  righe di produzione di un'altra sessione sotto un commit di documentazione. La
  spia era un warning CRLF su file mai toccati. Si aggiungono **file per nome**.
- ⛔ **Niente righe di co-autore** nei messaggi (`Co-Authored-By:`,
  `Generated-with:` e simili): non ne vanno nella storia di questo repo.
- **Messaggio in inglese**, e descrive **la proprietà ottenuta**, non il buco
  chiuso. Prima riga breve; poi il corpo, che racconta **cosa hai misurato**.

### Il push — ⛔ non è tuo

```
⛔ NON eseguire `git push`. Mai, in nessuna forma, su nessun remoto.
```

Quando hai finito, **chiedi**: scrivi all'owner il comando esatto che vorresti
fosse eseguito, e fermati. Sarà lui a decidere. Non ci sono hook che ti fermano
in questo albero: la guardia sei tu.

---

# 6 · I CANCELLI — comandi esatti

Da `C:\Users\Antonino\Desktop\projects\AVM-voce\mobile`:

```bash
npm run typecheck                     # vue-tsc. ⛔ NON `tsc` a mano: non controlla niente
npx vitest run                        # tutta la suite
npm run build                         # include il tetto del chunk d'avvio
cd android && ./gradlew lintDebug
```

⛔ **Il numero di partenza della suite lo MISURI TU al primo giro** e lo scrivi
nel resoconto. Non copiarlo da qui: un numero copiato da un prompt è una
dichiarazione, non una misura.

- ⛔ **Toccato il nativo (Kotlin/Java), lanci comunque `vitest`**: la suite legge
  anche i sorgenti nativi, e due release sono già fallite per questo.
- ⛔ **Il tetto del chunk d'avvio** vive in `mobile/scripts/verify-initial-chunk.mjs`.
  Non si aggira azzoppando una funzione: **si alza**, con la ragione scritta lì
  dentro. Al blocco B0 non dovrebbe muoversi.
- ⛔ **Una suite verde in Node non parla del telefono**: Node ha ripieghi che il
  dispositivo non ha.

---

# 7 · IL DISPOSITIVO — ⛔ è UNO SOLO e lo condividete

**OnePlus Pad 3** (`OPD2415`, Adreno 830, Android 16), collegato via `adb`.

⛔⛔ **L'altro agente sta misurando le prestazioni del motore locale sullo stesso
tablet.** Due misure di prestazione insieme si rovinano a vicenda: la sua
occupa CPU e GPU, la tua misura millisecondi. **Il dispositivo si prenota**: prima
di una sessione di misura, chiedi all'owner una finestra e dichiara quanto dura.
Compilare e installare va bene in qualunque momento; **misurare no**.

### Portare il build sul telefono

```bash
cd C:/Users/Antonino/Desktop/projects/AVM-voce/mobile
npm run build && npx cap copy android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

⛔⛔ **Senza `npx cap copy android` misuri il build PRECEDENTE**, con numeri
plausibili e nessun errore.
⛔ Una cartella creata da `adb shell` è **invisibile all'app** (permessi 0770).

### ⛔⛔ I test strumentati: NON con Gradle

Le prove di B0 girano come test strumentati, e qui c'è una trappola già pagata.

**`./gradlew connectedAndroidTest` DISINSTALLA l'app alla fine** — è il
comportamento documentato del plugin, non un guasto — e con l'app se ne va la
sua cartella privata: dati, chiavi, e **tutti i modelli**. Misurato il 20/8: due
test verdi, e subito dopo `pm path ai.talos` vuoto e nessun modello sul disco. I
file del motore vocale stanno in `externalFilesDir/moss/` e ci sono arrivati **a
mano** con `adb push`: non esiste un download automatico che li rimetta.

⇒ ⭐ **Esiste già lo script che fa le due cose che Gradle nasconde** e non la
terza. Si usa quello, sempre:

```bash
cd C:/Users/Antonino/Desktop/projects/AVM-voce/mobile
node scripts/research/run-device-tests.mjs ai.talos.voice.<NomeDelTest>
```

Leggi `mobile/scripts/research/README.md` prima del primo uso.
⛔ **Non lanciare `./gradlew connectedAndroidTest` né
`connectedDebugAndroidTest`.** Se ti serve un comportamento che lo script non
copre, fermati e chiedi: rimettere i modelli a mano costa più di una domanda.

### Il termico — a questa release serve più che a qualunque altra

```bash
node C:/Users/Antonino/Desktop/projects/AVM-voce/.claude/strumenti/termica.mjs 600 2000
```

Fallo girare **accanto** a ogni misura. Il segnale non è lo stato `thermal` di
Android né la batteria: sono le zone `gpuss-*` del SoC, campionate **dall'host**.

---

# 8 · IL COMPITO

## Cosa apri, in quest'ordine

1. **`.claude/CONSEGNA-CODEX-0.1.19-VOCE-FLUIDA.md`** — il piano: cosa è già
   verificato contro il nostro codice, cosa non lo è, i blocchi in ordine di
   guadagno per costo, e il falsificatore di ognuno.
   ⛔ **Solo il blocco B0 è autorizzato adesso.**
2. **`C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\2026-08-22-talos-tts-stutter-root-cause-e-piano.md`**
   — la ricerca commissionata, 1.845 righe, in inglese. È il documento tecnico
   di riferimento: ogni proposta porta il suo falsificatore.
   ⛔ **Si legge dove sta. NON entra nel repo, in nessuna forma.**
3. **`...\TALOS-RICERCHE\2026-08-22-talos-tts-stutter-brief-commissionato.md`** —
   la domanda che le è stata fatta, e **cosa era già stato escluso con una
   misura**: leggilo, o rischi di riprovare una cosa già misurata peggiore.
4. **`...\TALOS-RICERCHE\2026-08-19-talos-personal-voice-engine-blueprint.md`** —
   il progetto originale della voce, scritto dall'owner.
5. **`.claude/RITORNO-0.1.18.md`** — cosa ha fatto l'agente precedente, con le
   sue misure. Non rifarlo.

## ⛔ Gli otto invarianti del motore vocale — intoccabili

Valgono da prima di te e valgono dopo:

1. **Il locale resta locale.** Nessun audio, nessun profilo vocale lascia il
   dispositivo. Nessuna proposta che mandi audio o testo a un server è ammessa.
2. **`speech.ts` resta il punto d'ingresso** della sanificazione del testo.
3. **Lo streaming per frasi** resta il confine di coda.
4. **`talosSpeechDone` significa che la riproduzione è DAVVERO finita** — non che
   il motore ha smesso di generare.
5. **L'arbitraggio del microfono con la parola di attivazione è obbligatorio**: il
   microfono è uno solo.
6. **L'inizializzazione neurale pesante resta PIGRA**: niente si carica solo
   perché l'app è partita.
7. **Il TTS di Android resta un ripiego di PRIMA CLASSE**: ogni interazione
   vocale deve funzionare identica quando il motore neurale non c'è.
8. ⭐ **TALOS non promette uno streaming che il profilo qualificato non regge.**
   Se l'RTF sostenuto non scende sotto 1 con margine, la lettura lunga si
   **genera prima e si riproduce poi** — un limite dichiarato, non un buffer più
   grande che sposta il problema più in là.

---

# 9 · COME SI CHIUDE

Scrivi **`.claude/RITORNO-CODEX-0.1.19.md`** con:

- una tabella dei commit, e accanto a ognuno **la prova misurata** — non il
  titolo del commit;
- ⭐ **la tabella per quarti** della lettura lunga (Q1/Q2/Q3/Q4), prima e dopo
  ogni intervento: è la colonna che conta;
- ogni numero con la sua **banda termica**;
- cosa hai verificato **sul dispositivo**;
- ⛔ **cosa NON hai fatto**, dichiarato per nome;
- ⛔ **quali falsificatori hanno sparato**: le cure provate e **buttate** valgono
  quanto quelle che restano — è così che nessuno le riprova;
- le decisioni che restano all'owner.

Poi **chiedi il push** e fermati lì.

---

# 10 · La risposta che ti si chiede adesso

Prima di scrivere codice, rispondi all'owner con:

```
1. il passo 0 è riuscito?  (worktree, submodule, npm ci)        sì / no + errore
2. il ramo su cui sei                                            lane/voce-fluida?
3. il numero di partenza della suite, MISURATO da te             ____ verdi, ____ rossi
4. contraddizioni trovate in questo documento o nella consegna   elenco, o «nessuna»
5. la finestra che chiedi sul tablet per la prima misura         quanto dura
```

⛔ Il punto 4 non è una formalità. Se trovi due punti che si annullano,
**fermati e dillo**: è già successo il 2026-08-04 e avevi ragione tu.
