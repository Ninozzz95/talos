# CONSEGNA 0.1.19 — la voce che sta al passo

> Il ticket dell'agente 0.1.19. Le regole di lavoro stanno in
> `.claude/PROMPT-AGENTE-0.1.19.md`; qui c'è **il compito**: cosa è già
> verificato, cosa non lo è, i blocchi in ordine di guadagno per costo, e il
> numero che ucciderebbe ognuno.

---

# 0 · Il fatto che apre tutto — una contraddizione dentro il NOSTRO file

Nello stesso file, `TalosVoiceHost.kt`, due commenti misurati si contraddicono.

**Il primo** (`resolveFrameBudget`, riga 480 e seguenti) fa il conto della
pipeline a batch=8:

```
codec da solo, batch=8      RTF 0,204   (misurato)
generazione TTS da sola     RTF 0,53-0,69 (misurato in Fase 1)
serializzati, come girano   RTF 0,73-0,89
                            «comfortably under 1.0 with real margin»
```

**Il secondo** (`driveStreamingSynthesis`, riga 292 e seguenti), scritto lo
stesso giorno, dice:

```
lettura lunga, sul Pad      RTF sostenuto ~1,5
                            leadSeconds fisso a 0,000 dal primo batch in poi
                            un hardwareUnderrun quasi a ogni giro
```

## ⭐⭐⭐ Il buco NON SPIEGATO è più grande del deficit

A 12,5 frame al secondo un frame vale **80 ms di audio**. Quindi:

```
il modello scritto nel nostro file predice   58-71 ms di calcolo per frame
il dispositivo misura                       120 ms di calcolo per frame
                                            ─────────────────────────────
non attribuito a NIENTE                      49-62 ms per frame

quanto serve recuperare per arrivare a RTF 1,00   40 ms per frame
```

⇒ **C'è più tempo non spiegato di quanto ne serva per curare il difetto.**
Non manca una cura: manca una **misura**. Nessuno strumento in questo repo, oggi,
sa dire dove vanno quei 50 ms.

## Perché le due misure possono essere entrambe vere

Lo 0,53-0,69 è stato misurato su un'utterance **corta** — 66 frame, 5.280 ms di
audio, 2.779 ms di calcolo. L'1,5 su una lettura **lunga**.

Se il costo per frame del nucleo autoregressivo **cresce con la lunghezza già
generata**, le due misure descrivono frame diversi dello stesso motore, e sono
tutte e due giuste. È esattamente la forma che l'owner ha sentito dal vivo:
«meno stutter all'inizio, molti di più verso la metà».

⛔ Ed è **un'ipotesi**, non un fatto, finché non è misurata la pendenza. Il
blocco B0 esiste per questo.

---

# 1 · Cosa è VERIFICATO — alla fonte, non per sentito dire

La ricerca commissionata a ChatGPT
(`TALOS-RICERCHE\2026-08-22-talos-tts-stutter-root-cause-e-piano.md`) porta
otto rilievi. **Sono stati riaperti uno per uno contro il nostro codice** prima
di finire in questa consegna. Tutti e otto ci sono davvero.

| # | il rilievo | dove sta, da noi | verificato |
|---|---|---|---|
| **V-01** | la KV **cresce** e viene ricopiata a ogni frame | `TalosMossRuntime.kt:288-297` — l'intero `OrtSession.Result` precedente viene rifornito come `past`, chiuso, e sostituito dal nuovo `present` | ⭐ **alla fonte**: l'esportatore OpenMOSS al commit `cc7bdf19` fa `torch.cat([past_key, key], dim=1)` in **entrambi** i transformer, e dichiara `present_key_{i}: {1: "total_seq"}` come asse dinamico |
| **V-02** | buffer di heap ⇒ una copia diretta a ogni tensore | `TalosMossRuntime.kt:282, 283, 319, 320, 321` — cinque `IntBuffer.wrap`/`FloatBuffer.wrap` **dentro** il ciclo dei frame | ✅ letto |
| **V-03** | la maschera di ripetizione **ricostruita da zero** ogni frame | `TalosMossRuntime.kt:309-314` — `IntArray(nVq * 1024)` nuovo, più la camminata su `previousTokenSets: Array<HashSet<Int>>` (`:537`) | ✅ letto |
| **V-04** | il codec **blocca** l'attore autoregressivo | `TalosVoiceHost.kt:378` — `onFrame` chiama `decodePending()` da **dentro** `generate` | ✅ letto |
| **V-05** | **sei** sessioni aperte subito, ne servono quattro | `TalosMossRuntime.kt:46-51`, aperte tutte in `:411-432` | ✅ letto |
| **V-06** | **un solo** `SessionOptions` per sei grafi diversi | `TalosMossRuntime.kt:387-413` | ✅ letto |
| **V-07** | il log nel percorso caldo perturba la misura | `TalosVoiceHost.kt:367` — `Log.i` formattato **più** `TalosThermal.read` a ogni batch | ✅ letto |
| **V-08** | `pending.removeAt(0)` sposta la coda | `TalosVoiceHost.kt:335` | ✅ letto |

⭐ **E ha corretto un errore mio.** Avevo suggerito «OpenCL, come per
llama.cpp». Non esiste un execution provider OpenCL generale in ONNX Runtime
paragonabile al backend OpenCL di llama.cpp: sono due runtime con kernel
diversi, e un grafo ONNX non si può puntare a quel backend. La mia era
un'analogia, non una verifica.

---

# 2 · Cosa NON è verificato — il debito che B0 salda

⛔ Quattro cose sono **ignote**, e ognuna può rovesciare il piano.

1. **L'artefatto installato.** L'esportatore ha il `torch.cat`. Il modello sul
   Pad **non è stato aperto da nessuno**. Se il `.onnx` installato è già stato
   riscritto, V-01 è morto e l'analisi è vecchia.
2. **La pendenza.** Nessuno ha mai messo in grafico `globalDecodeMs` contro
   `pastValidLength`. Senza quella retta, «cresce con la lunghezza» resta una
   frase.
3. **L'RTF del solo nucleo su un testo LUNGO.** Lo 0,53-0,69 è di un'utterance
   corta. Il numero che serve non esiste.
4. **L'effetto dell'osservatore.** Il `Log.i` formattato e la lettura termica a
   ogni batch sono dentro il numero che stiamo ottimizzando. Nessuno ha mai
   confrontato diagnostica accesa contro spenta.

⇒ **Nessun blocco oltre B0 si apre prima che questi quattro abbiano una
risposta.** Non è prudenza: è che B0 costa ore e gli altri costano giorni o
settimane, e B0 dice **quale**.

---

# 3 · Il conto che comanda tutto

```
frequenza dei frame audio          12,5 al secondo
budget matematico per frame        80 ms          → RTF 1,00
budget di qualificazione           ≤68 ms         → RTF 0,85 (con margine)
oggi, misurato sul lungo           ~120 ms        → RTF ~1,5
da recuperare                      40 ms per frame, minimo
```

⭐ **La colonna che conta è l'ULTIMO QUARTO.** Ogni misura si spezza in quarti
(Q1/Q2/Q3/Q4) della lettura lunga. Una cura che migliora Q1 e lascia Q4 sopra
il budget **non ha curato niente di ciò che l'owner sente** — vedi
`[[ho-azzoppato-aider-ragionando-sul-costo]]`: il totale può restare identico
mentre la cosa che conta crolla.

---

# 4 · I BLOCCHI

> Ordinati per **guadagno atteso diviso costo**, non per eleganza. Ognuno porta
> il suo **falsificatore**: il numero che, se non si muove, lo uccide.
> ⛔ **Solo B0 è autorizzato adesso.**

---

## ⭐ B0 · Il laboratorio che dice la verità — L'UNICO AUTORIZZATO

**Costa ore. Decide settimane.**

### B0.1 · La traccia per frame

Un record a dimensione fissa, scritto in memoria e riversato **dopo** la
sintesi — mai un `Log.i` per frame dentro la corsa misurata.

```kotlin
data class TalosVoiceStepTrace(
    val utteranceId: Long,
    val frameIndex: Int,
    val pastValidLength: Int,      // ⭐ l'ascissa del grafico che decide tutto
    val localSampleNs: Long,       // localFixedFrameSession.run
    val callbackNs: Long,          // onFrame → codec + write
    val globalInputPrepNs: Long,   // i wrap, la maschera, la mappa dei feed
    val globalDecodeNs: Long,      // decodeSession.run
    val kvTransitionNs: Long,      // close del past + adozione del present
    val totalStepNs: Long,
    val rollingRtf16: Double,
    val javaHeapBytes: Long,
    val nativeHeapBytes: Long,
    val gcCount: Long?,
)
```

⛔ **Le cinque fasi devono sommare a `totalStepNs`** entro un errore
dichiarato. Se non tornano, la traccia sta misurando qualcos'altro: il resto è
il vero sospetto, e va nominato, non arrotondato.

### B0.2 · Le quattro corse

Stesso testo, stessa voce di riferimento, stesso seme, stessa banda termica di
partenza.

| corsa | cosa gira | a cosa risponde |
|---|---|---|
| **T0** | tutto: callback, codec, AudioTrack | riproduce il sintomo |
| **T1** | ⭐ solo il nucleo: `onFrame` vuoto, **niente codec, niente audio** | **l'RTF del solo autoregressivo su un testo lungo** — il numero che non esiste |
| **T2** | i frame di T1 **riprodotti** attraverso codec + AudioTrack | conferma il codec sulla stessa lunghezza |
| **T3** | profilo ORT acceso, tempi **non confrontabili** | quale operatore, quale provider, e come cambia col crescere della cache |

⛔ **T3 non si confronta con T0-T2**: il profiler cambia i tempi. Serve per la
distribuzione, non per la latenza.

⛔ **E una quinta, che è un controllo:** T0 con la diagnostica **spenta**. Se la
differenza è grande, il primo difetto da curare è lo strumento, non il motore.

### B0.3 · L'audit del grafo — costa dieci minuti

Il modello sta sul Pad, non su questo disco. Si tira giù e si guarda.

```bash
adb pull /sdcard/Android/data/ai.talos/files/moss/ ./moss-installato
```

Poi, sul `.onnx` che `tts_browser_onnx_meta.json` indica come `decode_step`:

```python
import onnx
m = onnx.load("decode_step.onnx", load_external_data=False)
for n in m.graph.node:
    if n.op_type == "Concat":
        print(n.name, n.input, n.output)
```

E si incrociano i `Concat` trovati coi nomi `past_*`/`present_*` del meta.

⛔ **L'artefatto vince sulla fonte.** Se quei `Concat` non ci sono, V-01 è morto
e B5 esce dal piano — e questa è una **buona** notizia, non una sconfitta.

### Il cancello di B0

L'artefatto (un JSON, non logcat) deve far rispondere a un lettore che non era
presente:

1. quale dei grafi ONNX domina il frame?
2. `globalDecodeMs` **cresce** con `pastValidLength`? con che pendenza?
3. quanto tempo sta **fuori** da `OrtSession.run()`?
4. quanto vale l'RTF del **solo** nucleo su un testo lungo?
5. quale pezzo della pipeline causa **ogni singolo** underrun?

### ⛔ La trappola di casa, nella sua forma nuova

Il registratore può funzionare benissimo dentro un test strumentato **e non
essere mai chiamato dal giro vero**. Allora tutta la settimana dopo si decide
su una traccia che descrive un percorso che nessuno usa.

⇒ Il test che vale parte da **`TalosVoiceHost.get(context)`** e legge la
traccia **dall'artefatto scritto dal giro di produzione**. Se qualcuno
scollega il registratore, quel test dev'essere l'**unico** a diventare rosso.

### Falsificatore di B0

Non ne ha, ed è il motivo per cui è il primo: B0 non propone una cura, **misura
la realtà**. L'unico modo di sbagliarlo è che la traccia non sommi, o che non
passi dalla porta vera.

---

## B1 · Sessioni per ruolo, e pigre — sei diventano quattro

Oggi si aprono sei sessioni a ogni risposta parlata: la decodifica completa
(percorso **offline**, per file) e l'encoder (percorso **arruolamento**) restano
aperte anche quando TALOS deve solo dire una frase.

```
oggi     prefill · global decode · local frame · codec step · codec full · codec encode
serve    prefill · global decode · local frame · codec step
```

E un `SessionOptions` unico per sei carichi diversi (`:387-413`), con
`setCPUArenaAllocator(false)` su tutti — cura giusta per un OOM vero
dell'arruolamento, applicata a **tutti e sei** perché non c'era altro posto
dove metterla.

**Perché prima delle prove sull'arena:** riaccendere l'arena su sei sessioni
avide **ricrea** il crash di memoria. Su una o due sessioni calde è un
esperimento sicuro e attribuibile.

**Cancello:** una lettura normale apre **4** sessioni, non 6 · l'uscita resta
identica a seme fisso · `cancel` p95 sotto 150 ms · il PSS di picco non
peggiora.

**Falsificatore:** se il PSS di picco e il tempo di apertura non si muovono, è
pulizia, non prestazione — e resta comunque, perché rende possibile B3.

---

## B2 · Il giro senza allocazioni

Buffer diretti persistenti e tensori riusati per ogni ingresso a forma fissa;
maschera di ripetizione **incrementale** (`mask[c*size + token] = 1` quando il
token esce, invece di ricostruirla camminando gli `HashSet`); mappe dei feed
costruite una volta; uscite a forma fissa **fissate** (`should_continue`,
`frame_token_ids`); `ArrayDeque` al posto di `removeAt(0)`.

⛔ Le `present` K/V **non** si possono fissare finché B5 non ne fissa la forma.

**Cancello:** l'RTF del solo nucleo migliora oltre il rumore · il conteggio GC
scende · l'uscita a seme fisso è **identica** · il PSS non peggiora.

**Falsificatore:** se in B0 `globalInputPrepNs + kvTransitionNs + GC` sta sotto
il 10% del frame, questo blocco non è la cura. Si fa lo stesso ciò che è
gratis, e si passa oltre senza raccontarlo come una vittoria.

---

## B3 · XNNPACK, per grafo, con la prova di dove sono finiti i nodi

È già dentro `onnxruntime-android`, si accende da Java, non richiede
conversione. È la sonda di acceleratore più economica che esista.

⛔ **Configurazione, o si misura una contesa invece di un guadagno:** XNNPACK ha
un suo pool di thread. `setIntraOpNumThreads(1)`, `SEQUENTIAL`,
`session.intra_op.allow_spinning = 0`, e i thread passati **dentro**
`addXnnpack`.

Sei candidati, C0 (tutto CPU) → C5, e decide il banco, non l'intuizione.

⛔⛔ **Una riga «XNNPACK» senza la prova di collocazione non è un risultato.**
Il profilo ORT deve dire **quanti nodi** e **quanto tempo** sono finiti su
XNNPACK. Un grafo etichettato XNNPACK che esegue tutti i `MatMul` costosi su
CPU è una misura di niente. ⇒ Ed è esattamente il difetto già preso una volta
su questo dispositivo: la flash attention era **accesa** su Adreno senza che
nessuno l'avesse scelta, e spegnerla ha tolto 4,7-6,6 s al primo messaggio —
`[[flash-attention-su-adreno-costa-e-non-rende]]`.

**Falsificatore, un'ora:** se meno di una frazione significativa dei nodi
pesanti va su XNNPACK, **o** l'RTF del solo nucleo non si muove, **o** la p95
per passo peggiora ⇒ la corsia si chiude. Nessuna integrazione in produzione
serve per rispondere.

---

## B4 · L'attore del codec — continuo, NON per frase

⛔⛔ **Non è il pipelining per frase**, che è già stato **provato e reso
indietro** con una misura: 74 underrun invece di 37, 87 s invece di 60 s sullo
stesso testo, e il dispositivo a `thermal=light` a metà lettura. Il prefill in
più per ogni frase costa più di quanto risparmi. **Non si riprova.**

Questo è diverso: **una sola generazione, un solo prefill**. Il codec prende un
attore suo con una coda limitata (16-24 frame, dimensionata in tempo audio, con
contropressione naturale quando è piena). Nessuna sessione ORT è toccata da due
thread: ogni attore possiede le sue.

```
oggi      RTF ≈ autoregressivo + codec     (si sommano)
dopo      RTF ≈ max(autoregressivo, codec) (il codec si nasconde sotto)
```

**Falsificatore, ed è severo:** se T1 dice che il **solo** nucleo sta già sopra
1,0, questo blocco **non può** curare lo stutter — toglie una somma, non rende
veloce un motore lento. Si tiene solo se paga in latenza o in pulizia, e non lo
si chiama la cura.

---

## B5 · ⭐⭐⭐ La KV a capacità fissa — la vera scommessa

**Se e solo se** B0 misura la pendenza.

```
oggi     past_key[L]  [1, past,   heads, dim]   →  present [1, past+1, heads, dim]
         ⇒ riallocato e ricopiato a ogni frame, a ogni strato
         ⇒ copiato in tutto: 1 + 2 + … + T   =  O(T²)

dopo     key_cache[L] [1, MAX, heads, dim]  +  cache_position  +  valid_length
         ⇒ si scrive alla posizione, si legge [0 : valid_length + 1]
         ⇒ nessun Concat di tutto il passato
```

Tre strade, in ordine di rischio: **A** riesportare con scrittura alla
posizione (portabile, e prerequisito per QNN); **B** un operatore ORT custom per
l'aggiornamento in-place (semantica esatta, più superficie nativa); **C**
adattarsi allo schema a buffer condivisi di ONNX Runtime GenAI (meno
reinvenzione, ma MOSS non è un decoder testuale standard).

⇒ **Si tenta A, validata su CPU.** Se il grafo continua a copiare, si passa a
I/O binding nativo o all'operatore custom.

⛔ **Secchi, non un caso peggiore unico.** La capacità si sceglie fra quattro
taglie derivate da utterance TALOS vere (risposta corta, risposta normale,
lettura lunga, modalità offline), e copre `prefill + frame massimi generati`.

**Cancello:** a seme fisso i **token dei frame sono identici** all'export FP32 ·
nessuna corruzione al confine del secchio · la latenza dell'ultimo quarto **non
cresce più** come oggi · `cancel` resta reattivo.

**Falsificatore:** se `globalDecodeMs` non cresce con la lunghezza, o se
l'export a cache condivisa non abbassa la pendenza dell'ultimo quarto, **non è
il collo**. Si tiene solo il guadagno di memoria, se c'è.

---

## B6 · INT8 riproducibile, con cancelli di QUALITÀ VOCALE

Un export INT8 di comunità dichiara RTF 0,60 → 0,36 e 640 MB → 196 MB. ⛔ Sono
**misure di terzi**, non nostre, su un altro chip: giustificano una
riproduzione controllata, non una promessa.

⛔⛔ **Non si scarica un modello opaco e lo si benedice.** Si costruisce dai
file FP32 ufficiali con uno script versionato che verifica lo SHA-256 della
sorgente ed emette un manifesto con le versioni degli strumenti e le impronte
di ciò che ha prodotto. Si quantizza **separatamente** il globale, il locale, e
poi entrambi: serve sapere **chi** porta la velocità e **chi** porta la deriva.

⭐ **E qui il cancello non è la velocità.** Per una **voce personale** la
somiglianza al timbro è un cancello duro: un modello più veloce che suona meno
come l'owner ha risolto il problema sbagliato. Si misurano WER/CER via ASR,
coseno dell'embedding del parlante contro la voce arruolata, F0 e contorno,
parole saltate o ripetute, rumore e clipping — sugli **stessi** testi, semi e
riferimenti di FP32.

**Falsificatore:** se la somiglianza al parlante scende sotto la soglia, il
profilo non si promuove **anche se** l'RTF crolla.

---

## B7 · Il giro ricorrente in nativo — CONDIZIONALE

Solo se B0 e B2 mostrano che la preparazione Java/JNI resta significativa
**dopo** i buffer diretti.

⛔ «Nativo è sempre più veloce» è falso: se i kernel ORT sono il 95% del frame,
spostare l'orchestrazione in C++ non recupera il 33% mancante. Un prototipo
deve mostrare un guadagno reale sull'RTF del solo nucleo **prima** che
l'architettura si adotti.

---

## B8 · QNN / Hexagon HTP — un PROGETTO, non questa release

Sarebbe la convivenza più pulita che esista: il motore di testo su Adreno
(OpenCL), la voce su Hexagon. Ma HTP pretende **forme fisse**, **modello
quantizzato**, ORT **ricompilato** con l'SDK Qualcomm, e non supporta `Loop`.

⇒ La catena dei prerequisiti passa **tutta** per B5. Un piano che comincia con
`addQnn()` sta saltando la parte difficile.

⛔ Condizioni d'arresto dichiarate **prima** di cominciare: backend non
caricabile dall'UID dell'app · operatori non supportati che spezzano il grafo ·
la quantizzazione statica che fallisce i cancelli di qualità vocale · il costo
di compilazione del contesto che domina l'uso normale · binari Qualcomm non
ridistribuibili col nostro modello di distribuzione.

---

## ⭐ B9 · Il limite ONESTO — e questo si spedisce comunque

Un buffer più grande **non può** curare un RTF sopra 1. Il conto è aritmetica,
non opinione:

```
riserva necessaria  L ≥ (RTF − 1) × durata rimanente + margine
a RTF 1,5 su 60 s   L ≈ 30 s
```

Trenta secondi di riserva **sono** una generazione anticipata. Chiamarla
streaming significa solo nascondere il ritardo sotto un buffer.

⇒ TALOS sceglie fra tre politiche, in base al profilo **qualificato** per
questo dispositivo, questo modello e questa impronta:

```
FAST_STREAM     p95 RTF ≤ 0,85   parte al primo pezzo di codec
RUNWAY_STREAM   0,85 < p95 ≤ 1,0 genera una riserva misurata, poi suona
RENDER_FIRST    p95 RTF > 1,0    genera tutto, poi suona — senza un buco
```

⛔ L'invariante non è la soglia (quella si tara sulle misure): è che **TALOS non
promette mai uno streaming che il profilo qualificato non regge**.

⭐ E questo blocco è l'unico che **si può spedire anche se tutto il resto
fallisce**: trasforma uno stutter in un'attesa dichiarata, che è un prodotto
diverso e migliore.

---

# 5 · L'albero delle decisioni — B0 lo risolve, non io

```
globalDecodeMs cresce forte con pastValidLength
    → B5 (KV fissa) è il lavoro principale, ed è lavoro sul MODELLO

localSampleMs costante ma > 40-50 ms per frame
    → B3/B6 sul modello locale vengono prima di B5

prep Java + transizione KV + GC oltre il 10-15%
    → B2 (e poi B7) prima di toccare qualunque grafo

il callback/codec aggiunge ~0,2 RTF e il nucleo sta sotto 1
    → B4 basta ad attraversare il confine del tempo reale

il nucleo da solo resta ≥ 1,2 dopo B2
    → nessuna pipeline lo salva: B5 + B6, o B9
```

⛔⛔ **CORREZIONE del 2026-08-22, sollevata da Codex e accolta.** Qui c'era
scritto «cinque strade, mutuamente esclusive», ed **era falso**: l'albero qui
sopra prescrive lui stesso delle combinazioni (`B2 → B7`, `B5 + B6`), le
condizioni possono verificarsi **insieme**, e B9 è dichiarato spedibile
comunque. Tre punti che si annullavano a vicenda.

⇒ **Cosa dice davvero l'albero.** I rami **non** sono alternative che si
escludono: nominano **quale blocco va PER PRIMO**, perché è l'ordine che B0
decide, non l'insieme. Il budget per frame che B0 misura si spartisce fra le
fasi, e quella spartizione ordina i blocchi per **quanti millisecondi possiede
ciascuno**.

```
B0 NON produce un vincitore.
B0 produce un ELENCO ORDINATO di blocchi, ognuno col suo falsificatore,
   più quelli che si possono chiudere subito perché non possiedono niente.
```

⭐ **E B9 sta fuori dall'ordinamento**: non compete con gli altri, dichiara il
limite che resta *qualunque* leva vinca. Si spedisce comunque.

⛔ Resta vero l'unico punto per cui questa sezione esiste: **aprire un blocco
prima di B0 significa scommettere giorni sull'ordine sbagliato.** Non perché gli
altri siano preclusi, ma perché il primo costa il tempo che gli altri aspettano.


---

# 6 · I cancelli della 0.1.19

```
hardwareUnderruns == 0 sul corpus di qualificazione (⛔ il conteggio dell'HAL,
                       mai un'inferenza dal tempismo)
p95 di cancel a caldo  < 150 ms
TTFA corto             ≤ 500 ms, salvo RENDER_FIRST dichiarato
nessun crash, nessun OOM
nessun cancello di qualità vocale fallito
PSS di picco compatibile con la convivenza col motore di testo
⭐ il profilo REGISTRA il provider vero e la collocazione dei nodi
```

**Il corpus di prestazione**, minimo: una frase (~5 s) · tre frasi (~15 s) · la
lettura lunga da ~200 parole · punteggiatura, numeri e abbreviazioni · italiano
lungo · inglese lungo · voce incorporata · **voce arruolata dell'owner**.

**Il protocollo termico:** stessa banda di partenza dichiarata, ordine A/B
casualizzato, stesso stato di carica e di schermo, nessun modello locale in
esecuzione salvo quando si misura **proprio** la convivenza, e una corsa
finalista **sostenuta di 10 minuti**.

---

# 7 · ⛔ Cosa NON si fa

- **Niente buffer più grande.** Già misurato: 103 underrun col buffer originale,
  91 a 4×. Non era mai il collo.
- **Niente pipelining per frase.** Già misurato **peggiore**: 37 → 74 underrun,
  60 → 87 s, e `thermal=light` a metà lettura.
- **Niente `addQnn()`** prima che le forme siano fisse.
- **Niente modello INT8 scaricato e benedetto** senza catena di provenienza.
- **Niente riduzione della frequenza di campionamento** spacciata per una cura
  di calcolo: abbassare il PCM finale riduce la banda verso AudioTrack, non il
  calcolo autoregressivo che è **già avvenuto**.
- **Niente arena riaccesa globalmente** su sei sessioni.
- **Niente riga «XNNPACK»** senza la prova di collocazione dei nodi.
- **Niente RTF medio come numero di testata.** Il titolo è **Q4**.
- ⛔ **Niente cura senza il suo falsificatore**, scritto prima di implementarla.

---

# 8 · Il numero di versione

**0.1.19**, non «0.1.18 v2».

La v0.1.18 esiste già come **artefatto firmato e pubblicato**. Riusare il numero
significherebbe due binari diversi con lo stesso nome, e chi scarica non
saprebbe quale ha. Il CHANGELOG apre una sezione nuova.

---

# 9 · Le fonti

```
TALOS-RICERCHE\2026-08-22-talos-tts-stutter-root-cause-e-piano.md
    la ricerca commissionata, 1.845 righe, sha256 24b61a3e…
TALOS-RICERCHE\2026-08-22-talos-tts-stutter-brief-commissionato.md
    la domanda che le è stata fatta, sha256 94ba45d0…
TALOS-RICERCHE\2026-08-19-talos-personal-voice-engine-blueprint.md
    il blueprint dell'owner, 3.648 righe: i sette invarianti
.claude\RITORNO-0.1.18.md
    cosa ha fatto l'agente precedente, con le sue misure
```

⛔ Le ricerche stanno **fuori dal repo** e ci restano.

**Le fonti esterne che il piano cita, e che vanno riaperte prima di usarle:**
l'esportatore OpenMOSS al commit `cc7bdf19`, la pagina ONNX Runtime sui buffer
condivisi past/present, quella di XNNPACK, quella di QNN, quella di I/O
binding, e l'avviso Android sulla deprecazione di NNAPI dalla 15 — che è il
motivo per cui NNAPI resta al massimo una sonda, mai un'architettura.
