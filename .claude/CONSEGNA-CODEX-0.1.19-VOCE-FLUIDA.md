# CONSEGNA per CODEX — 0.1.19, la voce che sta al passo

> Il piano. Le regole di lavoro, il ramo, l'albero e i confini stanno in
> `.claude/PROMPT-CODEX-0.1.19.md`: **leggi quello per primo.**
>
> ⛔ Qui dentro: cosa è già verificato contro il nostro codice, cosa non lo è, i
> blocchi in ordine di guadagno per costo, e **il numero che ucciderebbe
> ognuno**.
>
> ⛔ **Solo il blocco B0 è autorizzato.** Gli altri li apre l'owner quando B0
> avrà detto quale.

---

# 0 · Il fatto che apre tutto — una contraddizione dentro il NOSTRO file

Nello stesso file — `mobile/android/app/src/main/java/ai/talos/voice/TalosVoiceHost.kt`
— due commenti **misurati**, scritti lo stesso giorno, si contraddicono.

**Il primo** (`resolveFrameBudget`, riga 480 e seguenti) fa il conto della
pipeline a batch=8:

```
codec da solo, batch=8      RTF 0,204     (misurato)
generazione TTS da sola     RTF 0,53-0,69 (misurato in Fase 1)
serializzati, come girano   RTF 0,73-0,89
                            «comfortably under 1.0 with real margin»
```

**Il secondo** (`driveStreamingSynthesis`, riga 292 e seguenti):

```
lettura lunga, sul tablet   RTF sostenuto ~1,5
                            leadSeconds fisso a 0,000 dal primo batch in poi
                            un underrun hardware quasi a ogni giro
```

## ⭐⭐⭐ Il buco NON SPIEGATO è più grande del deficit

Il motore produce **12,5 frame audio al secondo**, quindi un frame vale **80 ms
di audio** — ed è il budget di calcolo per restare in tempo reale.

```
il modello scritto nel nostro file predice   58-71 ms di calcolo per frame
il dispositivo misura                       120 ms
                                            ─────────────────────────────
non attribuito a NIENTE                      49-62 ms per frame

quanto serve recuperare per arrivare a RTF 1,00   40 ms per frame
```

⇒ **C'è più tempo non spiegato di quanto ne serva per curare il difetto.** Non
manca una cura: manca una **misura**. Nessuno strumento in questo repo, oggi, sa
dire dove vanno quei 50 ms.

## Perché le due misure possono essere entrambe vere

Lo 0,53-0,69 è stato misurato su un'utterance **corta** — 66 frame, 5.280 ms di
audio, 2.779 ms di calcolo. L'1,5 su una lettura **lunga**.

Se il costo per frame del nucleo autoregressivo **cresce con la lunghezza già
generata**, le due misure descrivono frame diversi dello stesso motore e sono
tutte e due giuste. È esattamente la forma che l'owner ha sentito a orecchio:
«meno stutter all'inizio, molti di più verso la metà».

⛔ Ed è **un'ipotesi**, non un fatto, finché non è misurata la pendenza. B0
esiste per questo.

---

# 1 · Cosa è VERIFICATO — alla fonte, non per sentito dire

La ricerca commissionata
(`TALOS-RICERCHE\2026-08-22-talos-tts-stutter-root-cause-e-piano.md`) porta otto
rilievi. **Sono stati riaperti uno per uno contro il nostro codice** prima di
finire qui. Ci sono tutti, e questi sono i punti esatti.

| # | il rilievo | dove sta, da noi |
|---|---|---|
| **V-01** | la KV **cresce** e viene ricopiata a ogni frame | `TalosMossRuntime.kt:288-297` — l'intero `OrtSession.Result` precedente viene rifornito come `past`, chiuso, e sostituito dal nuovo `present`. ⭐ **Confermato alla fonte**: l'esportatore OpenMOSS al commit `cc7bdf19` fa `torch.cat([past_key, key], dim=1)` in **entrambi** i transformer, e dichiara `present_key_{i}: {1: "total_seq"}` fra gli assi dinamici |
| **V-02** | buffer di heap ⇒ una copia diretta a ogni tensore | `TalosMossRuntime.kt:282, 283, 319, 320, 321` — cinque `IntBuffer.wrap`/`FloatBuffer.wrap` **dentro** il ciclo dei frame |
| **V-03** | la maschera di ripetizione **ricostruita da zero** ogni frame | `TalosMossRuntime.kt:309-314` — un `IntArray(nVq * 1024)` nuovo, più la camminata su `previousTokenSets: Array<HashSet<Int>>` (`:537`) |
| **V-04** | il codec **blocca** l'attore autoregressivo | `TalosVoiceHost.kt:378` — `onFrame` chiama `decodePending()` da **dentro** `generate` |
| **V-05** | **sei** sessioni ONNX aperte subito, ne servono quattro | `TalosMossRuntime.kt:46-51`, aperte tutte in `:411-432` |
| **V-06** | **un solo** `SessionOptions` per sei grafi diversi | `TalosMossRuntime.kt:387-413`, con `setCPUArenaAllocator(false)` su tutti |
| **V-07** | il log nel percorso caldo perturba la misura | `TalosVoiceHost.kt:367` — `Log.i` formattato **più** una lettura termica a ogni batch |
| **V-08** | `pending.removeAt(0)` sposta la coda a ogni giro | `TalosVoiceHost.kt:335` |

⛔ **Un numero della ricerca NON è nostro:** l'INT8 di comunità che dichiara RTF
0,60 → 0,36. Sono misure di terzi su un altro chip. Giustificano una
riproduzione controllata, non una promessa.

⛔ **E una via è chiusa, verificata:** non esiste un execution provider OpenCL
generale in ONNX Runtime paragonabile al backend OpenCL di llama.cpp. Sono due
runtime con kernel diversi: **un grafo ONNX non si può puntare a quel backend.**
Non riaprirla.

---

# 2 · Cosa NON è verificato — il debito che B0 salda

⛔ Quattro cose sono **ignote**, e ognuna può rovesciare il piano.

1. **L'artefatto installato.** L'esportatore ha il `torch.cat`. Il modello sul
   tablet **non l'ha aperto nessuno**. Se il `.onnx` installato è già stato
   riscritto, V-01 è morto e l'analisi è vecchia.
2. **La pendenza.** Nessuno ha mai messo in grafico il tempo di `decode_step`
   contro la lunghezza della cache. Senza quella retta, «cresce con la lunghezza»
   resta una frase.
3. **L'RTF del solo nucleo su un testo LUNGO.** Lo 0,53-0,69 è di un'utterance
   corta. Il numero che serve non esiste.
4. **L'effetto dell'osservatore.** Il `Log.i` formattato e la lettura termica a
   ogni batch sono **dentro** il numero che stiamo ottimizzando. Nessuno ha mai
   confrontato diagnostica accesa contro spenta.

⇒ **Nessun blocco oltre B0 si apre prima che questi quattro abbiano una
risposta.** B0 costa ore; gli altri costano giorni o settimane; e B0 dice
**quale**.

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
(Q1/Q2/Q3/Q4) della lettura lunga. Una cura che migliora Q1 e lascia Q4 sopra il
budget **non ha curato niente di ciò che l'owner sente**.

---

# 4 · B0 — IL LABORATORIO CHE DICE LA VERITÀ ⭐ *l'unico autorizzato*

**Costa ore. Decide settimane.**

## B0.1 · La traccia per frame

Un record a dimensione fissa, accumulato in memoria e riversato **dopo** la
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

⛔ **Le cinque fasi devono sommare a `totalStepNs`** entro un errore dichiarato.
Se non tornano, la traccia sta misurando qualcos'altro: il resto è il vero
sospetto, e va **nominato**, non arrotondato.

## B0.2 · Le quattro corse

Stesso testo, stessa voce di riferimento, stesso seme, stessa banda termica di
partenza.

| corsa | cosa gira | a cosa risponde |
|---|---|---|
| **T0** | tutto: callback, codec, AudioTrack | riproduce il sintomo |
| **T1** | ⭐ solo il nucleo: `onFrame` vuoto, **niente codec, niente audio** | **l'RTF del solo autoregressivo su un testo lungo** — il numero che non esiste |
| **T2** | i frame di T1 **riprodotti** attraverso codec + AudioTrack | conferma il codec sulla stessa lunghezza |
| **T3** | profilo ONNX Runtime acceso, tempi **non confrontabili** | quale operatore, quale provider, e come cambia col crescere della cache |

⛔ **T3 non si confronta con T0-T2**: il profiler cambia i tempi. Serve per la
distribuzione degli operatori, non per la latenza.

⛔ **E una quinta, che è un controllo:** T0 con la diagnostica **spenta**. Se la
differenza è grande, il primo difetto da curare è lo strumento, non il motore.

## B0.3 · L'audit del grafo — costa dieci minuti

Il modello sta sul tablet, non sul disco del PC. Si tira giù e si guarda.

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

e si incrociano i `Concat` trovati coi nomi `past_*`/`present_*` del meta.

⛔ **L'artefatto vince sulla fonte.** Se quei `Concat` non ci sono, V-01 è morto
e B5 esce dal piano — ed è una **buona** notizia, non una sconfitta.

## Il cancello di B0

L'artefatto (un JSON, non il logcat) deve far rispondere a un lettore che non era
presente:

1. quale dei grafi ONNX domina il frame?
2. il tempo di `decode_step` **cresce** con la lunghezza della cache? con che pendenza?
3. quanto tempo sta **fuori** da `OrtSession.run()`?
4. quanto vale l'RTF del **solo** nucleo su un testo lungo?
5. quale pezzo della pipeline causa **ogni singolo** underrun?

## ⛔ La trappola di casa, nella sua forma di qui

Il registratore di traccia può funzionare benissimo dentro un test strumentato
**e non essere mai chiamato dal giro vero**. Allora tutta la settimana dopo si
decide su una traccia che descrive un percorso che nessuno usa.

⇒ Il test che vale parte da **`TalosVoiceHost.get(context)`** e legge la traccia
**dall'artefatto scritto dal giro di produzione**. Se qualcuno scollega il
registratore, quel test dev'essere l'**unico** a diventare rosso.

## Falsificatore di B0

Non ne ha, ed è il motivo per cui è il primo: B0 non propone una cura, **misura
la realtà**. Gli unici modi di sbagliarlo sono che la traccia non sommi, o che
non passi dalla porta vera.

---

# 5 · I blocchi successivi — ⛔ NON autorizzati, elencati perché B0 sceglie

**B1 · Sessioni per ruolo, e pigre.** Sei sessioni ONNX aperte a ogni risposta
parlata; ne servono quattro (la decodifica completa è il percorso *offline*, e
l'encoder serve solo all'arruolamento). E un `SessionOptions` unico per sei
carichi diversi, con l'arena della CPU spenta su tutti — cura giusta per un OOM
vero dell'arruolamento, applicata a **tutti e sei** perché non c'era altro posto
dove metterla. ⛔ Va **prima** di qualunque prova sull'arena: riaccenderla su sei
sessioni avide ricrea il crash.

**B2 · Il giro senza allocazioni.** Buffer diretti persistenti e tensori riusati
per ogni ingresso a forma fissa; maschera di ripetizione **incrementale**; mappe
dei feed costruite una volta; uscite a forma fissa fissate; `ArrayDeque` al posto
di `removeAt(0)`.
*Falsificatore:* se in B0 `prep + transizione KV + GC` sta sotto il 10% del
frame, questo non è la cura.

**B3 · XNNPACK, per grafo, con la prova di dove sono finiti i nodi.** È già dentro
`onnxruntime-android`, si accende da Java, non richiede conversione: è la sonda
di acceleratore più economica che esista. ⛔ Ha un **suo** pool di thread: senza
`setIntraOpNumThreads(1)` e `SEQUENTIAL` si misura una contesa, non un guadagno.
⛔⛔ **Una riga «XNNPACK» senza la prova di collocazione dei nodi non è un
risultato**: il profilo deve dire quanti nodi e quanto tempo ci sono finiti
davvero. *(Su questo stesso tablet la flash attention era **accesa** senza che
nessuno l'avesse scelta; spegnerla ha tolto 4,7-6,6 s al primo messaggio.)*
*Falsificatore, un'ora:* pochi nodi pesanti collocati, **o** RTF del solo nucleo
fermo, **o** p95 per passo peggiore ⇒ la corsia si chiude.

**B4 · L'attore del codec — continuo, NON per frase.**
⛔⛔ **Il pipelining per frase è già stato provato e reso indietro con una
misura**: 74 underrun invece di 37, 87 s invece di 60 s sullo stesso testo, e il
dispositivo a `thermal=light` a metà lettura. Il prefill in più per ogni frase
costa più di quanto risparmi. **Non si riprova.**
Questo è diverso: **una sola generazione, un solo prefill**, e il codec prende un
attore suo con una coda limitata.
*Falsificatore, severo:* se T1 dice che il **solo** nucleo sta già sopra 1,0,
questo blocco non può curare lo stutter — toglie una somma, non rende veloce un
motore lento.

**B5 · La KV a capacità fissa — la vera scommessa**, e solo se B0 misura la
pendenza. Oggi il costo cumulativo di ricopiare la cache è **O(T²)**; con una
cache di capacità fissa si scrive alla posizione e si legge fino alla lunghezza
valida, senza `Concat` di tutto il passato.
*Cancello:* a seme fisso i token dei frame **identici** all'export attuale.
*Falsificatore:* se il tempo di `decode_step` non cresce con la lunghezza, non è
il collo.

**B6 · INT8 riproducibile, con cancelli di QUALITÀ VOCALE.** ⛔ Non si scarica un
modello opaco e lo si benedice: si costruisce dai file ufficiali con uno script
versionato che verifica l'impronta della sorgente. ⭐ E il cancello non è la
velocità: per una **voce personale** la somiglianza al timbro è un cancello duro
— un modello più veloce che suona meno come l'owner ha risolto il problema
sbagliato.

**B7 · Giro ricorrente in nativo** — solo se B0/B2 mostrano che l'orchestrazione
Java/JNI resta significativa. ⛔ «Nativo è sempre più veloce» è falso: se i kernel
ONNX sono il 95% del frame, spostare l'orchestrazione non recupera niente.

**B8 · QNN / Hexagon** — un **progetto**, non questa release: pretende forme
fisse (quindi passa **tutto** per B5), modello quantizzato e ONNX Runtime
ricompilato con l'SDK Qualcomm.

**B9 · Il limite ONESTO** — e questo si spedisce comunque. Un buffer più grande
**non può** curare un RTF sopra 1: servirebbero `(RTF − 1) × durata` secondi di
riserva, cioè ~30 s su una lettura di 60 s a RTF 1,5 — che *è* una generazione
anticipata. ⇒ Tre politiche in base al profilo qualificato: streaming veloce
(p95 ≤ 0,85), streaming con riserva misurata (fino a 1,0), **generazione prima
della riproduzione** oltre 1,0. ⭐ È l'unico blocco che si può spedire anche se
tutto il resto fallisce: trasforma uno stutter in un'attesa dichiarata.

---

# 6 · L'albero delle decisioni — B0 lo risolve

```
il tempo di decode_step cresce forte con la lunghezza della cache
    → B5 è il lavoro principale, ed è lavoro sul MODELLO

il campionamento locale è costante ma > 40-50 ms per frame
    → B3/B6 sul modello locale vengono prima di B5

prep Java + transizione KV + GC oltre il 10-15%
    → B2 (e poi B7) prima di toccare qualunque grafo

il callback/codec aggiunge ~0,2 RTF e il nucleo sta sotto 1
    → B4 basta ad attraversare il confine del tempo reale

il nucleo da solo resta ≥ 1,2 dopo B2
    → nessuna pipeline lo salva: B5 + B6, oppure B9
```

⛔ **Cinque strade, mutuamente esclusive.** Sceglierne una prima di B0 significa
scommettere giorni su un lancio di dado.

---

# 7 · I cancelli della 0.1.19

```
underrun hardware == 0 sul corpus di qualificazione
                       (⛔ il conteggio dell'HAL, mai un'inferenza dal tempismo)
p95 di annullamento a caldo  < 150 ms
tempo al primo audio, corto  ≤ 500 ms, salvo modalità «genera prima» dichiarata
nessun crash, nessun OOM
nessun cancello di qualità vocale fallito
memoria di picco compatibile con la convivenza col motore di testo
⭐ il profilo REGISTRA il provider vero e la collocazione dei nodi
```

**Il corpus di prestazione**, minimo: una frase (~5 s) · tre frasi (~15 s) · la
lettura lunga da ~200 parole · punteggiatura, numeri e abbreviazioni · italiano
lungo · inglese lungo · voce incorporata · **voce arruolata dell'owner**.

**Il protocollo termico:** stessa banda di partenza **dichiarata**, ordine A/B
casualizzato, stesso stato di carica e di schermo, nessun modello locale in
esecuzione salvo quando si misura **proprio** la convivenza, e una corsa
finalista **sostenuta di 10 minuti**.

---

# 8 · ⛔ Cosa NON si fa

- **Niente buffer più grande.** Già misurato: 103 underrun col buffer originale,
  91 a 4×. Non era mai il collo.
- **Niente pipelining per frase.** Già misurato **peggiore**: 37 → 74 underrun,
  60 → 87 s, e surriscaldamento a metà lettura.
- **Niente execution provider Qualcomm** prima che le forme siano fisse.
- **Niente OpenCL via ONNX Runtime**: non esiste, verificato.
- **Niente modello INT8 scaricato e benedetto** senza catena di provenienza.
- **Niente riduzione della frequenza di campionamento** spacciata per una cura di
  calcolo: abbassare il PCM finale riduce la banda verso l'uscita audio, non il
  calcolo autoregressivo che è **già avvenuto**.
- **Niente arena riaccesa globalmente** su sei sessioni.
- **Niente RTF medio come numero di testata.** Il titolo è **Q4**.
- ⛔ **Niente cura senza il suo falsificatore**, scritto prima di implementarla.

---

# 9 · Il numero di versione

**0.1.19**, non «0.1.18 v2»: la v0.1.18 esiste già come artefatto firmato e
pubblicato, e riusare il numero significherebbe due binari diversi con lo stesso
nome.

⛔ **Il `CHANGELOG.md` non lo scrivi tu**: lo aggiorna l'owner al rilascio, ed è
un file condiviso con l'altro agente.
