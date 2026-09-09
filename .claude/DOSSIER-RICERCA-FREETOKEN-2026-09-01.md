# FreeToken per TALOS desktop — review indipendente e decisione upstream

Data: 2026-09-01  
Perimetro: ricerca e decisione architetturale; nessuna installazione e nessun
cambio di codice prodotto.

## Esito

Decisione: **ADATTARE FreeToken dietro un adapter TALOS, come runtime MoE
NVIDIA opzionale; non adottarlo come runtime primario e non ricostruirlo
in-house.**

Prima di qualunque integrazione TALOS deve possedere un contratto runtime
provider-neutral e una prova end-to-end che confronti previsione e serving
reale. Catalogo, download, provenienza, policy, scelta del runtime, Doctor e UI
restano proprietà TALOS.

Non è autorizzata ora alcuna dipendenza FreeToken. Il runtime pubblico è beta,
la documentazione di installazione da sorgente dichiara Linux x86_64 con GPU
NVIDIA e CUDA 13, mentre l'esperienza Windows è mediata dalla Desktop app non
open source ed espone ancora problemi pubblici. Questo rende FreeToken un
candidato da laboratorio, non una base pronta per l'installer TALOS Windows.

## Metodo della review

Questa conclusione è stata formulata dal main agent dopo una verifica
indipendente, successiva al mining eseguito dall'agente parallelo. Sono stati
controllati direttamente:

- HEAD e tag remoti con `git ls-remote`;
- clone locale read-only dei due repository pubblici;
- sorgenti runtime, daemon, download HF, registry modelli, profiler e statistiche;
- licenza, dipendenze, test e workflow;
- paper ufficiale e issue tecniche correnti;
- unica schermata Desktop pubblica;
- implementazione reale TALOS desktop e riferimento mobile.

## Pin verificati

| Artefatto | Pin immutabile | Uso |
|---|---|---|
| FreeToken `main` | `e05cff83a04b322fc7823678aa2d05c826aad26c` | pin della ricerca |
| FreeToken `v0.1.2` | `9db1a39455a3fb107f3db83e381d10ceadfe5d99` | ultimo tag runtime osservato |
| FreeToken-Web `main` | `ef986d0c8b251880d94344ac8d5cbf0380ef09c5` | prova del perimetro pubblico Desktop |
| Desktop `v0.2.0-beta.15` | `b788700ddf6cf79bd358450c3f114037ec0b5fcf` | ultima release Desktop osservata |

Runtime top-level: Apache-2.0. Il repository Web non espone il sorgente della
Desktop app e non contiene una licenza top-level. Prima di redistribuire il
runtime sono obbligatori SBOM, inventario delle opere adattate, notices e
verifica delle licenze dei kernel vendorizzati. La presenza di
`nccl227.h` con rinvio a un `LICENSE.txt` non presente nel tree richiede due
diligence; non viene qui qualificata come violazione.

## Che cosa FreeToken è davvero

FreeToken è un serving engine edge-native specializzato in grandi modelli MoE.
Il valore tecnico principale è l'uso congiunto di GPU, RAM, CPU e PCIe, con:

- offload e co-esecuzione CPU/GPU;
- cache globale degli esperti e pool memoria ridimensionabili;
- formato FTW per il caricamento;
- misure di banda RAM e PCIe;
- daemon separato dal processo CUDA;
- API OpenAI, Responses e Anthropic;
- endpoint di salute, statistiche, richieste e cache.

Non è invece, nel repository aperto:

- un catalogo universale di Hugging Face;
- un sistema generale per CPU, Apple, AMD, Android e NVIDIA;
- una sorgente UI riutilizzabile;
- un download manager con provenienza TALOS;
- una raccomandazione hardware già affidabile su ogni macchina.

Il registry aperto contiene 22 identificatori di architettura. Il documento dei
modelli elenca famiglie note come funzionanti, ma il supporto GGUF è limitato e
non sostituisce il percorso llama.cpp di TALOS.

## Verifiche decisive sul codice upstream

### Download e sicurezza

`python/freetoken/utils/hf.py`:

- chiama `AutoConfig.from_pretrained(..., trust_remote_code=True)`;
- scarica `*.safetensors` con `snapshot_download`;
- non passa `revision` al download;
- disabilita il progresso con `DisabledTqdm`.

La documentazione Transformers avverte che `trust_remote_code=True` esegue
codice personalizzato e raccomanda un commit hash come `revision`. TALOS non
deve ereditare questo comportamento. Anche se FreeToken dichiara di leggere la
sola configurazione, il caricamento della classe di configurazione remota resta
un confine di esecuzione.

Decisione TALOS:

- mai remote code implicito;
- configurazioni lette come dati quando possibile;
- eventuale codice remoto solo con consenso esplicito, commit immutabile,
  allowlist e sandbox senza accesso libero a rete/processi/filesystem;
- download posseduto da TALOS, con revisione, hash, licenza e stato persistito.

### Profiling e raccomandazione

FreeToken misura GPU/UUID/VRAM, CPU e affinità, RAM disponibile, banda RAM,
PCIe H2D/D2H e memoria del processo. Queste misure sono migliori dell'attuale
snapshot desktop TALOS, che oggi copre RAM e storage ma non possiede un probe
GPU/PCIe equivalente.

Il verdetto sintetico non è però sufficiente: l'issue upstream #151 documenta
`hybrid` a 0,67 tok/s contro `offload` a 5,58 tok/s sullo stesso sistema, una
differenza di circa 8,3 volte. Una misura micro non può quindi diventare una
decisione finale senza prova di decode reale.

Decisione TALOS: ogni raccomandazione deve passare da tre livelli visibili:

1. `predetto`, con modello, versione e confidenza;
2. `misurato`, con TTFT/TPS/P95 e identità hardware/runtime;
3. `qualificato`, soltanto dopo confronto end-to-end fra candidati.

Se la prova reale smentisce la previsione, TALOS deve aggiornare la stessa riga,
scegliere il backend migliore e conservare l'evidenza del cambio.

### Lifecycle e telemetria

Il daemon torch-free è il pattern upstream più utile. Mantiene il control plane
fuori dal processo CUDA, possiede il child `ft serve`, espone stato/log/metriche
e può riadottare un engine sopravvissuto. Se FreeToken verrà integrato, TALOS
deve usare il daemon upstream direttamente attraverso un adapter, non copiarne
la logica.

`/v1/stats` espone modello, uptime, GPU, VRAM, pool KV/Mamba/SWA, throughput,
TTFT, P95, richieste e token cumulativi. Mancano ancora contatori live per hit
rate della expert cache, trasferimento PCIe e distribuzione VRAM/RAM; l'issue
#76 li richiede esplicitamente.

## Confronto con TALOS reale

| Area | FreeToken | TALOS oggi | Decisione one-up |
|---|---|---|---|
| Perimetro | MoE NVIDIA/CUDA 13 | runtime provider-neutral + llama.cpp/Ollama/LM Studio | FreeToken solo adapter opzionale |
| Catalogo | registry runtime e catalogo Desktop chiuso | ricerca HF GGUF reale | mantenere TALOS; aggiungere corsia “verificati su questo PC” |
| Provenienza | download senza pin applicativo | commit, SHA-256, licenza, manifest | non regredire mai |
| Download UX | runtime senza progresso | progresso, pausa, ripresa, annulla, verifica | mantenere TALOS |
| Hardware | GPU/UUID/VRAM, RAM e PCIe misurati | desktop RAM/storage; mobile più ricco | portare un probe desktop provider-neutral |
| Fit | cache geometry sofisticata ma fallibile | ledger GGUF e qualifica reale | fondere previsione + A/B reale, con confidenza |
| Telemetria | console runtime ricca | adapter/metriche esistenti, UI incompleta | normalizzare e mostrare prove, non numeri opachi |
| Lifecycle | daemon torch-free | supervisor e fasi typed | integrare il daemon solo nel suo adapter |
| Sicurezza HF | remote code implicito | allowlist, hash e fail-closed | TALOS resta autorevole |
| Portabilità | Linux/NVIDIA primario | Windows e più backend | non rendere FreeToken il default |
| UI | una Console pubblica; sorgente Desktop chiusa | Model Lab e grammatica TALOS | prendere la gerarchia, non il markup |

File TALOS verificati:

- `harness-ui/src/machine-capacity.mjs`
- `harness-ui/src/hf-hub-client.mjs`
- `harness-ui/src/local-model-store.mjs`
- `harness-ui/src/hf-model-transfer.mjs`
- `harness-ui/src/local-runtime-probe.mjs`
- `harness-ui/src/local-runtime-llama-server.mjs`
- `harness-ui/src/runtime-contract.mjs`
- `mobile/src/lib/models/fit.ts` (sola lettura)
- `mobile/src/services/deviceCapacity.ts` (sola lettura)
- `mobile/src/services/localEngine.ts` (sola lettura)

## Review visiva

L'unica schermata ufficiale auditabile è `assets/desktop-console.png`.

Punti forti visibili:

- sidebar stabile e gerarchia netta;
- stato API e modello sempre visibili;
- KPI operativi leggibili in un colpo d'occhio;
- risorse macchina persistenti nella sidebar;
- riga runtime con stato, TPS, richieste, TTFT, Chat e Stop;
- preset cache e slider collegati a quantità esplicite.

Limiti visibili o non verificabili:

- la provenienza di “Saved” non è spiegata;
- testo secondario e numeri tecnici sono molto densi;
- preset e slider sembrano autorevoli anche quando la raccomandazione può
  sbagliare;
- non sono pubblici screenshot di catalogo, dettaglio, download, errori,
  narrow window, focus e tastiera;
- il codice Desktop non è pubblico, quindi non si può certificare la lista
  modelli o riutilizzarne i componenti.

Il Model Lab TALOS attuale è più sicuro e più integrato nelle impostazioni, ma
è visivamente meno operativo: non offre ancora una console viva con GPU/VRAM,
TTFT/TPS, backend, cache e prova della raccomandazione.

### UI TALOS proposta

Senza copiare la GUI FreeToken, il desktop TALOS dovrebbe avere:

1. **Questo computer** — GPU, VRAM, RAM allocabile, storage, driver/runtime,
   ultimo rilevamento e stato Doctor.
2. **Modelli** — una card per famiglia, quantizzazioni raggruppate, stato locale,
   revisione, licenza e compatibilità.
3. **Perché va / non va** — ledger `osservato`, `stimato`, `policy`, confidenza e
   controproposta di contesto/quantizzazione/backend.
4. **Prova su questo PC** — benchmark breve, annullabile, che promuove una stima
   a misura reale.
5. **Runtime** — console normalizzata con stato, TTFT, prefill/decode TPS, P95,
   RAM/VRAM, richieste e Stop.
6. **Confronto backend** — stessa macchina/modello/prompt; la raccomandazione
   cambia solo con evidenza persistita.

Ogni numero deve dichiarare fonte e momento della misura. Un KPI economico è
ammesso solo con tariffa, data, modello di confronto e metodologia visibili.

## Architettura proposta

```text
TALOS Model Lab / policy / Doctor
              |
              v
AVM Local Runtime Contract (autorevole e provider-neutral)
       |                      |
       v                      v
llama.cpp adapter       FreeToken adapter opzionale
                              |
                              v
                    daemon FreeToken upstream
```

Il contratto TALOS dovrà coprire almeno:

- identità e capability runtime;
- snapshot hardware con provenienza;
- compatibilità dichiarata/ispezionata/qualificata;
- previsione fit e confidenza;
- risultato di qualifica reale;
- lifecycle e recovery;
- telemetria normalizzata;
- cancellazione/stop;
- versione, pin e salute dell'upstream.

I wire format OpenAI/Anthropic di FreeToken restano dietro l'adapter; non
diventano il modello dominio TALOS.

## Sequenza tecnica proposta

### FT-0 — contratto e caratterizzazione

- caratterizzare llama.cpp e i contratti runtime esistenti;
- definire il contratto provider-neutral senza cambiare la UI;
- fixture di conformità e fallback quando una metrica non esiste.

### FT-1 — hardware evidence desktop

- GPU ID/UUID/nome/VRAM/driver;
- RAM realmente allocabile e storage;
- banda RAM e PCIe come benchmark esplicito, mai al boot invisibile;
- dati termici soltanto dove Windows espone una fonte affidabile;
- snapshot persistito e invalidato al cambio hardware/driver/runtime.

### FT-2 — fit + qualifica

- previsione con confidenza;
- benchmark breve sul modello reale;
- confronto di almeno due backend quando applicabile;
- TTFT, prefill/decode TPS, P95, RAM/VRAM;
- contromisura automatica se la previsione è smentita.

### FT-3 — pilot FreeToken isolato

- checkout esatto `e05cff83a04b322fc7823678aa2d05c826aad26c`;
- ambiente/sidecar isolato e senza remote code implicito;
- SBOM, hash, licenze, health e rollback;
- hardware NVIDIA autorizzato;
- confronto reale con llama.cpp;
- nessun packaging nell'installer finché i gate non sono verdi.

### FT-4 — console runtime TALOS

- UI alimentata soltanto da dati reali del contratto;
- stati loading, ready, degraded, incompatible, offline e benchmark;
- prove visive 1440×900, 1280×800 e 1024×800;
- tastiera, reload, riduzione movimento, errori e persistenza.

## Gate bloccanti prima dell'adozione

1. installazione riproducibile offline dagli stessi artefatti;
2. SBOM e licenze complete;
3. nessun `trust_remote_code` non sandboxato;
4. revisione HF immutabile e checksum;
5. health/loading/error osservabili;
6. stop/cancel e recovery del daemon;
7. collisione porte e processo orfano coperti;
8. confronto recommendation/serving reale;
9. crash, OOM e restart senza loop;
10. prova OpenAI/Responses/Anthropic, tool call e reasoning;
11. test Windows realistico o dichiarazione Linux/WSL esplicita;
12. parità senza regressioni di catalogo/download TALOS.

## Decisione finale per componente

| Componente | Decisione |
|---|---|
| Engine MoE FreeToken | **ADAPT**, opzionale e isolato |
| Daemon FreeToken | **ADOPT DIRECTLY** solo dentro l'adapter FreeToken |
| Profiler RAM/PCIe | **ADAPT** come metodologia e contratto di evidenza |
| Registry architetture | **NON usare come catalogo TALOS**; solo capability dell'adapter |
| Download HF FreeToken | **REJECT**; usare il download manager TALOS |
| `trust_remote_code=True` | **REJECT** per il percorso standard |
| Raccomandazione `auto` | **REJECT come verità**; richiede A/B reale |
| Desktop UI FreeToken | **REFERENCE ONLY**; sorgente non auditabile |
| Catalogo, fit, policy, Doctor, UI | **IN-HOUSE TALOS** |

## Fonti primarie

- https://github.com/FlashML-org/FreeToken/tree/e05cff83a04b322fc7823678aa2d05c826aad26c
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/README.md
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/docs/install.md
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/docs/models.md
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/docs/cli.md
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/python/freetoken/daemon/README.md
- https://github.com/FlashML-org/FreeToken/blob/e05cff83a04b322fc7823678aa2d05c826aad26c/python/freetoken/utils/hf.py
- https://github.com/FlashML-org/FreeToken/issues/76
- https://github.com/FlashML-org/FreeToken/issues/151
- https://github.com/FlashML-org/FreeToken/issues/237
- https://github.com/FlashML-org/FreeToken/issues/290
- https://github.com/FlashML-org/FreeToken-Web/releases/tag/v0.2.0-beta.15
- https://arxiv.org/abs/2608.16157
- https://huggingface.co/docs/transformers/models
- https://huggingface.co/docs/huggingface_hub/guides/download

