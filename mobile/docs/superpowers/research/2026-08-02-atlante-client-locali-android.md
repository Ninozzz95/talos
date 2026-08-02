# Atlante — i sottovalutati e i piccoli: client locali e agenti su Android

**Data:** 2 agosto 2026 · **Perimetro:** app di chat/agente su Android e client locali che *non* sono i grandi
consumer (Claude, ChatGPT, Gemini, Perplexity, Grok) e *non* sono le piattaforme di orchestrazione già coperte
nel cluster Paperclip. **Vincolo del verificatore avversariale onorato:** nessuna cifra di seconda mano.

---

## 0. Premessa metodologica — leggere prima del resto

**Il file `2026-08-02-atlante-parte-1-inventario.md` non esiste su disco** al momento in cui scrivo (verificato con
`ls` sulla cartella `docs/superpowers/research/`). Ho quindi perimetrato *per esclusione*: ho lasciato fuori i cinque
grandi consumer e le piattaforme di orchestrazione cloud (Lindy, Lyzr, MetaGPT, ChatDev, Gemini Enterprise, ADK for
Android) che risultano già coperte da `2026-08-02-atlante-paperclip-completamento.json`. Se la parte 1 coprirà anche
PocketPal o AnythingLLM, quelle due schede saranno un doppione — nessun'altra lo sarà.

**Il budget di ricerca web della sessione era esaurito.** Ho lavorato interamente per fetch diretto su URL canonici:
API GitHub, feed Atom delle release, `raw.githubusercontent.com`, pagine F-Droid, endpoint pubblico di ricerca di
Apple (`itunes.apple.com/search`), pagine di documentazione ufficiale. Paradossalmente questo ha *migliorato* la
qualità: tutto ciò che segue è di prima mano per costruzione, non perché ho scartato i riassunti — non ne ho letti.

**Trappola trovata e da ricordare.** Il rendering HTML delle pagine `github.com/<repo>/releases` attraverso il
fetcher ha sistematicamente **sbagliato l'anno di un'unità**: ChatterUI risultava fermo a luglio 2025 (quindi
"abbandonato"), Maid a marzo 2025, SmolChat a giugno 2025. Interrogando `api.github.com/repos/.../releases` le stesse
release risultano **2026-07-14, 2026-03-10, 2026-06-21**. Tre prodotti sarebbero stati dichiarati morti per un errore
di parsing. **Regola operativa: per le date usare solo l'API o il feed Atom, mai la pagina HTML.**

**Cosa non sono riuscito ad aprire, e che quindi resta «non confermato»** (mai dedotto): il sito di Layla
(`layla-network.ai`) è una SPA JavaScript e restituisce solo il `<title>`; le pagine dettaglio del Play Store
tornano lo scheletro dell'app; la KB di Brave (403); il file LICENSE di MLC-LLM. Dove serviva un dato da quelle
fonti, l'ho scritto «non confermato» e ho detto perché.

---

## 1. Il quadro in una riga

Il tier "piccolo" **non è più piccolo**, e soprattutto **non è più solo chat**. Tre app su F-Droid — Agora, Kai 9000
e un fork di un agente di terze parti — hanno già spedito quello che noi chiamiamo *piattaforma agentica*: loop multi-turno di
tool calling, sandbox Linux via PRoot, MCP, memoria persistente, esecuzione schedulata in background con foreground
service, e in un caso **permessi Shizuku e un AccessibilityService dichiarati in manifest**. Non è un roadmap altrui:
è già installabile oggi. Il vantaggio che ci resta non è "faremo le cose che loro non fanno" — è *come* le facciamo:
verificabilità, onestà del modello di prova, e la disciplina end-to-end. Ma va detto chiaramente, perché è il punto
dell'esercizio.

---

## 2. I client on-device puri — chi corre il modello sul telefono

### 2.1 LM Playground — il concorrente diretto che nessuno cita

**Vivo, e corre.** MIT, Kotlin, `pushed_at` **2026-07-22**, 121 stelle, 40 fork, non archiviato
(`api.github.com/repos/andriydruk/LMPlayground`). Release verificate via API: **1.8.0 il 2026-06-29**, 1.7.1 il
2026-06-06, 1.7.0 il 2026-06-02, 1.6.1 il 2026-05-30, 1.6.0 il 2026-05-18
(`api.github.com/repos/andriydruk/LMPlayground/releases`). Cadenza: cinque release in sei settimane.

**Motore:** llama.cpp, GGUF, prevalentemente Q4_K_M, con **kernel KleidiAI e OpenMP** dichiarati nel README per
arm64; la 1.8.0 ha abilitato **il backend Vulkan** e aggiornato llama.cpp a **b9621** (per confronto: noi siamo
pinnati a b10218, quindi siamo *avanti* sul motore). La 1.6.1 ha introdotto il caricamento **memory-mapped** per i
modelli che non entrano interamente in RAM, «instead of failing to start»; la 1.6.0 ha introdotto la **selezione a
runtime della variante CPU** (`raw.githubusercontent.com/andriydruk/LMPlayground/main/README.md`, e i corpi delle
release via API). Nessuna NPU dichiarata.

**Funzioni — qui fa male.** La 1.7.0 ha spedito **web search, page fetch ed esecuzione JavaScript come tool
chiamabili dal modello**, «off by default», attivabili per-modello in *Settings → Tools*; la 1.8.0 ha aggiunto la
**visione** (foto da galleria o fotocamera su Gemma 4/3, Qwen 3.5, Ministral 3); il README documenta **Document Q&A
su PDF, Word, EPUB, HTML, Markdown e testo con ricerca semantica on-device tramite EmbeddingGemma**. In più: download
in background affidabili via OkHttp + WorkManager, e — dettaglio che conta — la 1.7.0 ha introdotto **notifiche di
generazione live con conteggio token**, che è l'impronta di una generazione che continua fuori dallo schermo. Il
provider di ricerca web e la sandbox JavaScript **non sono nominati nel README: «non confermato»**.

**Licenza e distribuzione:** MIT, **Google Play**, nessuna chiave API richiesta, tutto offline. Toolchain di build
dichiarata: NDK 27.2.12479018 + CMake 3.31.6 — *identica alla nostra*.

**Cosa fa meglio di noi:** ha già in mano la terna *tool + RAG documentale on-device + visione* dentro un motore
locale, su Play Store, in un'app da 121 stelle che nessuno nomina nei confronti. E ha risolto due problemi che noi
abbiamo davanti: il fallback memory-mapped quando il modello non entra in RAM, e la selezione della variante CPU a
runtime.

### 2.2 PocketPal AI — il più grande del tier, e il suo buco è il nostro varco

**Vivo e centrale.** MIT, `pushed_at` **2026-08-01**, 7 751 stelle; ultima release **v1.16.1 del 2026-07-07**
(`api.github.com/repos/a-ghorbani/pocketpal-ai`, `/releases`). Motore: **llama.cpp via il bridge React Native
`llama.rn` (v0.12.4), solo GGUF**; il README rivendica CPU/GPU/NPU — Metal su iOS, **OpenCL su Adreno** per Android,
**Hexagon Qualcomm** con degradazione graduale e offload parziale dei layer; la v1.14.1 ha spedito esplicitamente
l'ottimizzazione Adreno. Nessuna menzione propria di i8mm/dotprod/KleidiAI: eredita ciò che fa llama.cpp,
**«non confermato» come feature dichiarata**.

**Funzioni:** ha **tool calling** — le "Talents" (calcolatrice, data/ora, rendering HTML) più i «structured assistant
turns for tool calling» della v1.15.0; TTS on-device via Kokoro (ONNX) e, dalla v1.16.0, Supertonic a 31 lingue;
**benchmark on-device con leaderboard** (tok/s e memoria); integrazione Hugging Face con token per i repo gated e
deep link; personas ("Pals") e **PalsHub, un marketplace con checkout in-app reale** (v1.15.2 su iOS US, v1.16.1 su
Android). **Niente RAG, niente ricerca web, niente STT, niente visione, niente MCP** — MCP è una feature request
aperta (#527, aperta il 2026-01-13; un duplicato chiuso il 2026-07-23).

**Il buco, ed è enorme per noi:** la generazione **non sopravvive al backgrounding**. L'issue #135 *"[Bug]: Pocketpal
Stops Inferencing in Background"* è **aperta dall'11 dicembre 2024**, con l'utente che chiede «an Android Foreground
Service to at least finish the current response». L'unica cosa che hanno spedito in background è il *download*
(#127). Anche un server API locale OpenAI-compatibile (#707) è stato chiuso come duplicato, mai spedito.

**Licenza e distribuzione:** MIT, App Store (`id6502579498`) e Google Play (`com.pocketpalai`); **niente F-Droid,
niente APK diretto**. Il conteggio installazioni del Play è **non confermato** (pagina JS non apribile).

**Cosa fa meglio di noi:** la UX di scoperta e download dei modelli da Hugging Face, token per repo gated inclusi;
una leaderboard di benchmark vera; i default di modello guidati da regole per dispositivo con avvisi di limite di
contesto *e recupero*; e un marketplace con pagamenti — una superficie di monetizzazione che qui non ha nessun altro.

### 2.3 ChatterUI — il miglior ibrido locale+remoto, e non lo sapevamo

**Vivissimo** (era il candidato "morto" della trappola dell'anno). AGPL-3.0, TypeScript, `pushed_at`
**2026-07-21**, 2 629 stelle, 241 fork, non archiviato. Release via API: **v0.10.0-beta3 il 2026-07-14**, beta2 il
2026-07-09, beta1 il 2026-06-23, v0.9.0 stabile il 2026-04-24, e 0.8.9-beta10 il 2026-04-05 con «Added Gemma 4
compatibility… Fixed loading **mtmd** models» — cioè **multimodalità llama.cpp già presente**, cosa che il README non
dice (`api.github.com/repos/Vali-98/ChatterUI/releases`).

**Motore:** llama.cpp via adattatore React Native proprio, **`cui-llama.rn`**. Il README dà l'unica indicazione di
estensioni ARM esplicita di tutto il cluster: «For devices with Snapdragon 8 Gen 1 and above or Exynos 2200+…
**Q4_0 quantization is recommended for optimized performance**» — cioè il repacking online di llama.cpp verso i
kernel i8mm/dotprod. Generazione in background: **non confermato**.

**Funzioni:** Character Card v2, chat multiple per personaggio, sampler e instruct formatting a grana fine, TTS di
sistema, **Author Notes con profondità di iniezione configurabile**, Character Links (carica user card + sampler +
formatting insieme al personaggio), «thinking budget» in local mode, tempi di prompt/generazione mostrati nella
bolla, i18n. Remoti supportati: koboldcpp, text-generation-webui, Ollama, OpenAI, Claude (via proxy), Cohere,
OpenRouter, Mancer, AI Horde, più template API custom. **Niente tool, niente RAG, niente ricerca web.**

**Licenza e distribuzione:** AGPL-3.0, **solo APK dalle release GitHub** — niente Play, niente F-Droid; iOS assente
«due to lacking iOS hardware for development».

**Cosa fa meglio di noi:** la grana fine sul *controllo della conversazione*. Author Notes a profondità configurabile,
Character Links, thinking budget, tempi in bolla — sono la maturità di chi viene dal mondo SillyTavern. Nessuna nostra
superficie è così configurabile senza diventare illeggibile. Da studiare come *ergonomia*, non come feature list.

### 2.4 Maid — riscritto, vivo, ma con 5 mesi senza tag

**Vivo:** MIT, `pushed_at` **2026-07-23**, 2 616 stelle. Ma l'ultima release taggata è **v3.0.0 del 2026-03-10**
(verificata via API — la pagina HTML diceva 2025), che portò «vision model Support, system text to speech support,
system speech recognition support, reasoning support, markdown rendering». **Il linguaggio del repo è oggi
TypeScript e il README dice React Native**: Maid è stato **riscritto da Flutter/Dart a React Native** e ha **perso il
desktop** (la v1.2.9 aveva aggiunto macOS; oggi il README dice "Android exclusively"). Il pacchetto F-Droid
`com.danemadsen.maid` è fermo a **2.0.4 del 2025-04-05**: la versione F-Droid è la vecchia app Flutter, non questa.

**Motore:** llama.cpp locale (GGUF) + remoti Anthropic, DeepSeek, Mistral, Novita, Ollama, OpenAI. **Funzioni:**
download in un tap da un catalogo Hugging Face curato, GGUF custom, export/import JSON, TTS via app compagna
*Maise*, sync opzionale via **Supabase**, Material You, «no telemetry, no ads». **Niente tool, niente RAG, niente
ricerca web, niente generazione in background** dichiarati. Distribuzione: Play Store + release GitHub.

**Cosa fa meglio di noi:** poco, oggi. L'unica idea che vale è la **sync opzionale via Supabase** in un'app
altrimenti locale: hanno separato "locale per default" da "sincronizzabile se vuoi" senza costruirsi un backend.

### 2.5 Layla — l'unico che ha già gli agenti *e* la generazione di immagini, offline

**Vivo e a pagamento pieno.** iOS: **v7.0.5 pubblicata il 2026-07-23**, venditore *Layla Network Pty Ltd*,
**$19,99**, iOS 17.6+, 1,4 GB (endpoint pubblico Apple `itunes.apple.com/search`, e la scheda
`apps.apple.com/us/app/layla/id6456886656`). Esiste anche una seconda app **"Layla (Cloud)" v7.0.0 del 2026-07-15,
gratuita** — cioè hanno biforcato la linea locale da quella cloud. Android: **presente sul Play Store come
`com.layla`, sviluppatore "Layla Network.AI", €22,99, 10K+ installazioni, 4,5 stelle su 524 recensioni** (dati letti
dalla pagina di ricerca del Play Store; la scheda dettaglio non è apribile, quindi *data di aggiornamento e versione
Android sono «non confermate»*; le installazioni sono il bucket grezzo di Google, non un numero).

**Motore:** llama.cpp (con Metal su Apple) + **Stable Diffusion locale**. Richiede **8 GB di RAM** e scarica un
modello da **4 GB al primo avvio** (descrizione App Store, fonte primaria).

**Funzioni, ed è la lista più lunga del cluster:** memoria a lungo termine con richiamo strutturato, embeddings,
riassunti e **knowledge graph**; **oltre 100 voci**, TTS, **clonazione vocale via PocketTTS**, STT; VLM per la
visione; **generazione immagini con Stable Diffusion e upscaling**; personaggi multipli, chat di gruppo; e —
il punto — **agenti programmabili in Python con trigger multipli**, più un sistema di plugin. Tutto offline.

**Licenza e distribuzione:** **proprietaria**, closed source. App Store + Play Store, acquisto una tantum più IAP
(Monarch $4,99 / Birdwing $19,99 / Blue Morpho $29,99). Nessuna chiave API richiesta per il funzionamento locale.

**Cosa fa meglio di noi:** ha *già* agenti scriptabili con trigger su un telefono, e ha la multimodalità completa in
locale (immagini generate, non solo lette). E ha dimostrato che **si può vendere a €22,99 secco un'app locale** —
10 000+ installazioni a quel prezzo è un fatto commerciale, non un'opinione.

### 2.6 SmolChat — la reference implementation pulita

Apache-2.0 (confermato via API, non «non confermato» come riportato altrove), Kotlin, `pushed_at` **2026-06-21**,
873 stelle; ultima release **v16 del 2026-06-21**. llama.cpp via **binding JNI propri** (modulo `smollm`),
solo on-device. Funzioni: chat, gestione modelli GGUF, temperature/min-p, system prompt, **"tasks"** riusabili,
markdown con Markwon + Prism4j. **Niente RAG, niente tool, niente multimodalità.** La roadmap dichiarata è
istruttiva perché è la nostra al contrario: auto-naming delle chat, ricerca nei messaggi, **integrazione desktop via
Bluetooth/HTTP/WiFi**, portare dentro il RAG dal loro progetto *Android-Doc-QA*, ed **esplorare Vulkan**.
Distribuzione: Play Store + release GitHub + Obtainium; **non su F-Droid**.

**Cosa fa meglio di noi:** niente in funzionalità. Ma è il codice più pulito da leggere se serve capire come si
attacca llama.cpp a Kotlin con JNI senza passare da React Native.

### 2.7 Google AI Edge Gallery — il metro vero, non PocketPal

Apache-2.0, **24 332 stelle**, `pushed_at` **2026-07-31**, ultima release **1.0.16 del 2026-06-23** (API; il feed
Atom dà il 24 — differenza di fuso). Motore **LiteRT / LiteRT-LM**. È dove finisce l'hardware: **NPU Qualcomm per
Gemma3 1B dalla 1.0.12, con APK separati per chipset (sm8550, sm8650, sm8750, sm8850)**; **TPU Pixel e decodifica
speculativa** nella 1.0.14; **Multi-Token Prediction di Gemma 4** nella 1.0.13.

E soprattutto: **supporto sperimentale a MCP con «a user permission flow for MCP tool calls, ensuring users are
prompted for approval before the agent executes a tool»** (1.0.14), con system prompt che si adattano dinamicamente
ai tool MCP caricati (1.0.15); più **Agent Skills** (mappe e Wikipedia nella 1.0.11; creazione/lettura calendario,
notifiche schedulate con schermate di gestione nella 1.0.14), Ask Image, Audio Scribe, Prompt Lab, **Mobile
Actions**, e nella 1.0.16 l'import di modelli `litert-lm` arbitrari da Hugging Face. Distribuzione: **Play Store
(`com.google.ai.edge.gallery`), App Store (`id6749645337`), DMG macOS e APK GitHub** «for users without Google Play
access». Download degli asset della 1.0.16 dall'API GitHub: APK generico 6 709, sm8550 5 784, sm8850 4 200,
tensor-g5 992, sm8650 933, sm8750 852 — **sono solo i sideload da GitHub, non dicono nulla sulle installazioni Play,
che restano «non confermate»**. Si autodefinisce ancora «an experimental Beta release».

**Cosa fa meglio di noi:** l'accesso all'acceleratore che nessun terzo può avere, i binari per-chipset come strategia
di rilascio, e — il dettaglio più competitivo di tutto l'atlante — **la chiamata MCP con consenso esplicito per
invocazione**. Il nostro modello di autorizzazione tool va misurato contro *questo*, non contro PocketPal.

### 2.8 Private LLM ed Enclave AI — due lezioni commerciali dal lato iOS

**Private LLM** (Numen Technologies): **v1.9.15**, iOS 17.0+ e A12 Bionic o superiore, **$4,99 una tantum, nessun
IAP**, Family Sharing per sei (`apps.apple.com/us/app/private-llm-local-ai-chat/id6448106860`). La differenziazione è
**tutta sul quantizzatore**: usano **OmniQuant e GPTQ** e si posizionano esplicitamente contro «the RTN quantization
used by MLX and llama.cpp wrapper apps like Ollama and LM Studio» (`privatellm.app`) — cioè rivendicano *qualità* a
parità di bit, non velocità. Il runtime sottostante non è mai nominato: che non sia llama.cpp è una loro
affermazione, **non un fatto verificato**. Catalogo: «Browse 140+ local AI models», forte sugli abliterated.
**Rifiutano la ricerca web per principio** — «Absolutely not. Private LLM is dedicated to ensuring your privacy,
operating solely offline» — e non leggono documenti, quindi niente RAG, niente tool, niente MCP. Ma hanno
**App Intents per Siri/Shortcuts e `x-callback-url`**: il modello locale è invocabile *da altre app*. È la nostra
"seconda porta", fatta a livello di sistema operativo.

**Enclave AI**: proprietaria, iOS/macOS/iPad, motore e quantizzazioni **non dichiarati da nessuna parte: «non
confermato»**; modelli citati: Llama, Qwen, SmolLM, Gemma, distillati di DeepSeek R1. Voce on-device con «Apple's
on-device speech recognition and synthesis» (STT e TTS a costo modello zero), **document chat/RAG**, Shortcuts e
Siri, fallback cloud opzionale via OpenRouter. Il pezzo forte è il **modello commerciale**: Free Forever a $0 con
modelli locali illimitati, e **Pro a $9,99/mese che include $9,99 di crediti cloud al mese** per «GPT, Claude, Gemini,
DeepSeek and more» con «**No API keys or separate accounts needed**»; i crediti non si accumulano e quando finiscono
«Local AI keeps working as normal» (`enclaveai.app/pricing`). Hanno eliminato l'attrito numero uno delle app ibride —
l'utente non tocca mai una chiave — e **degradano al locale invece di fallire**. È il pattern esatto per la nostra
riga "cloud opzionale post-distribuzione".

### 2.9 MyDeviceAI — dormiente, ma con un'idea che vale

MIT, ma **ultimo commit 2026-03-22** e **ultima release v1.7_beta2 del 2025-12-22**: otto mesi senza rilasci, 81
stelle, l'APK dell'ultima release ha **147 download** (contatore dell'API GitHub). Motore non nominato — usa GGUF
(Qwen3 1.7B Q4 per la chat, BGE Small per gli embedding), quindi presumibilmente un binding llama.cpp, ma la libreria
è **«non confermata»**. Funzioni: **ricerca web via SearXNG self-hosted**, cronologia a 30 giorni, "Thinking Mode",
e la cosa interessante: **connessione WebRTC peer-to-peer verso i modelli sul proprio desktop**. Nessun tool, nessun
RAG documentale, nessuna voce.

**Cosa fa meglio di noi:** due idee, non l'esecuzione. Il **SearXNG self-hosted** è una storia di privacy sulla
ricerca più pulita di qualunque approccio a chiave API. E l'**offload WebRTC verso il proprio desktop** è una
risposta vera a "questo modello non ci sta nel telefono" che non passa da un cloud. A 147 download e otto mesi di
silenzio non è un concorrente: è un'idea da rubare.

---

## 3. Gli agenti che sono già arrivati dove vogliamo andare

Questa è la sezione che cambia il quadro. Tre app **su F-Droid**, tutte del 2026, hanno spedito la piattaforma
agentica su telefono.

### 3.1 Agora — il concorrente più diretto che TALOS abbia

**Nuovo e in corsa:** creato il **2026-02-21**, `pushed_at` **2026-07-30**, 192 stelle, 25 fork, Kotlin, **MIT**
(`api.github.com/repos/newo-ether/Agora`). Ultima release **v1.3.7 del 2026-06-22** su GitHub, **1.3.7 su F-Droid
datata 24 giugno 2026**, minimo Android 7.0 (`f-droid.org/en/packages/com.newoether.agora/`). Distribuito su
**F-Droid *e* Google Play *e* release GitHub** — la tripletta che noi consideriamo la nostra strategia.

**Motore:** llama.cpp via NDK/CMake per inferenza *ed embedding* on-device, più 8 provider incorporati (OpenAI,
Anthropic, Gemini, DeepSeek, Qwen/DashScope, OpenRouter, Ollama, Local GGUF) e provider custom illimitati, con
**più chiavi per provider con alias nominati** per la rotazione.

**Funzioni — leggere lentamente.** *Tool agentici*: **web search con DuckDuckGo Lite come default anonimo senza
chiave**, più Brave, Serper, Tavily e SearXNG; **esecuzione codice in una sandbox Alpine Linux via PRoot con accesso
ai file tramite SAF**, con il rootfs scaricato all'installazione e **verificato per checksum** (v1.3.3); generazione
immagini BYOK via `/v1/images/generations` renderizzata inline; **shell remota e I/O file** (exec, read, write, edit,
glob, grep) via il loro protocollo **Conch** con ECDH + AES-256-GCM + HMAC-SHA256, token bucket e anti-replay a
nonce; **memoria** attiva e file di memoria salvati; **ricerca semantica RAG su tutta la cronologia** con soglia di
similarità configurabile e modello di embedding selezionabile indipendente dal modello di chat. La v1.3.6 parla di
**19 tool call** con stato "doing" localizzato. *Dati*: export/import `.agora` di conversazioni, memorie, prompt,
impostazioni **e chiavi API**, con strategie Merge/Replace/Skip, **auto-backup periodico via WorkManager** con
ritenzione configurabile, e import dai formati di export di **Claude e ChatGPT**. *Chat*: database messaggi ad
albero con **branching non lineare**, modello e system prompt per-conversazione *e per-messaggio*, indicatore visivo
di rollout del contesto che sbiadisce i messaggi fuori finestra. Documentazione: **manuale utente di 24 pagine**,
tradotto in 8 lingue.

**Correzione importante a una lettura superficiale.** In giro si legge che Agora "ha MCP". **Falso, o almeno
impreciso.** Il README colloca la riga MCP sotto *Remote Device Control*: «**MCP integration** — Conch as a Claude
Desktop MCP server». Cioè il *backend* Conch di Agora si espone **come server MCP consumabile da Claude Desktop**.
Agora **non è documentata come client MCP**: il modello dentro l'app non parla MCP. La distinzione è esattamente il
tipo di cosa che il verificatore avversariale ci contesterebbe, quindi la fisso qui.

**Cosa fa meglio di noi:** la sandbox Alpine con PRoot e accesso SAF è più ambiziosa del nostro modello di esecuzione;
il default di ricerca anonimo senza chiave (DuckDuckGo Lite) elimina un attrito che noi ancora imponiamo; il
branching ad albero del database messaggi è una struttura dati che noi non abbiamo; e l'export unico `.agora`
che include **anche le chiavi** con avvisi di sicurezza è più completo del nostro export. Ha inoltre già risolto
l'import da Claude e ChatGPT — la porta d'ingresso per chi migra.

### 3.2 Kai 9000 — l'unico con MCP client *e* un daemon in background, verificato nel manifest

Apache-2.0, Kotlin Multiplatform, **1 127 stelle**, 150 fork, `pushed_at` **2026-08-02** (oggi), ultima release
**v2.9.0 del 2026-07-25**. Gira su **Android, iOS, Windows, macOS, Linux e Web**, distribuito su **F-Droid, Play
Store, App Store, Homebrew, AUR, Winget** e release GitHub. Si autodefinisce «OpenClaw alternative in your pocket».

**Motore on-device:** **LiteRT-LM** — `com.google.ai.edge.litertlm`, con `Engine`, `EngineConfig`, `SamplerConfig`
e, notare, **`OpenApiTool`**: il tool calling passa dal runtime locale, non solo dai provider cloud
(`composeApp/src/jvmShared/.../LiteRTInferenceEngine.kt`). Il manifest dichiara `libOpenCL.so` come
`uses-native-library` opzionale, quindi GPU. Il codice si preoccupa già del caso reale — il commento sul mutex di
init dice «the native load is not interruptible… without the lock, a follow-up ask would see state != READY and start
a second concurrent load of a multi-GB model».

**Il background è verificato, non dedotto.** Il manifest Android dichiara
`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` e due servizi con `android:foregroundServiceType="dataSync"`:
`DaemonService` e `ModelDownloadService`. La documentazione conferma: «Kai's daemon mode keeps the app running in the
background on Android so that scheduled tasks, heartbeat checks, and email polling continue to execute even when the
app is not in the foreground», e «Kai's service uses the `dataSync` foreground service type and `IMPORTANCE_LOW`
notification priority to minimize user disruption» (`kai9000.com/docs/features/daemon/`). L'**Heartbeat** è un prompt
silenzioso periodico durante le ore attive: intervallo configurabile fra 5 minuti e 4 ore, ore attive di default
8:00–22:00, scheduler che fa polling ogni 60 secondi, e su Android quando produce un report ad app in background
**scatta una notifica push** (`kai9000.com/docs/features/heartbeat/`).

**Funzioni:** memoria persistente con **promozione automatica nel system prompt dopo 5 hit**; "soul" (personalità
editabile); **29 provider LLM con failover automatico**; **client MCP vero** — «Connect to remote tool servers via
the Model Context Protocol»; oltre 40 tool fra ricerca web, email, **esecuzione shell**, task schedulati, calendario,
TTS, notifiche; storage cifrato; **UI generativa** — il modello produce schermate interattive (quiz, dashboard,
ricette) invece di solo testo; e una **sandbox Linux Alpine via PRoot da ~3 MB, senza root**, con installazione in un
tap di bash/curl/wget/git/jq/python3/pip/Node.js e un terminale interattivo affiancato.

**Il dettaglio da rubare subito.** Kai ha **due varianti di manifest**: la `foss` (F-Droid) dichiara `READ_SMS`,
`SEND_SMS`, `REQUEST_INSTALL_PACKAGES` e un `NotificationListenerService`; la variante Play **no**, e i commenti nel
manifest spiegano perché — «Play policy restricts READ_SMS and SEND_SMS to default SMS handlers»,
«REQUEST_INSTALL_PACKAGES to app stores, file managers and browsers»,
«BIND_NOTIFICATION_LISTENER_SERVICE to a narrow set of approved use cases» — e, cruciale, **la feature si auto-esclude
a runtime interrogando il manifest fuso**, così la variante Play «never shows the feature at all» invece di finire in
un vicolo cieco. È esattamente il modello *distribuzione-fuori-dal-Play-sblocca-capacità* della nostra
`distribution-off-play-store`, già implementato e con la degradazione onesta.

**Un fatto operativo che ci riguarda direttamente:** il manifest di Kai contiene
`<uses-permission android:name="android.permission.ACCESS_LOCAL_NETWORK"/>` col commento «Android 17+ blocks LAN
traffic for apps targeting SDK 37+ without this runtime permission; required to reach self-hosted servers (Jan,
Ollama, LM Studio, …)». Verificato su fonte primaria: Android 17 introduce `ACCESS_LOCAL_NETWORK` come **permesso a
runtime**, dentro il gruppo `NEARBY_DEVICES`, e «Beginning with Android 17, enforcement is mandatory for apps that
target Android 17 (API level 37) or higher» (`developer.android.com/about/versions/17/behavior-changes-17`).
**Se TALOS parla con Ollama/LM Studio in LAN, questo permesso va messo in roadmap.**

### 3.3 un agente di terze parti (Nous Research) e il fork Android — Shizuku e Accessibility, già in manifest

L'upstream `NousResearch/hermes-agent` è un agente **Python** con TUI, gateway verso Telegram/Discord/Slack/WhatsApp/
Signal, **creazione autonoma di skill** compatibili con lo standard `agentskills.io`, ricerca FTS5 sulle sessioni
passate, **cron scheduler**, **subagent isolati in parallelo**, e sette backend di terminale (locale, Docker, SSH,
Singularity, Modal, Daytona, Vercel Sandbox). Ha un comando `hermes claw migrate` — «Migrate from OpenClaw». Il
README documenta una via Termux e dichiara: «Hermes also has an **in-repo Android APK workstream** under `android/`».
Il file `android/README.md` fissa la matrice: **Chaquopy 17.0.0 + Python 3.11 embedded**, minSdk 24, targetSdk 35,
solo `arm64-v8a` e `x86_64`, APK universale firmato + AAB sulle release GitHub, **niente Play Store nel primo
rilascio**.

Su **F-Droid** c'è **un agente di terze parti Fork** (`com.mobilefork.hermesagent`), **MIT, versione 0.13.146 del 18 luglio
2026**, Android 7.0+, sorgente `github.com/adybag14-cyber/hermes-agent` — un fork di NousResearch (`fork: true`,
`parent: NousResearch/hermes-agent`, creato il 2026-03-21, `pushed_at` 2026-07-19, 142 stelle). La scheda F-Droid
descrive modelli locali **Gemma LiteRT-LM, Qwen GGUF, MiniCPM, VibeThinker**, dettatura vocale, allegati, download
riprendibili via DownloadManager, provider remoti opzionali, e **"tool bridge" nativi Android: file, browser, avvio
app, azioni UI assistite da accessibilità, notifiche, impostazioni, scorciatoie, widget e registrazioni di
automazione**, con **timeline dell'agente** che mostra «thinking, tool calls, results, file access, process logs, and
final answers».

**Ho verificato il manifest del fork, ed è il dato più pesante dell'intero atlante.** Dichiara:

```
<uses-permission android:name="moe.shizuku.manager.permission.API" />
<uses-permission android:name="moe.shizuku.manager.permission.API_V23" />
```

più un **AccessibilityService** registrato (`android.accessibilityservice.AccessibilityService` con
`hermes_accessibility_service`), `SYSTEM_ALERT_WINDOW`, `RECEIVE_BOOT_COMPLETED`, nove servizi di cui cinque
`foregroundServiceType="dataSync"` e uno `location`, receiver per `RUN_AUTOMATION` ed `EXTERNAL_TRIGGER`, e
**integrazione plugin Tasker/Locale** (`com.twofortyfouram.locale.intent.action.FIRE_SETTING` /
`QUERY_CONDITION` / `EDIT_SETTING` / `EDIT_CONDITION`).

**In chiaro: la nostra `android-agent-shizuku-vision` è già spedita da qualcun altro, su F-Droid, sotto MIT.**
L'uso effettivo di Shizuku nel codice **non l'ho potuto confermare** — la code search di GitHub non indicizza i fork
(`search/code?q=repo:adybag14-cyber/hermes-agent+Shizuku` torna `total_count: 0`), quindi ho solo la dichiarazione in
manifest, che è comunque una prova d'intento e di *compilazione*, non una supposizione.

**Cosa fa meglio di noi:** tutto ciò che riguarda l'agente come *processo*, non come chat — skill auto-generate,
cron, subagent paralleli, gateway multipiattaforma, e sul telefono i bridge nativi verso il sistema operativo più
l'aggancio a Tasker. La sua debolezza è il contrario della nostra: è un agente Python impacchettato in un APK, non
un'app Android progettata; la superficie utente è la timeline di un runner.

### 3.4 KoboldCpp — il metro di ampiezza, ma dentro Termux

AGPL-3.0, cadenza feroce: **koboldcpp-1.118.1 del 2026-08-02** (oggi), v1.118 dell'1 agosto, 1.117.1 del 10 luglio.
Su Android **non esiste APK**: si installa in Termux con `android_install.sh` e si usa da browser su
`localhost:5001`. Due limiti dichiarati dal loro README: «To make your build sharable and capable of working on other
devices, you must use `LLAMA_PORTABLE=1`» — che **disattiva le ottimizzazioni ARM specifiche** — e «GPU acceleration
for Termux may be possible but I have not explored it». Quindi su Android è **CPU-only e senza i8mm/dotprod**.

Ma la lista di funzioni è la più ampia di tutto l'atlante, in un singolo binario: **«MCP Server support and tool
calling»**, websearch, **RAG via TextDB**, riconoscimento immagini/vision, TTS (Qwen3TTS, Kokoro, OuteTTS, Parler,
Dia), generazione e editing immagini (SD 1.5, SDXL, SD3, Flux, Qwen Image, Z-Image, Klein), e compatibilità
multi-API (KoboldCppApi, OpenAiApi, OllamaApi). **È il benchmark di ampiezza funzionale da battere**, anche se
l'esperienza è una tab del browser sopra un terminale.

---

## 4. La plumbing: dove sta davvero l'hardware

### 4.1 Termux — vivo nei pacchetti, fermo nell'app, e rotto in background

L'app è **quasi ferma**: ultima stabile `v0.118.3` e beta `v0.119.0-beta.3`, **entrambe del 2025-05-22** — quattordici
mesi. Ma `termux-packages` ha commit **datati 2026-08-02**. Il dato che conta per noi: **`llama-cpp` è
apt-installabile e già compilato con i backend GPU accesi** — `TERMUX_PKG_VERSION "0.0.0-b10092"`, MIT, con
`-DGGML_BACKEND_DL=ON -DGGML_VULKAN=ON -DGGML_OPENCL=ON` (`termux-packages/packages/llama-cpp/build.sh`); esiste
anche un pacchetto `ollama` a `0.31.1`. Con `pkg install llama-cpp` un utente ha Vulkan e OpenCL **senza compilare
nulla**. (Nota di scala: b10092 contro il nostro pin b10218 — siamo leggermente avanti.)

**Il background di Termux non funziona come si racconta.** `termux-wake-lock` fa esattamente e solo quello che dice:
«Acquire the Termux wake lock to prevent the CPU from sleeping». Ma il README di Termux avverte testualmente:
«**Termux may be unstable on Android 12+. Android OS will kill any (phantom) processes greater than 32 (limit is for
all apps combined) and also kill any processes using excessive CPU.**» Un loop di decode llama.cpp *è* "excessive
CPU" per quella definizione. Quindi: il wake lock impedisce il sonno della CPU, ma il phantom-process killer di
Android 12+ colpisce **esattamente** il carico che vorremmo far girare. Il workaround adb comunemente citato
(`settings put global settings_enable_monitor_phantom_procs false`) è **«non confermato»** — non sono riuscito a
recuperare la fonte primaria. Distribuzione GPL-3.0-only su F-Droid + GitHub + un ramo Play "limited functionality",
con la nota operativa che APK di origini diverse sono firmati con chiavi diverse e **non convivono**.

### 4.2 Nexa AI **non esiste più**: è Qualcomm

**Il fatto più grosso della sezione.** `nexa.ai` fa **301 verso `aihub.qualcomm.com/genai`**, che dichiara
testualmente **«Nexa AI Is Now Part of Qualcomm AI Hub»**; `github.com/NexaAI/nexa-sdk` serve oggi
`github.com/qualcomm/GenieX`. Cadenza intensissima: **v0.3.18 del 2026-07-31**, preceduta nella stessa settimana da
rc.2, rc.1, alpha.6, alpha.5; fra le PR in volo si vedono `feat/logits-output` e **`feat/llama-cpp-speculative`**.
Si autodefinisce «the community version of Qualcomm GENIE», un «on-device Gen AI inference runtime for Qualcomm
devices».

**Doppio percorso, ed è la parte strategica:** (a) **llama.cpp** che consuma GGUF da Hugging Face e dispatcha su
**CPU / GPU / NPU Hexagon**; (b) **Qualcomm AI Engine Direct** che consuma bundle precompilati da AI Hub, **solo
NPU**. Target dichiarati: Snapdragon **8 Elite** e **8 Elite Gen 5**, più Windows/Linux ARM64. Su Android è un
**SDK Kotlin/Java distribuito come dipendenza Gradle**. Espone un server locale OpenAI-compatibile: «Point any OpenAI
client at `http://127.0.0.1:18181/v1` — no code changes». Licenza **BSD 3-Clause**, con il rider «Use of this project
is also subject to Qualcomm's Terms of Use». Function calling e MCP **non menzionati: «non confermato»**.

Non è un'app e non compete con noi come prodotto. Ma **il fornitore del silicio ora possiede un runtime Android
permissivo, installabile via Gradle, con superficie OpenAI-compatibile**: è più interessante come *componente* da
valutare che come rivale. Limite: è Qualcomm-only per costruzione.

### 4.3 MNN / MnnLlmChat, MLC, Local Dream, Cactus

**MNN (Alibaba)** — `3.6.1` del **2026-07-23**, con MNNChat Android 0.8.3 e un marketplace di modelli. Le loro note
di rilascio rivendicano un **backend NPU Hexagon a "2667 tok/s prefill"** e supporto Gemma4 omni-modale + Qwen3.5:
**è una rivendicazione del vendor nelle sue proprie release notes, non una misura indipendente**. È l'unico progetto
non posseduto da Qualcomm che spedisca inferenza LLM su NPU Hexagon, ed è sistematicamente sottovalutato in Occidente.

**MLC-LLM** — la libreria vive (**v0.20.0 del 2026-07-07**, commit fino al 2026-07-31), ma **v0.19.0 era del
2025-02-11**: diciassette mesi fra due tag, e i commit recenti inseguono il refactor delle API di TVM, non
funzionalità. L'app Android è peggio: la doc ufficiale offre ancora un APK demo «built for Samsung S23 with
Snapdragon 8 Gen 2» con data **26/09/2024**. La doc dice «MLC LLM needs an actual mobile GPU to meaningfully run at
an accelerated speed» ma **non dice mai se sia OpenCL o Vulkan: «non confermato»**; documenta invece un difetto
Adreno per cui i formati con suffisso `_1` causano «a ~20-50 seconds system UI freeze». Build che richiede Rust +
TVM + NDK + JDK 17, pesi in formato MLC proprietario (niente ecosistema GGUF). Licenza **«non confermata»** (non ho
aperto il LICENSE). **La tesi "GPU via compilatore" è valida; l'esecuzione su Android si è fermata.**

**Local Dream — non è un'app LLM.** È **solo Stable Diffusion**, confermato in README e note di rilascio; `v2.8.1`
del **2026-07-12**. Vale però come **prova che un'app consumer può spedire inferenza NPU Snapdragon vera via QNN e
sopravvivere sul Play Store**: «SD1.5 models are supported on Snapdragon NPUs with Hexagon V68 architecture or newer.
SDXL models are supported on Snapdragon 8 Gen 3 and newer devices». La v2.8.1 ha aggiunto **"Device link"**, cioè far
girare i modelli attraverso la rete locale — convergente col nostro pensiero architetturale. **Attenzione alla
licenza:** è **Creative Commons Attribution-NonCommercial 4.0**, «for NonCommercial purposes only» — non è una
licenza open source approvata OSI/FSF, quindi **non è idonea a F-Droid** e non è utilizzabile in derivati commerciali.

**Cactus** — 5 554 stelle, `pushed_at` **2026-07-31**, ultime release **v2.0 e v2.0.1 entrambe del 2026-07-09**.
**Non è un'app**: è «a hybrid edge-cloud AI engine for mobile devices & wearables» con binding Swift, Kotlin,
Flutter, React Native, Python, Rust e C++. Motore **completamente proprietario, non llama.cpp e non GGUF**: kernel
propri, un grafo di calcolo zero-copy e una «custom rotation-based quantization» che produce formati **CQ4 / CQ3.26 /
CQ2.54 / CQ2** — i modelli vanno convertiti, non si carica un GGUF. Ha **"Needle", un modello dedicato al tool
calling da 26 M di parametri**, auto-RAG, embeddings, STT (Parakeet-TDT-0.6B, Whisper large-v3) e **diarizzazione dei
parlanti**. Numeri dal loro README (rivendicazione primaria del vendor, non misura indipendente): Gemma-4-E2B-CQ4 a
1k di contesto — iPhone 17 Pro 729 tok/s prefill / 37 tok/s decode; iPhone 15 Pro 517/26; Mac M4 Pro 1963/101.
**La licenza è il vero rischio**: GitHub riporta `NOASSERTION` e il file LICENSE è una licenza *source-available*
custom, gratuita solo per individui, istruzione, no-profit e organizzazioni sotto **sia** 2 M$ di funding **sia** 2 M$
di ricavi annui, con **terminazione automatica** e 30 giorni per comprare una licenza commerciale al superamento di
una delle due soglie. **Inutilizzabile come dipendenza per qualcosa che un giorno potrebbe essere commerciale.**

---

## 5. I desktop che scendono sul telefono

**AnythingLLM è l'unico che ci corre davvero contro, ed è il più istruttivo.** MIT, 64 231 stelle; desktop/server a
**v1.15.0 "AnythingLLM Is Now An AI Agent Across Your OS" del 2026-06-25**. Il mobile vive in
`Mintplex-Labs/anythingllm-mobile` (MIT, `pushed_at` 2026-06-02) e **non ha nessuna release GitHub**: la
distribuzione è deliberatamente fuori — **Google Play *e* un APK universale dal loro CDN**
(`cdn.anythingllm.com/mobile/latest/anythingllm-universal.apk`, linkato da `anythingllm.com/mobile`). Il README dice
il motore per esteso: «**GGUF models locally on your phone using Cactus Compute (llama.cpp for React Native)**».
Android disponibile, iOS no. La doc rivendica un «small embedding model + local vector database on your device to
provide RAG capabilities **with citations**», tool agentici «like web search, web scraping, deep research»,
integrazione calendario/email, workspace e thread — **e dichiara il limite decisivo**: «To use custom agent tools,
MCPs or otherwise, you should use the sync feature with AnythingLLM Desktop or AnythingLLM Cloud… **Customization of
agent tools on mobile standalone is not yet supported**» (`docs.anythingllm.com/mobile/overview`). Cautela sulla
fonte: quella pagina contiene ancora prosa di scadenze vecchia («full release by the end of September 2025»), quindi
le *date* sono obsolete mentre le *capacità* sono la descrizione corrente del vendor. **Il varco: il loro telefono
diventa un thin client nel momento in cui servono tool veri.** E validano la nostra doppia distribuzione: Play + APK
proprio.

**Chatbox** — GPL-3.0 (Community Edition), 41 264 stelle; **v1.22.1 del 2026-07-28** con APK, e soprattutto
**v1.21.1 (2026-06-12) e v1.21.0 (2026-06-10) hanno spedito solo l'APK**: point release mobile-only, cioè il mobile è
un treno di rilascio di prima classe. Ma **non esegue nulla in locale**: raggiunge Ollama in rete. Il modello di
business è la parte interessante: le app sono gratis, e **MCP e knowledge base sono dietro il piano Pro a
$19,99/mese** ed erogati **come servizio ospitato** (`chatboxai.app/pricing.md`) — così il telefono non deve
eseguire niente.

**Cherry Studio** — AGPL-3.0, desktop a **v2.0.0-rc.3 del 2026-07-31**; il mobile è un repo separato
(`CherryHQ/cherry-studio-app`, AGPL-3.0, 3 633 stelle) che ha **commit datati 2026-08-02** ma la cui **ultima build
installabile è v0.1.7 del 2026-02-27** — cinque mesi. Expo React Native, **puro client remoto**, nessun motore
on-device nominato.

**Open WebUI** — 147 601 stelle, **v0.11.0 del 2026-07-27**. Sul telefono è **solo PWA**: «Responsive Design & PWA…
with a Progressive Web App for native app-like feel and offline access **on localhost**» — la qualifica *localhost*
è tutto. L'org non ha repo mobile. In compenso ha lo stack RAG più profondo del settore (**9 vector database**),
tool via **MCP, MCPO e OpenAPI**, Skills/Pipes/Filters, RBAC multiutente, voce/video hands-free, generazione immagini.
**La licenza va letta:** non è BSD standard ma una **BSD 3-Clause modificata** la cui clausola 4 vieta di rimuovere il
branding "Open WebUI" salvo che gli utenti finali totali non superino **cinquanta (50) in una finestra mobile di
trenta (30) giorni**, o si abbia permesso scritto o licenza enterprise.

**Jan** — Apache 2.0 (con una riga non standard che chiede attribuzione, motivo per cui l'API dice `NOASSERTION`),
43 812 stelle, **v0.8.4 del 2026-07-23**: gli asset sono solo macOS/Windows/Linux, **nessun APK, nessun IPA**, e la
pagina download non ha né mobile né un "coming soon". Nessun repo mobile nelle due org. **LM Studio** — proprietaria,
**nessuna presenza Android o iOS**; la home è ora occupata da "Bionic", il loro agente locale con trascrizione vocale
in tempo reale, «available in initial preview for macOS and Windows». **Msty** — proprietaria; *Msty Go* pubblicizza
un «Mobile companion» per «check progress, approve decisions, and direct work… when you are away from the desktop»,
ma la doc dice «Compatible platforms: macOS, Windows, Linux» senza alcun metodo d'accesso mobile: **che forma abbia
quel companion è «non confermato»**. La via telefono concreta è messaggistica (integrazioni Discord/Telegram/WhatsApp
nel piano Go Free) e **Studio Web, che si sblocca a 149 $/utente/anno**.

---

## 6. I minori di F-Droid, in una riga ciascuno

- **oxproxion** (`io.github.stardomains3.oxproxion`) — Apache-2.0, **2.1.103 del 31 luglio 2026**, Android 12+;
  client verso OpenRouter/Ollama/LM Studio/llama.cpp, **trascrizione vocale locale**, export PDF on-device, 100 %
  Kotlin. Manutenzione ottima, ma **remoto per costruzione**.
- **Maskan — Private AI Chat** (`app.maskan.chat`) — GPL-3.0, **2.4.3 del 24 giugno 2026**, Android 8+; 11 provider
  BYOK, STT/TTS in arabo, inglese e thai, visione, **AES-256-GCM**, cartelle. Nessun motore locale proprio.
- **GPTMobile** (`dev.chungjungsoo.gptmobile`) — GPL-3.0-only, **0.7.6 del 21 giugno 2026**; interroga **più modelli
  in parallelo** e li mostra affiancati. Nicchia utile: il confronto, che nessuno di noi offre.
- **Open Hitomi** (`ai.agent1c.hitomi.open`) — AGPL-3.0-or-later, **0.1.2 del 9 giugno 2026**, Android 5+;
  **assistente flottante in overlay** con browser in-app e readback, **shell Termux opzionale**, endpoint
  Ollama-compatibile. L'idea dell'overlay che legge la pagina è la cosa da guardare.
- **SwiftSlate** (`com.musheer360.swiftslate`) — assistente testuale **di sistema**: si digita un trigger e il testo
  viene trasformato ovunque. Dettagli non approfonditi.
- **Reins** — GPL-3.0, **v1.3.4 del 2026-02-24**, ultimo commit 2026-02-17: rallentato. Solo Ollama remoto, Flutter.
  Il suo pregio è **la configurazione per-conversazione fatta bene** — system prompt, modello, temperatura e contesto
  legati alla singola chat, con cambio modello a metà conversazione. Idea da rubare se non l'abbiamo.
- **JHubi1/ollama-app** — **dormiente**: ultima release **v1.2.0 del 2024-09-14**, ultimo commit **2025-08-24**, tre
  commit in tutto il 2025. Non archiviato, ma silenzioso da undici mesi. Apache-2.0, IzzyOnDroid. Non ospita nulla
  on-device: «This app does not host a Ollama server on device, but rather connects to one using its api endpoint».

---

## 7. Cosa fanno MEGLIO di noi — la lista onesta

Ordinata per quanto fa male, non per quanto è grande il prodotto.

1. **Agora ha già la sandbox di esecuzione che noi abbiamo solo progettato**: Alpine via PRoot, rootfs verificato per
   checksum, accesso file via SAF, 19 tool, e ricerca web **anonima e senza chiave** come default (DuckDuckGo Lite).
   Noi la chiave la chiediamo ancora.
2. **Kai 9000 ha il daemon in background verificato in manifest** — `dataSync` + notifica `IMPORTANCE_LOW` — e un
   **heartbeat configurabile** che fa lavorare l'agente da solo fra le 8 e le 22. E ha un **client MCP vero** su
   Android, cosa che Agora *non* ha.
3. **Kai 9000 ha già risolto il problema che avremo noi con la distribuzione doppia**: due varianti di manifest, la
   FOSS con SMS/notification-listener/install-packages e la Play senza, e **la feature si spegne da sola leggendo il
   manifest fuso** invece di fallire davanti all'utente.
4. **un agente di terze parti Fork ha spedito Shizuku e AccessibilityService**, più bridge verso app, notifiche, impostazioni,
   scorciatoie, widget e **plugin Tasker/Locale**. La nostra visione dell'agente operativo Android è, sul piano della
   dichiarazione di capacità, già superata da un fork MIT su F-Droid.
5. **LM Playground ha tool + RAG documentale + visione in locale, oggi, sul Play Store** — con EmbeddingGemma per la
   ricerca semantica su PDF/Word/EPUB e il fallback memory-mapped quando il modello non entra in RAM.
6. **Google AI Edge Gallery ha il consenso per singola invocazione MCP** e i binari per-chipset con NPU e TPU. Il
   nostro modello di autorizzazione tool va misurato contro il loro, non contro il resto del campo.
7. **KoboldCpp ha l'ampiezza funzionale massima in un binario** — MCP, tool calling, websearch, RAG TextDB, vision,
   cinque motori TTS, sette famiglie di generazione immagini — e la spedisce ogni mese.
8. **PocketPal ha la UX di scoperta/download dei modelli e una leaderboard di benchmark**, più un marketplace con
   pagamenti veri: l'unica monetizzazione funzionante del tier open source.
9. **Enclave ha il modello commerciale che risolve l'attrito delle chiavi**: $9,99/mese che *includono* $9,99 di
   crediti, nessuna chiave, nessun account terzo, e **degradazione al locale** quando i crediti finiscono.
10. **Private LLM rende il modello locale invocabile da altre app** via App Intents e `x-callback-url`. È la nostra
    "seconda porta", ma a livello di sistema operativo.
11. **AnythingLLM fa RAG on-device con citazioni** e una fabric di sync in LAN fra telefono e desktop.
12. **Layla vende un'app locale a €22,99 con 10 000+ installazioni**, con agenti Python, knowledge graph, clonazione
    vocale e Stable Diffusion offline. La prova che il pubblico paga.
13. **Termux dà una userland POSIX completa** con llama.cpp Vulkan+OpenCL apt-installabile: sulla flessibilità non
    si batte, e non va provato.

---

## 8. Cosa NON fa NESSUNO di loro — e perché

Per ciascuna voce distinguo se l'ostacolo è **tecnico** (il sistema operativo o il modello lo impedisce) o
**mancanza d'immaginazione** (nessuno ci ha pensato, o non gli interessa).

### 8.1 Verifica delle citazioni — nessuno, e non è tecnico

**Nessun prodotto dell'intero atlante — nessuno — verifica un'affermazione contro la sua fonte.** AnythingLLM elenca
"deep research" fra i tool agentici e fa RAG con citazioni, ma citare non è verificare. MyDeviceAI ha SearXNG grezzo.
Private LLM rifiuta il web per principio. KoboldCpp ha websearch e RAG ma nessun controllo di aderenza.
**Motivo: nessuno ci ha pensato in questi termini.** Non c'è alcun vincolo tecnico — costa un secondo modello e una
disciplina di prompt. È il nostro one-up strutturale su Deep Research (`deep-research-spec`, R-4), ed è **ancora
completamente libero**.

### 8.2 Generazione che sopravvive allo schermo spento, con un budget onesto — quasi nessuno, e qui è tecnico

Kai 9000 è **l'unico** con un foreground service documentato e verificato per il lavoro agentico
(`dataSync`). LM Playground ha notifiche di generazione live, che lo suggerisce ma non lo dichiara.
PocketPal ha un bug aperto da **dicembre 2024**. Termux ha il wake lock ma il phantom-process killer di Android 12+
uccide «any processes using excessive CPU» per ammissione del suo stesso README.

Il motivo è **tecnico e ha numeri precisi, che vanno citati per intero**:
- Android 15: «The system permits an app's **`dataSync`** services to run for a total of **6 hours in a 24-hour
  period**», dopodiché il sistema chiama `Service.onTimeout()` e l'app deve fare `stopSelf()` entro pochi secondi o
  prende un'eccezione fatale; il timer si azzera quando l'utente riporta l'app in primo piano. Stesso budget per il
  nuovo tipo **`mediaProcessing`**. E `BOOT_COMPLETED` **non può** avviare `dataSync`, `camera`, `mediaPlayback`,
  `phoneCall`, `mediaProjection` o `microphone` (`developer.android.com/about/versions/15/behavior-changes-15`).
- Android 16: le quote di `JobScheduler` si applicano ora anche ai job avviati **mentre l'app era visibile** e che
  proseguono dopo, e **anche ai job concorrenti a un foreground service**; le quote dipendono dallo standby bucket.
  I valori esatti **non sono pubblicati**: vanno misurati sul dispositivo
  (`developer.android.com/about/versions/16/behavior-changes-all`).

**Conclusione operativa:** il varco esiste ma non è gratis. Chi lo attraversa con un `dataSync` che ignora il budget
di 6 ore consegna un prodotto che muore in silenzio. **Il nostro one-up non è "generiamo in background": è
"generiamo in background e diciamo all'utente quanto budget resta, e cosa succede quando finisce".** Nessuno lo fa —
e questa parte è mancanza d'immaginazione, non ostacolo tecnico.

### 8.3 Previsione del fit in memoria — nessuno, e non è tecnico

Nessun prodotto predice se una data quantizzazione entrerà nella RAM **libera** prima di scaricarla. LM Playground e
PocketPal hanno il *fallback*: memory-mapping quando non entra, regole per dispositivo, avvisi sul limite di
contesto. Ma è reazione, non previsione. Il nostro numero di riferimento — **~4 GB liberi a caldo** sul dispositivo
di prova (`talos-test-device-oneplus`) — è la misura che nessuno mostra all'utente prima del download.

### 8.4 MCP *client* su un modello locale in un'app di terze parti — quasi nessuno

Solo **Kai 9000** ha un client MCP su Android con inferenza locale LiteRT-LM, e **Google AI Edge Gallery** ce l'ha
sperimentale sul proprio runtime. **Agora non ce l'ha** (espone Conch *come* server MCP verso Claude Desktop — vedi
la correzione al §3.1). PocketPal ce l'ha come issue aperta. AnythingLLM lo esclude esplicitamente sul telefono
standalone. Chatbox lo vende a $19,99/mese **come servizio ospitato**. KoboldCpp ce l'ha, ma dentro Termux.
**Motivo misto:** tecnico quanto basta (un modello piccolo che chiama tool MCP arbitrari sbaglia spesso), ma
soprattutto è che quasi tutti hanno deciso che il telefono è un client.

### 8.5 Il telefono come *sede* dell'agente, non come telecomando — quasi nessuno

Msty Go, Open WebUI, Jan e LM Studio Bionic mettono l'agente sul desktop; il telefono al massimo approva. Le
eccezioni sono le tre app F-Droid del §3 e KoboldCpp. **Motivo: economico più che tecnico** — sul desktop c'è la CPU,
e la maggior parte di questi prodotti *nasce* desktop.

### 8.6 Una biblioteca documentale con provenienza — nessuno

Enclave fa document chat, Cactus auto-RAG, AnythingLLM RAG con citazioni, LM Playground Q&A con EmbeddingGemma.
**Ma nessuno registra da dove viene un file, e nessuno tratta i metadati del file come dati e mai come istruzioni**
(`library-file-provenance-record`). **Non è tecnico: è che il problema del prompt injection via metadati non è
ancora nel loro modello mentale.**

### 8.7 Build riproducibili — quasi nessuno

Nessuno dei sei del §2 è su F-Droid; le tre app agentiche del §3 sì, quindi *loro* passano per la pipeline di build
riproducibile di F-Droid. Il resto è Play Store o APK crudo. **Distinzione importante rispetto a quanto si potrebbe
concludere in fretta: il nostro piano fuori-dal-Play non è incontestato — Agora, Kai 9000 e Hermes Fork sono già
lì.** Quello che resta nostro è *cosa* si sblocca fuori dal Play e come lo si dichiara.

### 8.8 STT/TTS on-device dentro un client mobile locale — pochissimi

PocketPal ha TTS on-device (Kokoro, Supertonic) ma niente STT. Enclave usa il riconoscimento vocale di Apple, quindi
solo iOS. oxproxion ha trascrizione locale. Cactus ha lo stack audio migliore ma è un SDK. LM Studio ha voce locale
solo su desktop. **Motivo tecnico reale:** un modello STT decente occupa RAM che serve al LLM, e su un telefono da
8 GB i due non convivono bene.

### 8.9 Un server API locale OpenAI-compatibile dentro l'app — nessuno fra le app

Richiesto in PocketPal (#707, chiuso come duplicato), spedito da nessuna app. Lo hanno **Jan** (`localhost:1337`),
**KoboldCpp** (`localhost:5001`), **GenieX** (`127.0.0.1:18181/v1`) — cioè tre runtime, nessuna app di chat.
**Non è tecnico:** è che nessuno ha pensato al telefono come *fornitore* di inferenza per altre app sul telefono.
Combinato col §8.4 e con Private LLM che è l'unico invocabile da fuori (via App Intents), qui c'è uno spazio vuoto
piuttosto grande.

### 8.10 Confronto affiancato di più modelli — solo GPTMobile

Solo `dev.chungjungsoo.gptmobile` interroga più modelli in parallelo e li mostra affiancati. Nessuno lo fa fra
locale e remoto. **Mancanza d'immaginazione pura**, e per noi che abbiamo sei provider BYOK sarebbe quasi gratis.

---

## 9. Le tre correzioni che il verificatore ci chiederebbe

1. **«Agora ha MCP» — impreciso.** Agora espone il suo backend shell Conch **come server MCP per Claude Desktop**;
   non è documentata come client MCP. Chi ha MCP client su Android è **Kai 9000** (e Gallery, sperimentale).
2. **«Nessuno gira in background» — falso.** Kai 9000 ha un `DaemonService` con `foregroundServiceType="dataSync"`
   nel manifest e una doc che lo spiega. La forma corretta della nostra rivendicazione è sul **budget dichiarato**
   (6 h/24 h su Android 15), non sull'esistenza del background.
3. **«La distribuzione fuori dal Play è il nostro terreno» — falso.** Agora, Kai 9000 e un agente di terze parti Fork sono già su
   F-Droid, e Kai ha perfino la variante di manifest dedicata che sblocca SMS, notification listener e installazione
   pacchetti solo fuori dal Play. Il terreno è occupato; il vantaggio va cercato altrove.

E una quarta, che riguarda noi: **Nexa AI non esiste più**. Se in qualche documento nostro compare come opzione di
runtime NPU, va riscritto in **Qualcomm GenieX, BSD-3-Clause, dipendenza Gradle**.

---

## 10. Cosa resta «non confermato»

Sito di Layla (SPA JS, solo `<title>`); versione e data di aggiornamento dell'app Android di Layla (scheda Play non
apribile — ho solo i dati della pagina di ricerca); installazioni Play di PocketPal, AnythingLLM Mobile e AI Edge
Gallery; disponibilità di Brave Leo BYOM su Android (la KB Brave risponde 403 — la fonte primaria che ho, il blog di
annuncio, dice «BYOM is initially for Desktop users only», ma è vecchia); licenza e API GPU esatta (OpenCL vs Vulkan)
di MLC-LLM; provider di ricerca web e sandbox JavaScript di LM Playground; supporto a function calling/MCP in
GenieX; forma del "mobile companion" di Msty Go; uso effettivo di Shizuku nel codice del fork Hermes (la code search
GitHub non indicizza i fork); il comando adb per disattivare il phantom-process killer; qualunque cifra di tok/s per
KoboldCpp su Android; generazione in background per PocketPal, ChatterUI, SmolChat, MLCChat, Maid, Enclave,
Private LLM e AI Edge Gallery — **nessuna fonte primaria la documenta, in nessun verso**.

Numeri che sono **rivendicazioni del vendor nelle proprie fonti primarie**, non misure indipendenti: i tok/s del
README di Cactus; i "2667 tok/s prefill" delle release notes di MNN; le percentuali di marketing di Cactus
(«<120 ms latency», «<6 % WER», «5x cost savings»). I bucket di installazione del Play Store (10K+ per Layla) sono la
granularità grezza di Google, non un conteggio. I 147 download dell'APK di MyDeviceAI e i download per-asset di
AI Edge Gallery vengono dai contatori dell'API GitHub e riguardano **solo il sideload**.

---

## 11. Le tre cose da fare con questo documento

1. **Rileggere `android-agent-shizuku-vision` accanto al manifest di un agente di terze parti Fork.** Non per rinunciare: per
   riscrivere la parte che diceva "nessuno lo fa".
2. **Aggiungere `ACCESS_LOCAL_NETWORK` alla roadmap** se TALOS parlerà con Ollama/LM Studio in LAN: da Android 17
   (API 37) l'enforcement è obbligatorio.
3. **Spostare l'asse del one-up dalla presenza di una funzione alla sua onestà.** Background sì, ma col budget
   dichiarato. Tool sì, ma con la traccia della prova. Ricerca sì, ma con la citazione verificata. È l'unico terreno
   del §8 dove nessuno di questi venti prodotti ha ancora messo piede.
