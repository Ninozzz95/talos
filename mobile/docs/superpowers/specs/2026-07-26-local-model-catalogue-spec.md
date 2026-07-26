# Centro modelli locali — specifica tecnica

**Stato:** specifica aperta il 2026-07-26, prima dell'implementazione. Chiusa
quando la fase spedisce.

**Brief dell'owner:** un centro download unificato che raccoglie modelli LLM
scaricabili localmente da più fonti, li raccomanda in base all'hardware reale,
consente l'esecuzione diretta sul dispositivo e integra il flusso di domande già
usato per guidare le scelte.

**Riferimento indicato dall'owner:** *Cookbook* di Odysseus (PewDiePie, 2026) —
scansiona GPU/CPU/RAM, assegna un punteggio a 270+ modelli di HuggingFace e
raccomanda i quantizzati che entrano nell'hardware. Odysseus però gira su un PC,
dove la scheda video è quella oggi ed è quella fra un mese. **Un telefono no**, e
tutto l'one-up di questo documento nasce da lì.

---

## 0. Decisioni chiuse (VINCOLANTI)

| # | Decisione |
|---|---|
| **M1** | Motore **doppio**: plugin nativo llama.cpp (pavimento: funziona sul 100% dei dispositivi) **+ WebGPU** dove disponibile (acceleratore). |
| **M2** | Scoperta hardware **completa e continua**, con **benchmark misurato** dopo il primo avvio di ogni modello. |
| **M3** | Catalogo **remoto firmato**, aggiornato semi-realtime senza pubblicare una nuova versione, **+ ricerca libera su HuggingFace**. |
| **M4** | In throttling TALOS **avvisa e propone**, non decide da solo. |
| **M5** | Un modello locale è un **provider normale**: Model Lab e composer, accanto a GPT/Claude/Gemini. |
| **M6** | I tool vanno ai modelli locali **solo se il catalogo dichiara il supporto**; altrimenti TALOS lo dice (coerente con D20). |
| **M7** | Download: **Wi-Fi di default**, ripristinabile, hash verificato, **più un centro gestione spazio e download completo**. |
| **M8** | Il profilo hardware e i benchmark **non lasciano il dispositivo**. La condivisione anonima opzionale (**M8b**) è progettata come giuntura, non costruita ora. |

Ereditate: **D0** l'app sarà distribuita → nessun elenco statico nell'APK
(regola generale, non solo qui). **D22** interfaccia in inglese.

---

## 1. Ambito e non-obiettivi

**Nell'ambito:** catalogo, raccomandazione, download, gestione spazio,
esecuzione on-device, integrazione come provider, flusso guidato.

**Fuori ambito (dichiarato, non dimenticato):**
- Fine-tuning o addestramento sul dispositivo.
- Modelli vision/audio locali — la struttura li prevede (`modalities`), la prima
  fase spedisce solo testo.
- Ollama di rete: **esiste già** come provider e resta separato. È un modello che
  gira su un *altro* computer; questo documento parla di modelli che girano
  **su questo telefono**. Nell'interfaccia i due non vanno confusi.

---

## 2. Architettura del catalogo

### 2.1 Le tre sorgenti

```
┌─ catalogo TALOS (remoto, firmato) ──── la vetrina verificata
├─ ricerca HuggingFace (live) ────────── l'universo GGUF
└─ importazione manuale (URL / file) ─── lo smanettone e l'offline
```

### 2.2 Il documento di catalogo

Servito da remoto, **firmato**, con cache locale e ripiego onesto. È dato non
fidato finché la firma non è verificata: un elenco scaricato è rete, e la rete
non decide cosa gira sul telefono di nessuno.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-07-26T10:00:00Z",
  "signature": "…",            // verificata PRIMA dell'uso
  "models": [{
    "id": "gemma-3n-e4b-q4",
    "family": "gemma-3n",
    "display_name": "Gemma 3n E4B",
    "publisher": "Google",
    "license": "gemma-terms",
    "params_b": 4.0,
    "quantization": "Q4_K_M",
    "file_bytes": 3_100_000_000,
    "sha256": "…",
    "download": { "kind": "huggingface", "repo": "…", "file": "…" },
    "runtime": ["llamacpp", "webgpu"],
    "context_tokens": 32768,
    "modalities": ["text"],
    "capabilities": { "tools": true, "thinking": false, "vision": false },
    "ram_working_bytes": 3_600_000_000,   // include KV cache a contesto tipico
    "reference_speed": [                   // misure di riferimento, non promesse
      { "soc": "sm8650", "engine": "llamacpp", "tokens_per_second": 11.4 }
    ],
    "tags": ["mobile-first", "recommended"],
    "added_at": "2026-06-01T00:00:00Z",
    "popularity": 0.87
  }]
}
```

`ram_working_bytes` è deliberatamente distinto da `file_bytes`: il file su disco
non è la memoria che serve a generare. È l'errore che fa scaricare 3 GB per
scoprire che il modello non parte.

### 2.3 Aggiornamento

- Controllo all'avvio, **al massimo una volta al giorno**, con `ETag`.
- Fallisce in silenzio: si usa la cache e l'interfaccia dichiara *"catalogo
  aggiornato al …"*.
- Alla prima installazione, prima di qualunque rete, un catalogo minimo
  **incluso** con 3-4 modelli sicuri, così il centro non è mai vuoto. È
  l'unica eccezione ammessa a D0, ed è un ripiego, non la fonte.

---

## 3. Scoperta hardware

Plugin nativo `TalosDeviceCapability` — lo stesso che serve al motore, quindi
non è codice in più.

### 3.1 Statici (letti una volta, invalidati all'aggiornamento di sistema)

| Dato | Fonte |
|---|---|
| RAM totale | `ActivityManager.MemoryInfo.totalMem` |
| core CPU / architettura | `Runtime.availableProcessors()`, `Build.SUPPORTED_ABIS` |
| SoC | `Build.SOC_MANUFACTURER` / `Build.SOC_MODEL` (API 31+), ripiego `Build.HARDWARE` |
| GPU | stringa renderer OpenGL ES |
| storage totale/libero | `StatFs` |
| WebGPU | interrogato nella WebView |
| versione Android | `Build.VERSION` |

### 3.2 Vivi (è la parte che Cookbook non ha)

| Dato | Fonte | Perché conta |
|---|---|---|
| RAM disponibile | `MemoryInfo.availMem` + `lowMemory` | è quella vera, non la nominale |
| **stato termico** | `PowerManager.getCurrentThermalStatus()` **+ `OnThermalStatusChangedListener`** | il calore è il primo limite di un LLM su telefono, prima della RAM |
| batteria e carica | `BatteryManager` | a batteria bassa il sistema limita le frequenze |
| rete | tipo di connessione | 3 GB su rete mobile è una scelta, non un dettaglio |

La callback termica è il cuore di M4: TALOS **viene avvisato** quando il
telefono si scalda, non lo scopre dal cronometro.

### 3.3 Benchmark misurato (M2)

Al primo avvio di ogni modello, una generazione breve e fissa, a schermo acceso
e con lo stato registrato:

```
{ model_id, engine, tokens_per_second, first_token_ms,
  thermal_at_start, battery, timestamp }
```

Da lì le raccomandazioni per **quel** modello su **quel** telefono non usano più
stime: usano una misura. È *"riprodurre prima di dichiarare"* applicato
all'hardware. Il benchmark si può saltare, e allora si resta sulla stima
dichiarandolo.

---

## 4. Algoritmo di matching

Non una tabella RAM→modello: una funzione su (modello × stato del dispositivo,
adesso).

### 4.1 Fattibilità — cancelli netti, prima del punteggio

```
headroom = availMem − ram_working_bytes − RISERVA_SISTEMA (≈ 700 MB)

BLOCKED    se file_bytes > storage libero − 1 GB
BLOCKED    se ram_working_bytes > totalMem × 0.55
BLOCKED    se nessun runtime del modello è supportato dal dispositivo
MARGINAL   se headroom < 300 MB          → gira, ma il sistema può ucciderlo
OK         altrimenti
```

Il fattore `0.55` di RAM totale non è un numero tondo: Android riserva memoria al
sistema e uccide i processi sotto pressione. Un modello che entra "al pelo"
viene terminato la prima volta che arriva una notifica.

### 4.2 Punteggio (solo su `OK` e `MARGINAL`)

```
score = 0.35 · qualità        (elo/benchmark normalizzati dal catalogo)
      + 0.30 · velocità        (MISURATA se esiste, altrimenti stimata dal SoC)
      + 0.15 · margine         (quanta aria resta)
      + 0.10 · aderenza        (capability richieste: tool, contesto, lingua)
      + 0.10 · freschezza      (età del modello)

penalità: −0.20 se stimato e non misurato   (l'incertezza si dichiara)
          −0.15 se MARGINAL
          −0.10 se il download supera 2 GB in assenza di Wi-Fi
```

**Ogni punteggio mostra il suo motivo in una riga leggibile**, mai un numero
nudo: *"3,1 GB — entra nei tuoi 12 GB con margine · ~11 token/s misurati sul tuo
telefono · supporta i tool"*. Un punteggio senza spiegazione è un oracolo, e gli
oracoli non si possono contestare.

### 4.3 Ri-valutazione

Ricalcolo su: cambio di stato termico, batteria sotto il 20%, `lowMemory`,
cambio rete, nuovo benchmark, nuovo catalogo. La prima pagina **cambia**
davvero — è il senso di "dinamico".

---

## 5. Motore di esecuzione (M1)

```
        ┌──────────── TalosLocalModelEngine (TS) ────────────┐
        │  stessa interfaccia adapter degli altri 6 provider │
        └───────────────┬───────────────────┬────────────────┘
                        │                   │
              plugin nativo llama.cpp   WebGPU in WebView
              (pavimento: sempre)       (dove disponibile)
                        └────────┬──────────┘
                     l'arbitro è il BENCHMARK:
              si usa il motore più veloce PER QUEL modello
              SU QUESTO telefono, non una regola generale
```

Il doppio motore ha un costo dichiarato — due implementazioni, due superfici di
bug — e un guadagno preciso: il nativo garantisce che **nessun utente resti
fuori** (WebGPU manca su ~25% dei telefoni), WebGPU dà la velocità dove c'è. Il
benchmark risolve la domanda "quale dei due?" con una misura invece che con una
congettura.

**Da verificare prima di implementare** (nessuna riga di codice senza questo):
binding llama.cpp per Android e peso reale sull'APK; se un LLM completo in
WebGPU regge dentro una WebView Android (la sonda ha provato solo gli embedding);
gestione della memoria di `wllama` (carica dai buffer, mentre WebLLM porta tutto
il modello in memoria JS — su un telefono è la differenza fra funzionare e no).

---

## 6. Centro download e gestione spazio (M7)

Una schermata sola, che risponde a "quanto occupa TALOS e perché".

- **Coda**: più download, in ordine, **ripristinabili** dopo la chiusura
  dell'app o la perdita di rete.
- **Wi-Fi di default**; rete mobile solo con consenso esplicito e la dimensione
  scritta a lettere chiare.
- **Hash verificato** a fine download. 3 GB corrotti che non partono sono la
  peggiore esperienza possibile, e senza verifica non c'è modo di distinguerli
  da un modello incompatibile.
- **Ripresa** su interruzione (`Range`).
- **Elenco degli occupanti**: ogni modello con la sua dimensione, l'ultimo uso e
  l'eliminazione a un tocco. Include la cache dei modelli di embedding, così il
  numero corrisponde a quello che Android mostra nelle impostazioni.
- **Avviso preventivo** se lo spazio dopo il download scenderebbe sotto 1,5 GB.
- Pulizia automatica: **non** in questa fase (M7 sceglie la prima opzione).
  L'app propone, non cancella ciò che l'utente ha aspettato mezz'ora.

---

## 7. Albero decisionale utente

Il flusso guidato che il brief chiede, con la stessa forma delle domande che
l'owner usa con me: poche, decisive, con una raccomandazione dichiarata.

```
[Scoperta hardware — automatica, nessuna domanda]
                    │
        ┌───────────┴───────────┐
   nessun modello          almeno uno OK
   fattibile                    │
        │                       ▼
        ▼            Q1. "A cosa ti serve un modello locale?"
  Schermo onesto:      ├── Privacy: niente esce dal telefono
  "il tuo telefono     ├── Offline: funzionare senza rete
   ha N GB: puoi       ├── Costo: non pagare i token
   fare X, non Y.      └── Curiosità / prova
   Per il resto,               │
   usa il cloud."              ▼
                     Q2. "Cosa conta di più?"
                       ├── Qualità delle risposte  → pesa qualità
                       ├── Velocità                → pesa velocità
                       └── Occupare poco spazio    → pesa dimensione
                                   │
                                   ▼
                     Q3. (solo se rilevante)
                     "Ti serve che sappia usare i tool?"
                       └── sì → filtra capabilities.tools
                                   │
                                   ▼
                  ► "Per il tuo telefono": 3 proposte
                     ordinate, ognuna col SUO motivo
                     e un "perché non le altre"
                                   │
                        ┌──────────┴──────────┐
                   Scarica            "Mostrami tutto"
                        │                     │
                        ▼                     ▼
              benchmark al 1° avvio    Catalogo completo
              → misura reale           filtri: nuovi · più usati ·
              → punteggi aggiornati    dimensione · capacità · licenza
```

Le tre domande si possono **saltare tutte**: chi sa cosa vuole va dritto al
catalogo. Un flusso guidato obbligatorio è un ostacolo travestito da aiuto.

---

## 8. Integrazione come provider (M5, M6)

- Il modello scaricato diventa il **settimo adapter**, accanto ai sei esistenti:
  stesso contratto, stesso streaming, stesso reasoning, stesse impostazioni.
- **Tool** solo se `capabilities.tools` è vero nel catalogo; altrimenti il
  modello non riceve gli schemi e TALOS lo dichiara nell'interfaccia — la stessa
  regola già decisa per i provider cloud (D20).
- Nessun ripiego automatico dal cloud al locale: cambierebbe la qualità delle
  risposte senza dirlo. Se un giorno si farà, sarà **con avviso**, come M4.
- Nel Model Lab i locali sono una sezione distinta, con l'indicazione dello
  spazio occupato e la velocità misurata.

---

## 9. Privacy (M8)

Il profilo hardware e i benchmark **restano sul dispositivo**. Non c'è telemetria
e non c'è un servizio da fidarsi.

**M8b — giuntura prevista, non costruita.** L'owner ha giudicato interessante la
condivisione anonima opzionale (`SoC → token/s`) per far sapere a chi ha un
telefono simile cosa aspettarsi *prima* di scaricare 3 GB. Perché sia possibile
domani senza riscrivere nulla, oggi si rispettano due vincoli:

1. il record di benchmark contiene **solo** modello di SoC, id del modello,
   motore, token/s, stato termico — **nessun** identificativo di dispositivo,
   installazione o utente;
2. la lettura dei benchmark passa da un'unica funzione, così aggiungere una
   sorgente remota è un ramo in un posto solo.

Resterebbe comunque **spento di default e opt-in esplicito**, e richiede un
servizio da ospitare: è una decisione di prodotto, non un interruttore.

---

## 10. Criteri di accettazione

**Catalogo**
1. Un catalogo con firma non valida viene **rifiutato**, e l'app usa la cache
   precedente dichiarandone la data.
2. Senza rete al primissimo avvio il centro mostra i modelli inclusi, non una
   pagina vuota né un errore.
3. Un modello aggiunto al catalogo remoto compare **senza aggiornare l'app**.

**Matching**
4. Su un telefono da 4 GB nessun modello da 3 B risulta `OK`.
5. Ogni scheda mostra la riga del motivo; nessun punteggio nudo.
6. Portando il dispositivo in throttling l'ordine cambia, e l'interfaccia dice
   perché.
7. Dopo il benchmark, la velocità mostrata è quella **misurata** ed è etichettata
   come tale.

**Esecuzione**
8. Su un dispositivo senza WebGPU il modello gira comunque (motore nativo).
9. Dove entrambi i motori sono disponibili viene scelto quello misurato più
   veloce, e la scelta è ispezionabile.
10. In throttling durante una generazione compare la proposta di M4; la
    generazione **non** viene interrotta da sola.

**Download**
11. Un download interrotto riprende, non ricomincia.
12. Un file con hash sbagliato viene rifiutato e cancellato, con messaggio
    esplicito.
13. Il totale mostrato nel centro corrisponde a quello che Android riporta per
    l'app, ±5%.

**Integrazione**
14. Un modello locale è selezionabile dal composer come qualunque altro.
15. Un modello senza supporto tool non riceve gli schemi, e l'interfaccia lo
    dichiara.

**Privacy**
16. Nessuna richiesta di rete contiene profilo hardware o benchmark. Verificato
    con un test che intercetta il traffico.

---

## 11. Fasi

| Fase | Contenuto |
|---|---|
| **M-1** | Plugin `TalosDeviceCapability` + scoperta + schermata "cosa può fare il tuo telefono". Nessun download: si può spedire da solo e serve già a qualcosa. |
| **M-2** | Catalogo remoto firmato + cache + ricerca HuggingFace + centro download e gestione spazio. |
| **M-3** | Motore nativo llama.cpp + esecuzione + benchmark + adapter provider. |
| **M-4** | Motore WebGPU + arbitraggio per misura. |
| **M-5** | Flusso guidato + punteggio con motivi + reazione al throttling. |

L'ordine è deliberato: M-1 e M-2 danno un centro download utile **prima** che
esista il motore, e ogni fase si spedisce da sola.

---

## 12. Checkpoint di ricerca web

| Data | Query | Fonti | Impatto |
|---|---|---|---|
| 2026-07-26 | runtime LLM on-device Android 2026 | Cactus compare, PolyEngineInfer, meetprajapati, Grokipedia | MediaPipe LLM API **deprecata** → LiteRT-LM; llama.cpp è il runtime più flessibile e con l'universo GGUF; 1-3 B realistici sui telefoni; **il calore è il limite** |
| 2026-07-26 | modelli piccoli 2026, RAM e quantizzazione | tinyweights, promptquorum, localaimaster, tokencalculator | Gemma 3 1B ~720 MB · Qwen3 1.7B ~1,1 GB · Llama 3.2 3B ~2,2 GB · Phi-4 Mini ~2,7 GB · **Gemma 3n E4B ~3 GB, costruito per telefoni**; velocità 10→45 t/s |
| 2026-07-26 | WebLLM / wllama / WebGPU in WebView | arxiv 2412.15803, mlc-ai/web-llm, localaimaster | ~80% della velocità nativa; WebGPU su ~70-75% dei telefoni; **wllama più parsimonioso di WebLLM**, che carica tutto il modello in memoria JS |
| 2026-07-26 | Odysseus / Cookbook | mindstudio, modelfit, odysseusai.dev | Cookbook: scansiona hardware, punteggia 270+ modelli HF, raccomanda. **Su PC**: nessuna nozione di calore o batteria → è esattamente lì il nostro one-up |
| 2026-07-26 | API termiche Android | developer.android.com/games/optimize/adpf/thermal, NDK thermal | `getCurrentThermalStatus()` **e la callback** `OnThermalStatusChangedListener` → la reattività di M4 è reale, non un sondaggio a intervalli |

**Da fare prima di M-3**: binding llama.cpp per Android e costo sull'APK; LLM
completo in WebGPU dentro una WebView Android; formato e distribuzione della
firma del catalogo.
