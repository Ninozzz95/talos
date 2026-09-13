# Provenienza del motore della PAROLA DI ATTIVAZIONE

> ⛔⛔ **Tre li abbiamo presi, UNO l'abbiamo addestrato noi** — e stanno tutti
> dentro un APK firmato da Antonino Rizzo.
>
> I tre presi valgono la disciplina di sempre: **niente binari nella repo**,
> scaricati e verificati a OGNI compilazione. Se domani qualcuno ripubblica un
> file diverso con lo stesso nome, la build si ferma qui.
>
> Il nostro — `talos.onnx` — **sta nel repo**, perché non esiste nessun posto da
> cui scaricarlo e senza di lui l'APK non ha la parola di attivazione. ⛔ Cambia
> DA DOVE arriva, non SE si verifica: peso e impronta si controllano identici.

## ⛔ Perché questo file ha sostituito `PROVENIENZA-VOCE.md`

Il motore precedente era **sherpa-onnx** col modello
`kws-zipformer-gigaspeech-3.3M`. Non era un'ipotesi sbagliata: era un modello
che **non funziona per questo compito**, e l'abbiamo scoperto misurando.

### La misura, sul Pad il 2026-08-14

Owner: «ho cercato di fare funzionare hey TALOS ma per qualche motivo non
parte». Strumentato invece che ipotizzato, e il servizio era **innocente su
tutta la linea**:

| controllo | esito |
| --- | --- |
| servizio vivo | ✅ `isForeground=true types=0x80` (microfono) |
| libreria caricata | ✅ `Load libsherpa-onnx-jni.so … ok` |
| modello aperto | ✅ config accettata, cinque asset `kws/` nell'APK |
| microfono preso | ✅ `AudioRecord inputSource 6, 16000 Hz` |
| ciclo partito | ✅ `TalosParola: in ascolto della parola` |
| interruttore sincero | ✅ «TALOS sta aspettando «hey TALOS»» |
| **attivazioni** | ❌ **cinque tentativi, zero** |

⭐ **Il controllo che ha chiuso il caso.** Ho aperto la **dettatura** di TALOS e
ho fatto parlare le stesse casse, alla stessa distanza e allo stesso volume: il
Pad ha scritto «trova prova Questa è una prova del microfono». ⇒ Il microfono
riceve benissimo. Lo stesso suono che Google trascrive, il nostro riconoscitore
non lo sente proprio.

⛔ E i token erano tutti validi (`▁HE`=49, `▁TA`=359, `LO`=120, `S`=3): non era
nemmeno un file di parole scartato in silenzio.

### E non siamo i primi

sherpa-onnx, [issue #2678](https://github.com/k2-fsa/sherpa-onnx/issues/2678),
ottobre 2025: col modello **cinese** oltre il **90%** di attivazioni, col
`kws-zipformer-gigaspeech` **inglese** — il nostro — **meno del 10%**. Aperta,
senza risposta.

⇒ La causa è **il modello**, non l'integrazione. Un riconoscitore a trasduttore
deve produrre acusticamente una sequenza di token BPE inglesi: «TALOS» detto da
un italiano non li produce.

## Come è fatto adesso: tre modelli in fila

È lo schema che usano i prodotti veri (Home Assistant), e ha una proprietà che
il trasduttore non aveva: **la parola non si scrive, si addestra**.

```
audio 80 ms (1280 campioni, 16 kHz)
   │
   ├─► melspectrogram.onnx     →  8 fotogrammi × 32 bande
   │      (finestra: ultimi 1760 campioni = 1280 + 3 salti da 160)
   │      (trasformazione: x/10 + 2)
   │
   ├─► embedding_model.onnx    →  1 vettore da 96, dagli ultimi 76 fotogrammi
   │      (Google `speech_embedding`, congelato)
   │
   └─► classificatore          →  1 punteggio, dagli ultimi 16 vettori (~2 s)
```

⛔ **I campioni entrano come int16 SCRITTI IN FLOAT, non normalizzati.** Il
modello mel è stato addestrato su valori nell'intervallo ±32768; dividerli per
32768 — che è quello che faceva il codice di sherpa, e che è l'istinto di
chiunque — dà uno spettro completamente diverso e nessuna attivazione, senza
nessun errore.

⛔ **I nomi dei tensori si leggono dalla sessione**, non si scrivono qui: i
modelli di openWakeWord chiamano l'ingresso del classificatore `x.1`, quelli
addestrati con `livekit-wakeword` lo chiamano `embeddings`. Leggerli a runtime
è ciò che permette di sostituire il classificatore senza toccare il codice.

## I file, e con che impronta

Fonte: [openWakeWord v0.5.1](https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1)
(dscripka, Apache-2.0). I due modelli di testa derivano da
[`google/speech_embedding/1`](https://tfhub.dev/google/speech_embedding/1),
pubblicato da Google in Apache-2.0.

| file nell'APK | byte | impronta SHA-256 |
| --- | --- | --- |
| `parola/melspectrogram.onnx` | 1087958 | `ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f` |
| `parola/embedding_model.onnx` | 1326578 | `70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f` |
| `parola/hey_jarvis.onnx` | 1271370 | `94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb` |

⛔ `hey_jarvis.onnx` resta scaricato e verificato anche se non è più la parola in
servizio: è il **banco di prova** con cui si distingue «il montaggio è rotto» da
«il nostro modello non sente». Toglierlo vuol dire perdere quel confronto il
giorno in cui servirà.

Base: `https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/`

| nome nell'APK | nome nel rilascio |
| --- | --- |
| `parola/hey_jarvis.onnx` | `hey_jarvis_v0.1.onnx` |

## ⭐⭐⭐ IL NOSTRO: `talos.onnx`, addestrato il 2026-08-15

### ⛔⛔ RIPULITO il 2026-08-15: dentro c'era il PC di chi l'ha addestrato

Preparando la repo alla pubblicazione, cercando dati personali fra i file
tracciati:

    Binary file mobile/android/app/src/main/parola/talos.onnx matches

Dentro il modello, cinque volte, il percorso completo della cartella di chi lo
ha addestrato — nome utente compreso (qui riscritto, per non rifare l'errore
mentre lo si racconta):

    C:\Users\<nome utente>\AppData\Local\Temp\...\parola-gpu\venv\...

Sono le `pkg.torch.onnx.stack_trace` che PyTorch incorpora nell'export per
aiutare chi fa debug. ⛔ E non e' un documento interno: e' un file che finisce
**dentro l'APK**, in mano a chiunque installi TALOS.

⇒ Tolte **260 annotazioni** `pkg.torch.onnx`. E la pulizia si e' pagata da
sola: **88.712 byte in meno** nell'APK.

⛔ La prova prima di sostituire: gli stessi otto file audio dati al modello
vecchio e al nuovo, differenza massima **0.000000000**. Non e' «sembra uguale»:
e' lo stesso identico modello, senza il nome di una persona dentro.

    977.654 byte  ea76e9c1...   <- prima
    888.942 byte  a9a997b2...   <- dopo


⛔ Questo **non si scarica**: l'abbiamo addestrato noi, non esiste nessun URL da
cui prenderlo, e senza di lui l'APK non ha la parola di attivazione. Sta nel
repo — l'unica eccezione alla regola «niente binari» in questa scheda — e il
cancello lo verifica **con la stessa severità** degli altri: peso e impronta.

| file nell'APK | sorgente nel repo | byte | impronta SHA-256 |
| --- | --- | --- | --- |
| `parola/talos.onnx` | `src/main/parola/talos.onnx` | 888942 | `a9a997b288814146dd6db8f10c0f7046e6c1d158c794b371544d62acde84d759` |

### Come è nato, coi numeri

Addestrato con [`livekit-wakeword`](https://github.com/livekit/livekit-wakeword)
(Apache-2.0) su una Radeon RX 9070 XT, **PyTorch ROCm su Windows**
(`torch 2.9.1+rocm7.2.1`, gfx1201) — senza WSL, che su questa macchina non
espone le librerie ROCm.

```
20.000 clip positive + 20.000 negative + 4.800 di sfondo (più i test)
generate  349,7 min      ← 5,8 ore, ed è il 90% del tempo
augment    10,3 min
train      37,1 min      100.000 passi, peso dei negativi 4.000
export      0,1 min
```

### ⛔ I due punti di lavoro, misurati — e nessuno è «100%»

```
soglia 0,50 →  Recall 88,2%   FPPH 0,53   AUT 0,0038
soglia 0,89 →  Recall 74,8%   FPPH 0,00   ← ottimale calcolata da `train`
```

Cioè: a 0,50 ti sente 88 volte su 100 ma si apre da sola circa **ogni due ore**;
a 0,89 non si apre **mai** da sola ma ti perde **una volta su quattro**.

⇒ Montata prima la **0,89**, poi **scesa a 0,50 il 2026-08-15**: in stanza
l'owner ha misurato **2 attivazioni su 10**, cioè un recall reale del ~20% dove
il laboratorio ne prometteva 74,8. La soglia alta era la causa più diretta.

⛔ Il prezzo è dichiarato: **FPPH 0,53**, una falsa apertura ogni due ore circa.
È un passo intermedio: le altre leve — guadagno adattivo prima del mel, VAD in
AND, e clip attenuate in addestramento (la libreria **non** varia il volume:
`AugmentationConfig` ha solo rumore e riverbero) — servono a riprendersi quei
falsi senza rialzare la soglia. Piano completo in
`docs/superpowers/research/2026-08-15-hey-talos-iper-preciso.md`.

⛔ E lo 0,5 di prima era un **prestito** da openWakeWord, non una misura: valeva
finché il classificatore era il loro.

### Se si riaddestra

La leva è il numero di campioni, e il collo è `generate`: **20,8 clip/minuto**
misurate (col lotto TTS a 50 — il lotto a 256 è più LENTO, 15,6). Raddoppiare i
campioni vuol dire un'altra notte.

## ⛔ Perché in casa c'era «hey jarvis» prima di «hey TALOS»

Perché **la catena si prova prima della parola**. Un classificatore già
addestrato e pubblicato è l'unico modo di sapere se il montaggio su Android è
giusto senza che un fallimento possa essere colpa del nostro addestramento. Se
«hey jarvis» scatta sul Pad, la catena è sana e resta solo da addestrare la
nostra parola; se non scatta, il guasto è qui e l'avremmo scoperto **prima** di
spendere una notte ad addestrare.

⇒ `hey_jarvis.onnx` era un **banco di prova**, non la funzione. Ha scattato sul
Pad, quindi la catena era sana — e il 2026-08-15 `talos.onnx` ne ha preso il
posto. ⛔ Resta scaricato: il giorno in cui la nostra parola non sentisse, è
l'unico modo di distinguere «il montaggio è rotto» da «il modello non sente».

## ⛔ Il conto, misurato — e COSTA, non guadagna

Una versione precedente di questa scheda diceva che l'APK sarebbe calato. Era
**falso**, e scritto prima di misurare. I numeri veri, dagli APK compilati:

| | prima (sherpa) | adesso (ONNX) |
| --- | --- | --- |
| libreria nativa, estratta | 23,6 MB | **30,6 MB** (`libonnxruntime.so`) |
| libreria nativa, nell'APK | 23,6 MB (non compressa) | 12,5 MB compressi |
| modelli | 5,50 MB | 3,51 MB |
| **APK intero** | **44,2 MB** | **56,7 MB** |

⇒ **+12,5 MB.** Il runtime ONNX generico porta tutti gli operatori e tutti i
motori d'esecuzione di Android, e noi ne usiamo una manciata.

### Come si recupera, quando varrà la pena

ONNX Runtime documenta la compilazione **minimale**: si estrae l'elenco degli
operatori usati dai nostri tre modelli e si costruisce una libreria che contiene
solo quelli. Chi lo fa riporta librerie da 3-5 MB — cioè meno di sherpa, non di
più.

⛔ Non si fa adesso, e la ragione è la stessa che ha ordinato tutto il resto:
**prima si prova che la parola funziona**. Ottimizzare un motore che potrebbe
ancora non andare bene è lavoro speso su un'ipotesi. E vale la regola
dell'owner: non si azzoppa l'app per far tornare un numero — se il numero e la
funzione litigano, si tiene la funzione e si alza il tetto.

## Licenza

openWakeWord è Apache-2.0 (David Scripka). `speech_embedding` è Apache-2.0
(Google). Il classificatore della nostra parola lo addestriamo noi con
[`livekit-wakeword`](https://github.com/livekit/livekit-wakeword), Apache-2.0.
