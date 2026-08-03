# Ricerca — interfacce Deep Research dei concorrenti (3 agosto 2026)

## 0. Come ho lavorato

### Perimetro e limiti

Questa analisi riguarda **interfaccia, comportamento, stato, citazioni, cronologia ed esportazione**. Non confronta la qualità generale dei modelli né il prezzo, salvo quando un piano modifica ciò che l’utente vede.

Non ho avuto accesso autenticato e comparabile a tutti e cinque i prodotti e a tutti i relativi piani. Ho quindi lavorato con questa gerarchia di evidenza:

- **[DOC]** documentazione, help center o annuncio ufficiale del prodotto;
- **[UI]** comportamento visibile in screenshot o video ufficiale;
- **[3P]** walkthrough, recensione o screenshot di terze parti, usato solo quando la documentazione ufficiale non descrive la UI;
- **[NV]** non verificato: la fonte non basta per concludere né “sì” né “no”.

Ogni osservazione è datata **2026-08-03**, salvo una data diversa indicata accanto alla fonte. Le interfacce possono variare per piano, regione, piattaforma, rollout o test A/B. Quando una fonte storica e una fonte corrente divergono, la divergenza è esplicitata.

### Cosa ho potuto vedere e cosa ho solo letto

- **OpenAI — ChatGPT Deep Research:** [DOC] documentazione corrente e annuncio ufficiale; [UI] screenshot e descrizione ufficiale del viewer, integrati da una recensione della UI 2026. Non usato in sessione autenticata. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research) · [annuncio](https://openai.com/index/introducing-deep-research/) · [viewer 2026, terza parte](https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer)
- **Google — Gemini Deep Research:** [DOC] help desktop/Android e documentazione tecnica; [UI] screenshot pubblici. Non usato in sessione autenticata. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en) · [Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en) · [API](https://ai.google.dev/gemini-api/docs/deep-research?hl=en)
- **Perplexity — Research / Advanced Deep Research / Pages:** [DOC] help center aggiornato a luglio 2026; [UI] schermate ufficiali e walkthrough. Non usato in sessione autenticata. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **Anthropic — Claude Research:** [DOC] help center e annunci ufficiali; la documentazione descrive poco la UI durante l’esecuzione. Non usato in sessione autenticata. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [annuncio](https://www.anthropic.com/news/research)
- **xAI — Grok DeepSearch:** [DOC] annunci xAI e help X; [3P] walkthrough per i dettagli della UI, perché le fonti ufficiali non documentano in modo sufficiente avanzamento, cronologia ed esportazione. Non usato in sessione autenticata. [Grok 3](https://x.ai/news/grok-3) · [help X](https://help.x.com/en/using-x/about-grok) · [walkthrough](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/)

### Screenshot e demo utili al design

- **ChatGPT:** il post ufficiale mostra il flusso originale con attività e fonti in una barra laterale; la documentazione 2026 descrive il nuovo report a schermo intero con indice, fonti e cronologia attività. [Screenshot/video ufficiale](https://openai.com/index/introducing-deep-research/) · [descrizione viewer corrente](https://help.openai.com/it-it/articles/10500283-deep-research)
- **Gemini:** la guida mostra il report aperto in Canvas su desktop e con comando “Open” su mobile. [Guida ufficiale](https://support.google.com/gemini/answer/15719111?hl=en)
- **Perplexity:** la guida 2026 mostra la nuova esperienza con fonti lette, apprendimenti intermedi e file del rapporto. [Guida ufficiale](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Labs](https://www.perplexity.ai/it/hub/blog/introducing-perplexity-labs)
- **Claude:** gli annunci mostrano l’attivazione della modalità e la risposta in chat con citazioni. [Research](https://www.anthropic.com/news/research) · [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search)
- **Grok:** il walkthrough mostra il riquadro di ragionamento/ricerca, le pagine analizzate e la sezione citazioni. È una fonte di terze parti, non una specifica ufficiale. [Walkthrough con schermate](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/)

---

## 1. Scheda per prodotto

### 1.1 OpenAI — ChatGPT Deep Research

**Stato della fonte:** documentazione ufficiale corrente, aggiornata pochi giorni prima di questa ricerca, più annuncio storico aggiornato nel 2026. Le funzioni possono dipendere dal piano e dai limiti d’uso. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)

#### A. Attesa e avanzamento

- **2026-08-03 — [DOC] Mostra un piano/attività in tempo reale e le fonti consultate.** La guida corrente dice che durante la ricerca si può seguire l’avanzamento; l’annuncio descrive una barra laterale con riepilogo dei passi compiuti e delle fonti usate. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research) · [annuncio](https://openai.com/index/introducing-deep-research/)
- **2026-08-03 — [DOC] Consente di intervenire durante l’esecuzione.** Si può interrompere il flusso per chiarire il compito, restringere il campo o aggiungere fonti. È un’interruzione per guidare il lavoro, non una pausa durabile documentata. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research) · [OpenAI Academy](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research)
- **2026-08-03 — [DOC] Non è documentata una percentuale, un numero di passi residui o un ETA affidabile.** L’annuncio storico indica una durata tipica di 5–30 minuti, ma non afferma che l’interfaccia calcoli il tempo restante della singola ricerca. [Annuncio](https://openai.com/index/introducing-deep-research/)
- **2026-08-03 — [DOC] Si può lasciare la schermata e continuare altre attività.** OpenAI afferma che l’utente può allontanarsi o svolgere altro lavoro mentre il compito prosegue. [Annuncio](https://openai.com/index/introducing-deep-research/)
- **2026-08-03 — [DOC] È prevista una notifica al termine.** L’annuncio ufficiale dichiara che ChatGPT avvisa quando la ricerca è completa. La documentazione corrente non dettaglia canale, impostazioni o comportamento Android. [Annuncio](https://openai.com/index/introducing-deep-research/)
- **2026-08-03 — [NV] Stop e ripresa non sono descritti come coppia esplicita.** È verificato che si possa interrompere per modificare l’istruzione; non è verificato un comando “Pausa” seguito da “Riprendi” che conservi esattamente lo stato interno. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)

#### B. Il piano prima di partire

- **2026-08-03 — [DOC] Propone un piano prima dell’esecuzione e il piano è modificabile.** La guida dice che ChatGPT può proporre un piano, che l’utente può rivedere e modificare prima di avviare. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Può fare domande di chiarimento.** La documentazione non promette un numero fisso: dipende dall’ambiguità del compito e dalle fonti richieste. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] La selezione delle fonti è parte del preflight.** Si possono includere file caricati, web pubblico, siti specifici e app collegate; è possibile limitare o privilegiare domini. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Non mostra un costo monetario stimato per singola ricerca.** La UI espone limiti/contatore d’uso, non una stima di costo del job. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [PARZIALE] Esiste una durata tipica generale, non una stima pre-run personalizzata.** Il riferimento ufficiale storico è 5–30 minuti; la guida corrente evita di promettere un tempo preciso. [Annuncio](https://openai.com/index/introducing-deep-research/)

#### C. Il rapporto finale

- **2026-08-03 — [DOC] Il risultato si apre come report a schermo intero.** La guida corrente descrive una vista dedicata con indice, fonti utilizzate e cronologia dell’attività; questa è una gerarchia distinta dalla semplice bolla di chat. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [UI/3P] Su desktop il viewer è organizzato in tre aree funzionali.** Indice a sinistra, documento al centro e fonti a destra sono descritti nella copertura del rollout 2026; la fonte è giornalistica, coerente con la documentazione ufficiale ma non sostituisce una specifica. [The Verge](https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer)
- **2026-08-03 — [DOC] Le citazioni sono in linea e cliccabili.** Ogni output include citazioni e collegamenti alle fonti, per aprire il materiale di supporto. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Le fonti hanno una vista dedicata nel report.** La guida garantisce l’elenco delle fonti usate, ma non documenta per ogni voce favicon, data, estratto o qualità della lettura. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue pagina letta integralmente da frammento o snippet.** Nessuna fonte ufficiale consultata espone questo stato nell’interfaccia. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Esporta in Markdown, Microsoft Word e PDF.** L’esportazione è integrata nel report corrente. La guida non specifica indice cliccabile, resa delle immagini, stile bibliografico o opzioni tipografiche. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [PARZIALE] Il rapporto ha una vista propria ma resta legato alla conversazione.** È un viewer dedicato a schermo intero, non una libreria indipendente di documenti; il contenuto resta nella cronologia della chat finché la chat non viene eliminata. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Si può condividere tramite link della conversazione.** Il link è una snapshot accessibile a chiunque lo possieda; non offre permessi granulari o scadenza. [FAQ link condivisi](https://help.openai.com/it-it/articles/7925741-chatgpt-shared-links-faq)

#### D. La cronologia

- **2026-08-03 — [DOC] Le ricerche restano nella cronologia generale delle chat.** La guida Deep Research dice che il risultato resta nella conversazione salvo eliminazione. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [DOC] Le chat si possono cercare per parole esatte in titolo e contenuto.** La ricerca è disponibile dalla barra laterale e con scorciatoia da tastiera sul web. [Ricerca cronologia](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt)
- **2026-08-03 — [DOC] Si possono archiviare ed eliminare le conversazioni.** Le chat archiviate restano cercabili; l’eliminazione è definitiva secondo le regole del servizio. [Gestione chat](https://help.openai.com/it-it/articles/8809935-how-to-delete-and-archive-chats-in-chatgpt)
- **2026-08-03 — [PARZIALE] La landing corrente offre accesso rapido ai report recenti.** OpenAI Academy menziona una pagina iniziale con prompt e report recenti; non è documentato un filtro “solo Deep Research”, né schede con numero fonti, stato e anteprima standardizzati. [OpenAI Academy](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research)
- **2026-08-03 — [NV] Raggruppamento, rinomina e filtri specifici per ricerca non sono documentati come funzioni del report.** Queste operazioni possono esistere a livello di chat/progetto, ma non risultano una libreria specializzata di ricerche. [Ricerca cronologia](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt)

#### E. La struttura visiva

- **2026-08-03 — [UI] Gerarchia tipografica osservabile: titolo del report, titoli di sezione, corpo, metadati/citazioni.** La vista separa navigazione, testo e fonti; non sono pubblicate misure esatte, quindi non è corretto inventare pixel o pesi. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research) · [viewer 2026](https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer)
- **2026-08-03 — [UI] Densità desktop medio-alta ma segmentata.** Il corpo mantiene una colonna leggibile, mentre indice e fonti trasferiscono navigazione e prove fuori dal flusso principale. [Viewer 2026](https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer)
- **2026-08-03 — [UI] Il colore è usato soprattutto per azioni, link e stato di attività, non come semaforo di affidabilità.** Non è documentata una codifica cromatica per “supportato”, “debole” o “contraddetto”. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [NV] Il comportamento preciso su telefono del viewer 2026 non è documentato.** È ragionevole che indice e fonti diventino pannelli o viste successive, ma questa è un’inferenza e non va trattata come fatto. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [NV] Non sono documentate durate o curve delle animazioni.** Le fonti mostrano transizioni e aggiornamenti live, ma non permettono una misura attendibile. [Annuncio](https://openai.com/index/introducing-deep-research/)

#### F. Onestà del prodotto

- **2026-08-03 — [DOC] OpenAI dichiara limiti espliciti.** Il prodotto può fare inferenze errate, distinguere male fonti autorevoli da voci e mostrare calibrazione della fiducia debole; possono esserci errori di formattazione e citazione. [Annuncio](https://openai.com/index/introducing-deep-research/)
- **2026-08-03 — [PARZIALE] Le citazioni rendono ispezionabile la prova, ma non mostrano la forza del supporto per affermazione.** Non esiste nella documentazione un indicatore “verificato / raccolto / contraddetto” equivalente al giudice di TALOS. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [NV] Non è documentato come appare un fallimento parziale per singolo ramo.** La UI corrente mostra attività e permette interventi, ma la guida non descrive una lista di errori recuperabili per passo. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- **2026-08-03 — [3P] Esistono segnalazioni di esportazione PDF fallita.** È una testimonianza individuale nella community, non una misura di affidabilità generale, ma dimostra che “formato disponibile” non equivale a “pipeline robusta”. [Community OpenAI](https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950)

**Pattern più utile da copiare:** report a schermo intero con indice e fonti persistenti, mantenendo l’attività consultabile dopo la conclusione.

**Vuoto utile per TALOS:** rendere visibili profondità di lettura, esito del giudice e recupero per ramo, invece di affidarsi alla sola presenza di citazioni.

---

### 1.2 Google — Gemini Deep Research

**Stato della fonte:** help ufficiale desktop e Android, documentazione tecnica e pagina prodotto. Le funzioni visuali avanzate possono dipendere da piano e modello. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)

#### A. Attesa e avanzamento

- **2026-08-03 — [DOC] Durante l’esecuzione mostra uno stato della ricerca e, al termine, un marcatore nella lista delle chat.** La guida non specifica una percentuale né un numero di passi residui. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [UI] Gli screenshot pubblici mostrano un riquadro compatto di lavorazione con verbi di stato, non un log tecnico completo.** La formulazione e il layout possono cambiare per rollout; la guida ufficiale è la fonte normativa. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] La durata generale dichiarata è spesso 5–10 minuti.** Non è documentato un ETA personalizzato e aggiornato in tempo reale. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Si può lasciare la chat mentre la ricerca continua.** Il completamento è indicato accanto alla conversazione sul web. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Su mobile può inviare una notifica anche con dispositivo bloccato, secondo le impostazioni.** Questa è la documentazione più esplicita fra i cinque sul canale di notifica. [Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en)
- **2026-08-03 — [NV] Non è documentato un comando utente di pausa e ripresa.** La documentazione tecnica parla di esecuzione in background e tolleranza ai fallimenti, ma non equivale a un controllo “Pausa/Riprendi” nell’app. [API Deep Research](https://ai.google.dev/gemini-api/docs/deep-research?hl=en) · [pagina prodotto](https://gemini.google/overview/deep-research/)

#### B. Il piano prima di partire

- **2026-08-03 — [DOC] Genera un piano di ricerca prima dell’avvio.** L’utente può rivederlo e selezionare “Edit plan” prima di “Start research”. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Il piano è modificabile dall’utente.** È una modifica esplicita nel preflight, non solo un prompt di correzione dopo l’avvio. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [PARZIALE] Può collaborare sul piano e porre chiarimenti, ma non è documentato un numero fisso di domande.** La documentazione tecnica descrive revisione e raffinamento collaborativi; la guida consumer non formalizza un questionario. [API Deep Research](https://ai.google.dev/gemini-api/docs/deep-research?hl=en)
- **2026-08-03 — [DOC] La scelta delle fonti è visibile.** Google Search è la base; in base al piano si possono includere Gmail, Drive, file caricati e NotebookLM. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [NO] Non mostra un costo monetario stimato del singolo job.** La guida consumer non presenta una previsione di spesa. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [PARZIALE] Mostra una durata tipica generale, non una stima specifica.** L’API ammette fino a 60 minuti, con la maggior parte dei compiti sotto 20; la UI consumer parla spesso di 5–10 minuti. Le due fonti descrivono contesti diversi, non una contraddizione diretta. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en) · [API](https://ai.google.dev/gemini-api/docs/deep-research?hl=en)

#### C. Il rapporto finale

- **2026-08-03 — [DOC] Su desktop il rapporto si apre in Canvas, affiancato alla conversazione.** La chat conserva il contesto, mentre Canvas tratta il risultato come documento modificabile/consultabile. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Su mobile il rapporto si apre con un’azione “Open”.** Questo porta il documento in primo piano invece di comprimere permanentemente chat e report nello stesso schermo stretto. [Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en)
- **2026-08-03 — [DOC] Il report contiene fonti e collegamenti di supporto.** La documentazione non specifica in modo stabile la forma di ogni citazione, la presenza di tooltip o la quantità di estratto mostrata. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [UI] Le schermate pubbliche mostrano un conteggio dei siti ricercati e gruppi di fonti.** Favicon, titolo e schede possono essere presenti in alcune versioni; non sono garantiti come contratto UI dalla guida testuale. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue una fonte letta integralmente da una intravista.** Nessuna guida consumer o API consultata espone questo dato come metadato per l’utente. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Per il testo offre “Export to Docs” e copia dei contenuti.** Il Canvas può essere condiviso; non è documentato un export PDF diretto del report testuale nella stessa UI. [Condivisione Canvas](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en)
- **2026-08-03 — [PARZIALE] Il report ha una superficie propria, ma vive dentro la conversazione/Canvas.** Non emerge una libreria autonoma di documenti Deep Research separata dalle chat. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Si può condividere pubblicamente tramite link.** La pagina Canvas può generare un link `g.co/gemini/share`; la guida specifica condizioni e limiti della condivisione. [Condivisione Canvas](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en)
- **2026-08-03 — [DOC, piano dipendente] I report possono includere grafici, diagrammi, schemi o simulatori.** La disponibilità dipende dal modello/piano e non va considerata uniforme per tutti gli utenti. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)

#### D. La cronologia

- **2026-08-03 — [DOC] I rapporti passati compaiono in “Recent” se l’attività è attiva.** Disattivare “Keep Activity” cambia persistenza e recuperabilità. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Le chat si possono cercare, fissare, rinominare ed eliminare.** Queste funzioni valgono anche per le conversazioni che contengono una ricerca. [Gestione chat desktop](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) · [Android](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DAndroid&hl=en)
- **2026-08-03 — [DOC] È possibile creare una diramazione da una conversazione.** È utile per esplorare varianti senza sovrascrivere il contesto, ma non equivale a versionare il documento di ricerca. [Gestione chat desktop](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en)
- **2026-08-03 — [NV] Non è documentato un filtro “Deep Research”, un raggruppamento per progetto o una scheda standard con fonti/stato.** La cronologia resta centrata sulle chat. [Gestione chat desktop](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en)

#### E. La struttura visiva

- **2026-08-03 — [UI] Desktop: struttura a due superfici, conversazione e Canvas.** La separazione consente di mantenere prompt/follow-up da una parte e documento dall’altra. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [UI] Gerarchia osservabile: titolo, sezioni del report, corpo, citazioni/fonti e controlli Canvas.** Le fonti non pubblicano misure tipografiche esatte. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [UI] Densità desktop media, con il documento più largo del flusso chat.** La prova visiva è nelle schermate della guida; non è possibile ricavare una larghezza universale perché il layout è responsivo. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC] Mobile: il report viene aperto come vista primaria.** Questo evita una doppia colonna illeggibile su schermo stretto. [Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en)
- **2026-08-03 — [PARZIALE] Il colore segnala azioni e stato, ma non la solidità delle prove.** Non è documentato un sistema cromatico di affidabilità o contraddizione. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [NV] Le animazioni e la loro durata non sono specificate.** Le schermate mostrano aggiornamenti progressivi, non una specifica motion. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)

#### F. Onestà del prodotto

- **2026-08-03 — [PARZIALE] Il prodotto mostra fonti e rende il piano revisionabile, ma non espone un verdetto per affermazione.** Non è documentata una distinzione visiva fra contenuto verificato, raccolto o inferito. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [NO DOCUMENTATO] Non indica profondità di lettura per fonte.** Il numero di siti o le schede sorgente non dicono se una pagina è stata letta per intero. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [DOC, infrastruttura] Il motore è progettato per evitare che un singolo fallimento costringa a ricominciare.** Questa è una proprietà dichiarata del sistema, non una UI di recupero trasparente per ramo. [Pagina prodotto](https://gemini.google/overview/deep-research/)
- **2026-08-03 — [NV] Non è documentato come il report rappresenti un ramo fallito o fonti insufficienti.** Non risultano card di errore per passo comparabili alla schermata TALOS attuale. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- **2026-08-03 — [3P] Feedback pubblico recente chiede esportazione diretta a NotebookLM e cambio di modello dentro la stessa chat.** Google ha definito le richieste interessanti, senza promettere una data. È un segnale di frizione del workflow, non una specifica. [9to5Google](https://9to5google.com/2026/07/09/gemini-app-feedback/)

**Pattern più utile da copiare:** background chiaramente documentato, notifica mobile e passaggio pulito da chat a documento Canvas.

**Vuoto utile per TALOS:** ETA onesto, controllo di pausa/ripresa e stato probatorio per affermazione; il semplice conteggio dei siti non basta.

---
### 1.3 Perplexity — Research / Advanced Deep Research / Pages

**Stato della fonte:** help center aggiornato fra il 16 e il 30 luglio 2026. La nomenclatura è in transizione: “Research”, “Advanced Deep Research”, “Create” e “Pages” non sono superfici perfettamente stabili. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)

#### A. Attesa e avanzamento

- **2026-08-03 — [DOC] Mostra quali fonti sta leggendo, cosa ha appreso e come si sta formando il rapporto.** È la descrizione ufficiale più concreta fra i cinque: l’avanzamento non è solo uno spinner, ma una sequenza di fonti e apprendimenti. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] Fa emergere “key findings” durante la ricerca.** L’utente può leggere risultati provvisori prima della conclusione del documento. Questo aumenta utilità immediata ma rischia di dare troppo peso a elementi non ancora sintetizzati. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] Può porre domande di follow-up mentre sta lavorando.** La UI trasforma la ricerca in una collaborazione in corso, non in un job totalmente opaco. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] Non è documentata una percentuale o un numero di passi residui.** Il flusso comunica attività concreta, ma non un progresso quantitativo affidabile. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [CONTRADDIZIONE MINORE] La durata tipica è descritta in modo incoerente.** La guida dice sia che la maggior parte delle ricerche termina in meno di tre minuti, sia che una risposta completa richiede in genere quattro-cinque minuti; non va trasformato in un ETA preciso. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [NV] Non è verificato dalla documentazione se si possa lasciare la schermata e ricevere una notifica.** Il prodotto conserva la sessione, ma le fonti consultate non descrivono un comportamento di background/notifica paragonabile a Gemini. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [NV] Stop, pausa e ripresa non sono documentati.** Le domande durante la ricerca permettono di guidare il job, ma non provano l’esistenza di una pausa durabile. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)

#### B. Il piano prima di partire

- **2026-08-03 — [DOC] Per richieste ampie può fare domande di chiarimento prima o durante il lavoro.** La guida non fissa un numero e non mostra un questionario standard. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [PARZIALE] Il sistema usa un piano iterativo, ma non è documentato un piano pre-run visibile e modificabile.** La ricerca affina autonomamente il piano man mano che apprende; non è equivalente a “Edit plan” di Gemini o al piano revisionabile di ChatGPT. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [NO DOCUMENTATO] Non mostra un costo stimato.** Le guide descrivono limiti d’uso e disponibilità per piano, non il costo del singolo job. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [PARZIALE] Comunica una durata tipica generale, non una previsione personalizzata.** Le cifre ufficiali non sono internamente uniformi, quindi non devono essere usate come promessa UI. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)

#### C. Il rapporto finale

- **2026-08-03 — [DOC] Il rapporto “streamma” dentro un file modificabile.** Durante l’esecuzione il documento prende forma e, dopo, può essere modificato, raffinato e condiviso. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] Gli asset/documenti possono essere aperti in anteprima laterale o a schermo intero.** La cronologia delle modifiche consente di tornare a versioni precedenti. [Assets](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview)
- **2026-08-03 — [DOC] Le citazioni sono collegate alle fonti e la sessione conserva tutte le sorgenti.** Il menu della risposta consente di aprire le fonti e lasciare feedback sul report. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [UI] Il layout pubblico separa passi, fonti e documento tramite tab o pannelli.** Le schermate mostrano conteggi delle fonti e card sorgente; il dettaglio preciso varia fra Research, Labs/Create e il nuovo Advanced Deep Research. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Labs](https://www.perplexity.ai/it/hub/blog/introducing-perplexity-labs)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue pagina letta integralmente da frammento.** La UI dice quali fonti sta leggendo, ma non espone una profondità di acquisizione equivalente a “pagina intera / snippet”. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] Esporta in PDF, Markdown e DOCX.** La guida Research parla di PDF/documento; la guida Sessions elenca esplicitamente PDF, Markdown e DOCX. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [DOC] Il rapporto si può condividere con diversi ambiti.** Le sessioni possono essere private, accessibili a chi ha il link o limitate all’organizzazione, secondo il piano. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [CONTRADDIZIONE] La conversione in Page è descritta come disponibile e contemporaneamente come temporaneamente ritirata.** La guida Research dice che il report può essere convertito in Page; la guida Pages, aggiornata nello stesso periodo, dice che “Create page” è ritirato e “Convert to Page” tornerà a breve. La conclusione corretta al 3 agosto 2026 è: disponibilità non affidabile. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Pages](https://www.perplexity.ai/help-center/en/articles/10352968-perplexity-pages)
- **2026-08-03 — [PARZIALE] Ha una superficie documento propria, ma la sessione resta il contenitore canonico.** Il file può essere aperto a schermo intero; fonti, prompt e follow-up appartengono ancora alla sessione. [Assets](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview) · [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)

#### D. La cronologia

- **2026-08-03 — [DOC] Ha una History dedicata e persistente per le sessioni.** Ogni sessione include domanda iniziale, follow-up, risposte e tutte le fonti. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [DOC] Si può filtrare per modalità, inclusi Research e Create.** Questo è più specializzato della cronologia generica di chat di OpenAI, Gemini e Claude. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [DOC] Si può cercare, ordinare per data, eliminare in massa e aggiungere a un progetto.** La documentazione non promette una scheda standard con numero fonti e anteprima, ma conserva le fonti nella sessione. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [DOC] La query originale si può modificare e rilanciare.** Questo facilita la creazione di varianti, anche se non equivale a un diff fra report. [Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- **2026-08-03 — [DOC] Gli asset hanno versioni e cronologia di modifica.** È il caso più vicino a un documento di ricerca versionato fra i cinque. [Assets](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview)

#### E. La struttura visiva

- **2026-08-03 — [UI] La gerarchia usa almeno quattro livelli funzionali: navigazione di sessione, tab/pannelli di processo, titolo/sezioni del report e metadati/fonti.** Non sono pubblicate misure tipografiche esatte. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Labs](https://www.perplexity.ai/it/hub/blog/introducing-perplexity-labs)
- **2026-08-03 — [UI] La densità è alta ma categorizzata.** Tab come Steps/Sources/Assets e conteggi permettono di esporre molti dati senza inserirli tutti nel corpo del report. [Labs](https://www.perplexity.ai/it/hub/blog/introducing-perplexity-labs)
- **2026-08-03 — [UI] Lo stato è comunicato soprattutto con testo progressivo, tab attivi e conteggi, non con un semaforo di affidabilità.** Le “key findings” appaiono presto ma non risultano marcate come provvisorie con un grado di fiducia. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [DOC] È disponibile su mobile, web e Mac.** La guida non descrive però come i pannelli multipli collassino su schermo stretto. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [NV] Le animazioni non sono specificate.** Lo streaming del documento e degli apprendimenti è significativo come comportamento, ma non sono disponibili durate o regole motion. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)

#### F. Onestà del prodotto

- **2026-08-03 — [PARZIALE] Mostrare fonti lette e apprendimenti rende il processo più ispezionabile.** Tuttavia la UI non espone per ogni finding se è già verificato, provvisorio, contraddetto o derivato da una sola fonte. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue “raccolto” da “verificato”.** La presenza di molte fonti non è un verdetto sul sostegno di una specifica frase. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- **2026-08-03 — [NV] Il comportamento in caso di fallimento parziale non è documentato.** Non risultano errori per ramo con azioni di retry selettivo. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- **2026-08-03 — [3P] Le critiche storiche mostrano il rischio di un’interfaccia che appare più certa della raccolta sottostante.** Wired ha documentato casi di dettagli fabbricati e citazioni scorrette nel prodotto 2024; non è una valutazione dell’Advanced Deep Research 2026, ma resta un avvertimento progettuale sul “trust by citation chrome”. [Wired](https://www.wired.com/story/perplexity-is-a-bullshit-machine)

**Pattern più utile da copiare:** avanzamento semanticamente utile — fonti lette, apprendimenti e documento che prende forma — più cronologia filtrabile per modalità.

**Vuoto utile per TALOS:** marcare i finding intermedi come provvisori, esporre esito del giudice e consentire retry per ramo invece di mostrare solo un flusso convincente.

---

### 1.4 Anthropic — Claude Research

**Stato della fonte:** help ufficiale aggiornato a giugno 2026 e annunci Anthropic. Le fonti spiegano capacità, attivazione e citazioni, ma documentano poco la UI durante il job. Ogni assenza di documentazione è quindi segnata [NV], non trasformata automaticamente in “no”. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)

#### A. Attesa e avanzamento

- **2026-08-03 — [DOC] L’attivazione è visibile con un indicatore blu “Research” vicino al compositore.** La modalità si seleziona dal pulsante “+” su web, desktop e mobile. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [DOC] Durante la ricerca web appare un indicatore di ricerca.** La documentazione web search dice che Claude mostra quando sta cercando e poi restituisce una risposta con citazioni. [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search)
- **2026-08-03 — [NV] Non è documentata una barra, una lista di passi, un log scorrevole o un conteggio delle fonti in tempo reale.** Le fonti ufficiali descrivono il lavoro multi-step ma non la sua rappresentazione visuale. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [DOC] La durata generale dichiarata è spesso 5–15 minuti e può arrivare a 45.** Non è documentato un tempo restante o una percentuale per la singola sessione. [Annuncio integrazioni](https://www.anthropic.com/news/integrations)
- **2026-08-03 — [NV] Non è documentato se si possa lasciare la schermata, ricevere una notifica, fermare o riprendere.** La disponibilità mobile non basta a provare il comportamento in background. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)

#### B. Il piano prima di partire

- **2026-08-03 — [DOC, interno] Claude scompone la richiesta in parti più piccole e svolge più ricerche che si alimentano a vicenda.** È un piano operativo del sistema; la fonte non dice che venga mostrato prima dell’avvio. [Annuncio Research](https://www.anthropic.com/news/research)
- **2026-08-03 — [NV] Non è verificato un piano pre-run visibile o modificabile.** Non risultano controlli equivalenti a “Edit plan”. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [NV] Non è documentato un ciclo obbligatorio di domande di chiarimento.** Claude può naturalmente chiedere dettagli in chat, ma le fonti non lo definiscono come fase della modalità Research. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [NO DOCUMENTATO] Non mostra costo o stima di durata personalizzata.** Esiste solo una durata generale comunicata nell’annuncio. [Annuncio integrazioni](https://www.anthropic.com/news/integrations)

#### C. Il rapporto finale

- **2026-08-03 — [DOC] Il risultato è una risposta nella conversazione, non un viewer-documento separato documentato.** La modalità produce una risposta completa con citazioni nel normale contenitore Claude. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [DOC] Le citazioni sono dirette e cliccabili.** La guida web search dice che le risposte includono collegamenti alle fonti e citazioni facili da verificare; possono apparire anche citazioni pertinenti. [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) · [annuncio Research](https://www.anthropic.com/news/research)
- **2026-08-03 — [PARZIALE] Le fonti sono accessibili dai link nella risposta.** Non è documentata una colonna permanente, una scheda con favicon/data/estratto o una bibliografia visuale standard per Research. [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue fonte letta per intero da frammento.** La guida avverte anzi che il contesto della fonte può essere omesso nella risposta. [Risposte errate](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)
- **2026-08-03 — [NO] Non è documentato un export del singolo report in PDF, DOCX o Markdown.** L’export dati di Claude produce l’archivio dell’account e non va confuso con un export impaginato del rapporto. [Export dati](https://support.claude.com/en/articles/9450526-export-your-claude-data)
- **2026-08-03 — [DOC] La conversazione si può condividere tramite snapshot.** La condivisione pubblica o limitata all’organizzazione dipende dal tipo di account; file e dati grezzi da integrazioni non sono inclusi nello snapshot. [Condivisione chat](https://support.claude.com/en/articles/10593882-share-and-unshare-chats)
- **2026-08-03 — [NO DOCUMENTATO] Il report non ha una pagina documento indipendente.** Il link condiviso riguarda la chat/snapshot, non una pagina editoriale con indice e gestione fonti separata. [Condivisione chat](https://support.claude.com/en/articles/10593882-share-and-unshare-chats)

#### D. La cronologia

- **2026-08-03 — [DOC] Le ricerche stanno nella cronologia generale delle conversazioni.** Claude consente ricerca delle chat e gestione della cronologia. [Gestione conversazioni](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)
- **2026-08-03 — [DOC] Le conversazioni si possono rinominare ed eliminare.** È disponibile anche l’eliminazione in blocco in alcuni flussi. [Rinominare/eliminare](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)
- **2026-08-03 — [PARZIALE] È disponibile la ricerca delle chat.** Non è documentato un filtro Research, una griglia di report o metadati come numero fonti e stato. [Gestione conversazioni](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)
- **2026-08-03 — [NV] Raggruppamento e schede dedicate alle ricerche non sono verificati.** Progetti o altre funzioni Claude possono organizzare il lavoro, ma non risultano una libreria specializzata della modalità Research nelle fonti consultate. [Help Center Research](https://support.claude.com/en/articles/11088861-use-research-on-claude)

#### E. La struttura visiva

- **2026-08-03 — [UI] La modalità conserva la gerarchia della chat Claude.** Indicatore blu nel compositore, risposta lunga, titoli nel testo e citazioni in linea; non emerge una cornice visuale autonoma per il report. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [UI] La densità è quella di una colonna conversazionale.** Le prove restano dentro o accanto al testo tramite link, invece di occupare una colonna persistente. [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search)
- **2026-08-03 — [UI] Il blu identifica la modalità Research, non il grado di verifica.** Nessuna fonte descrive colori per stato della singola affermazione. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [DOC] È disponibile su web, desktop e mobile.** La documentazione non descrive differenze di layout fra telefono e desktop. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [NV] Animazioni e transizioni non sono documentate.** Non è possibile stimarne la durata da fonti testuali. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)

#### F. Onestà del prodotto

- **2026-08-03 — [DOC] Anthropic avverte che Claude può allucinare o produrre risposte errate e fuorvianti.** Invita a verificare le fonti citate e ricorda che qualità e contesto della fonte condizionano la risposta. [Risposte errate](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)
- **2026-08-03 — [DOC] La fonte citata può contenere contesto non riportato.** È un’ammissione importante: il collegamento non prova che la frase riassuma correttamente l’intero documento. [Risposte errate](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue raccolto, inferito e verificato.** Non è presente un giudice visibile né un punteggio di sostegno per affermazione. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- **2026-08-03 — [NV] Non è documentato cosa appare quando un ramo fallisce a metà.** La UI può mostrare errori generici, ma le fonti Research non descrivono retry selettivi o recupero. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)

**Pattern più utile da copiare:** citazioni integrate senza interrompere la leggibilità del testo e warning espliciti sulla necessità di verificare le fonti.

**Vuoto utile per TALOS:** trasformare la ricerca da lunga risposta in chat a oggetto persistente, esportabile e ispezionabile con stati probatori.

---

### 1.5 xAI — Grok DeepSearch

**Stato della fonte:** xAI descrive capacità e risultato, mentre l’help X documenta disponibilità, citazioni e limiti generali. I dettagli di UI durante il job provengono in gran parte da walkthrough di terze parti; sono marcati [3P]. [Grok 3](https://x.ai/news/grok-3) · [help X](https://help.x.com/en/using-x/about-grok)

#### A. Attesa e avanzamento

- **2026-08-03 — [DOC] DeepSearch presenta un “summary trace” del processo e produce un rapporto finale.** xAI descrive una traccia sintetica, non la catena di pensiero completa, che riassume come il sistema ha cercato e ragionato su fatti e opinioni in conflitto. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [3P] I walkthrough mostrano un riquadro espandibile con passi di ricerca e pagine analizzate.** Questo è coerente con il “summary trace”, ma il layout preciso non è garantito dalla documentazione ufficiale. [Fastweb](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/) · [Ben’s Bites](https://catalog.bensbites.com/tutorial/use-grok-3-deepsearch-to-do-product-research-on-x)
- **2026-08-03 — [NV] Non è documentata una percentuale, un ETA o un numero di passi residui.** Il conteggio di pagine analizzate non equivale alla quantità di lavoro mancante. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [3P] Un walkthrough mostra un controllo a campana per ricevere una notifica.** Non è stato possibile confermare nelle fonti ufficiali correnti piattaforme, impostazioni o persistenza del job. [Fastweb](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/)
- **2026-08-03 — [NV] Non sono verificati background, stop, pausa e ripresa.** La disponibilità su web/iOS/Android non prova che il job continui dopo l’uscita o che possa essere ripreso. [Help X](https://help.x.com/en/using-x/about-grok)

#### B. Il piano prima di partire

- **2026-08-03 — [DOC, interno] DeepSearch decide autonomamente come cercare, sintetizzare e ragionare su fonti conflittuali.** xAI non dice che il piano venga mostrato prima di partire. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [NV] Non è verificato un piano pre-run modificabile.** I walkthrough partono dal prompt e dalla selezione della modalità. [Fastweb](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/)
- **2026-08-03 — [NV] Non è documentata una fase di domande di chiarimento.** Eventuali domande conversazionali non sono descritte come parte standard del flusso DeepSearch. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [NO DOCUMENTATO] Non mostra costo o tempo stimato prima dell’avvio.** Le fonti ufficiali non descrivono una stima specifica del job. [Grok 3](https://x.ai/news/grok-3)

#### C. Il rapporto finale

- **2026-08-03 — [DOC] Il risultato è un rapporto conciso ma completo nella conversazione.** xAI lo chiama “summary trace” e “comprehensive report”; non descrive un viewer-documento separato. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [DOC] Le risposte che usano web e X includono citazioni cliccabili.** L’utente può aprire la fonte associata. [Help X](https://help.x.com/en/using-x/about-grok) · [Grok 1212](https://x.ai/news/grok-1212)
- **2026-08-03 — [3P] I walkthrough mostrano citazioni o pagine analizzate in una sezione inferiore e follow-up sotto il report.** La resa può variare fra query e versione. [Fastweb](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/) · [Ben’s Bites](https://catalog.bensbites.com/tutorial/use-grok-3-deepsearch-to-do-product-research-on-x)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue pagina intera da snippet.** Il numero di pagine o la lista citazioni non espone profondità di lettura. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [NV] Non è verificato un export del report in PDF, DOCX o Markdown.** Le fonti ufficiali consultate non documentano un comando di esportazione dedicato. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [NV] Non è verificata una pagina propria del rapporto con URL stabile.** Esistono funzioni di condivisione nel perimetro X/Grok, ma la documentazione consultata non definisce il report DeepSearch come documento pubblico autonomo. [Help X](https://help.x.com/en/using-x/about-grok)

#### D. La cronologia

- **2026-08-03 — [DOC] X consente di eliminare la cronologia delle conversazioni Grok.** L’help descrive il controllo per cancellare tutta la cronologia. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [NV] Non sono documentati ricerca, filtri, rinomina, raggruppamento o schede dedicate a DeepSearch.** Non è corretto dedurre queste funzioni dalla sola presenza di una sidebar di chat. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [NV] Non è verificato quali metadati mostri una ricerca passata.** Titolo, data, conteggio fonti, stato e anteprima non sono specificati nelle fonti ufficiali. [Help X](https://help.x.com/en/using-x/about-grok)

#### E. La struttura visiva

- **2026-08-03 — [3P] La UI osservata usa una colonna di chat con riquadro espandibile del processo e rapporto lungo sotto.** Le pagine analizzate e le citazioni sono separate dal corpo ma non in una vera area documentale persistente. [Fastweb](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/)
- **2026-08-03 — [3P] La gerarchia visibile comprende prompt, stato/trace, titoli del rapporto, corpo e citazioni.** Non sono verificabili misure tipografiche universali. [Ben’s Bites](https://catalog.bensbites.com/tutorial/use-grok-3-deepsearch-to-do-product-research-on-x)
- **2026-08-03 — [PARZIALE] Il colore identifica controlli e link, non qualità della prova.** Nessuna fonte descrive stati cromatici per supporto o contraddizione. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [DOC] Grok è disponibile su web, iOS e Android.** Non è documentato come il trace e le fonti si ricompongano su schermo stretto. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [NV] Le animazioni non sono documentate.** Il trace si aggiorna, ma durata e comportamento motion non sono specificati. [Grok 3](https://x.ai/news/grok-3)

#### F. Onestà del prodotto

- **2026-08-03 — [DOC] X avverte che Grok può essere fattualmente errato, riassumere male o omettere contesto.** Invita a verificare in modo indipendente le informazioni. [Help X](https://help.x.com/en/using-x/about-grok)
- **2026-08-03 — [DOC] xAI dichiara che DeepSearch ragiona su fatti e opinioni in conflitto.** La fonte descrive una capacità del sistema, non un indicatore UI che mostri all’utente quali contraddizioni sono state risolte. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [NO DOCUMENTATO] Non distingue verificato, raccolto e inferito.** Il trace può mostrare attività, ma non un verdetto per affermazione. [Grok 3](https://x.ai/news/grok-3)
- **2026-08-03 — [NV] Non è documentato il fallimento parziale.** Non risultano errori per singolo passo, retry selettivo o stato “fonte non raggiungibile” persistente nel report. [Help X](https://help.x.com/en/using-x/about-grok)

**Pattern più utile da copiare:** una traccia sintetica espandibile che rende comprensibile il processo senza obbligare a leggere un log tecnico.

**Vuoto utile per TALOS:** separare nettamente attività da prova, offrire pagina documento, export e cronologia strutturata; non confondere “trace visibile” con verifica.

---
## 2. Lo standard condiviso

Questa sezione include solo pattern dimostrabili in tutti e cinque o, quando la documentazione di uno è insufficiente, chiaramente presenti nella categoria ma marcati come parità prudenziale.

### 2.1 Modalità esplicita, non semplice risposta web

Tutti e cinque presentano la ricerca approfondita come **modalità selezionabile** o agente distinto dalla risposta ordinaria: Deep Research in ChatGPT, Deep Research in Gemini, Research/Advanced Deep Research in Perplexity, Research in Claude, DeepSearch in Grok. L’utente si aspetta quindi un atto esplicito di avvio e uno stato riconoscibile, non un comportamento nascosto dietro lo stesso pulsante di invio. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [Grok](https://x.ai/news/grok-3)

**Standard per TALOS:** il passaggio da preparazione a job deve essere inequivocabile, con nome della modalità, configurazione selezionata e conferma di avvio.

### 2.2 Ricerca multi-step con indicazione che il sistema sta lavorando

Tutti dichiarano una sequenza autonoma di ricerche, letture e sintesi. L’intensità visuale varia: Perplexity mostra fonti e apprendimenti; ChatGPT mostra piano/attività; Grok un summary trace; Gemini e Claude documentano almeno indicatori di lavorazione. Uno spinner senza semantica è ormai sotto la parità, anche se non tutti arrivano a un vero log. [OpenAI](https://openai.com/index/introducing-deep-research/) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Claude](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) · [Grok](https://x.ai/news/grok-3)

**Standard per TALOS:** mostrare almeno fase corrente, quantità di lavoro già compiuto e attività recente, evitando log verbosi non azionabili.

### 2.3 Rapporto finale strutturato, non solo elenco di link

Tutti producono una sintesi lunga con sezioni e collegamenti alle fonti. OpenAI, Gemini e Perplexity hanno superfici documento più nette; Claude e Grok restano più vicini alla chat. La soglia minima attesa è un testo navigabile con titoli, non una bolla monolitica. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [Grok](https://x.ai/news/grok-3)

**Standard per TALOS:** ogni ricerca deve aprirsi come pagina propria, con titolo, sommario, sezioni, stato e metadati del job.

### 2.4 Citazioni cliccabili e fonti ispezionabili

Tutti e cinque associano il rapporto a citazioni o link sorgente. Questo è ormai il requisito di base: un rapporto senza collegamenti puntuali appare meno affidabile anche quando il contenuto è corretto. Nessuno dei cinque, però, trasforma sistematicamente la citazione in un verdetto di sostegno. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) · [Claude](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) · [Grok](https://help.x.com/en/using-x/about-grok)

**Standard per TALOS:** citazione in linea toccabile, apertura della fonte e ritorno al punto del rapporto senza perdere posizione.

### 2.5 Persistenza conversazionale e follow-up

Il rapporto non è un file isolato dal contesto: resta associato a una conversazione/sessione, così l’utente può chiedere correzioni o approfondimenti. La qualità della cronologia varia molto, ma il follow-up contestuale è atteso. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) · [Claude](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) · [Grok](https://help.x.com/en/using-x/about-grok)

**Standard per TALOS:** pagina della ricerca e thread di follow-up devono condividere lo stesso oggetto, senza costringere l’utente a copiare il rapporto in una nuova chat.

### 2.6 Mobile non secondario

Tutti i prodotti sono disponibili almeno su web e mobile; Gemini documenta meglio il passaggio a background/notifica, mentre gli altri sono meno espliciti. Per un’app Android, la continuazione fuori schermata e il ritorno al job non sono un miglioramento opzionale ma una condizione di parità percepita. [Gemini Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [Grok](https://help.x.com/en/using-x/about-grok) · [OpenAI](https://openai.com/index/introducing-deep-research/)

**Standard per TALOS:** job durabile in background, notifica al termine, schermata elenco con stato e riapertura nel punto corretto.

---

## 3. Dove sono tutti deboli

### 3.1 Avanzamento qualitativo ma non misurabile

Nessuno documenta un **progresso quantitativo affidabile** che combini passi completati, lavoro restante ed ETA aggiornato. Le durate generiche — 5–30 minuti, 5–10 minuti, meno di tre o quattro-cinque minuti, 5–15 fino a 45 — non sono una promessa per il job corrente e in alcuni casi sono internamente incoerenti. [OpenAI](https://openai.com/index/introducing-deep-research/) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Claude](https://www.anthropic.com/news/integrations) · [Grok](https://x.ai/news/grok-3)

**Spazio per vincere:** mostrare un intervallo onesto (“circa 6–12 minuti”), il numero di rami e uno stato distinto fra “in coda”, “in lettura”, “in verifica” e “in impaginazione”. Quando l’ETA non è stimabile, dirlo esplicitamente.

### 3.2 Nessuna semantica chiara di pausa, stop e ripresa

ChatGPT consente di interrompere per guidare; Perplexity può fare domande durante il lavoro; Gemini esegue in background. Nessuna documentazione consultata descrive una coppia robusta **Pausa/Riprendi** con stato persistente e conseguenze chiare su costo, fonti già lette e rami incompleti. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://ai.google.dev/gemini-api/docs/deep-research?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [Grok](https://help.x.com/en/using-x/about-grok)

**Spazio per vincere:** tre azioni separate e spiegate: “Ferma e conserva”, “Riprendi”, “Annulla ed elimina il job”.

### 3.3 Citazione presente, ma profondità di lettura invisibile

Nessuno espone per fonte una distinzione verificata fra **pagina letta integralmente**, **estratto recuperato**, **snippet di motore** o **fonte non accessibile**. La UI tende a presentare tutte le citazioni con la stessa forza visiva. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Claude](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) · [Grok](https://help.x.com/en/using-x/about-grok)

**Spazio per vincere:** badge testuale e non ambiguo su ogni fonte: “pagina completa”, “estratto”, “snippet”, “accesso fallito”; filtro della bibliografia per profondità.

### 3.4 Nessun verdetto probatorio per singola affermazione

Tutti collegano fonti; nessuno documenta un sistema visibile che distingua sistematicamente **supportata**, **parzialmente supportata**, **non supportata**, **contraddetta** e **non verificata**. La citazione diventa così una decorazione di fiducia, anche quando il collegamento non sostiene davvero la frase. Le stesse aziende avvertono che possono esistere inferenze errate, contesto omesso o riassunti sbagliati. [OpenAI](https://openai.com/index/introducing-deep-research/) · [Anthropic](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) · [X](https://help.x.com/en/using-x/about-grok)

**Spazio per vincere:** mostrare il giudizio accanto all’affermazione, con motivazione breve, fonti favorevoli/contrarie e possibilità di ri-verifica.

### 3.5 Fallimenti parziali e recupero quasi invisibili

Le documentazioni descrivono l’esperienza ideale ma non mostrano con precisione cosa accade quando un dominio blocca l’accesso, una fonte sparisce, un ramo non trova prove o l’export fallisce. Una segnalazione nella community OpenAI mostra che anche una funzione nominalmente presente, come il PDF, può fallire senza che il design di recupero sia parte della promessa. [Community OpenAI](https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950)

**Spazio per vincere:** mantenere il rapporto parziale, mostrare errore per ramo, spiegare cosa manca e offrire “Riprova solo questo ramo”.

### 3.6 Cronologia ancora centrata sulle chat

Perplexity è l’eccezione più forte con filtri per modalità, progetti e asset versionati. Gli altri trattano la ricerca soprattutto come conversazione passata: titolo e data, ma non necessariamente stato, numero di fonti, qualità della verifica, costo o necessità di ri-verifica. [Perplexity Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) · [OpenAI cronologia](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt) · [Gemini chat](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) · [Claude chat](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)

**Spazio per vincere:** una libreria di ricerche con card operative: titolo, data, stato, rami, fonti, affermazioni supportate, avvisi e azione principale.

### 3.7 Il documento lungo diventa difficile da leggere

La categoria premia report estesi, ma una maggiore lunghezza non garantisce utilità. In discussioni pubbliche alcuni utenti dichiarano di saltare il testo “padded” e usare solo indice, ricerca nel documento e fonti; è un’evidenza aneddotica, non una misura rappresentativa. [Discussione Reddit](https://ca.reddit.com/r/singularity/comments/1p9hrd8/gpt51search_is_superior_to_gemini3progrounding/?sort=old)

**Spazio per vincere:** tre livelli di lettura nello stesso oggetto: sintesi di 30 secondi, conclusioni con stato probatorio, rapporto completo. Non generare tre documenti separati.

### 3.8 Critiche documentate: citazioni e accuratezza non bastano come chrome

- **OpenAI ammette** difficoltà nel distinguere informazioni autorevoli da voci, errori di inferenza e calibrazione debole della fiducia. [OpenAI](https://openai.com/index/introducing-deep-research/)
- **Anthropic ammette** che Claude può allucinare, essere fuorviante e omettere il contesto presente nella fonte citata. [Anthropic](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)
- **X ammette** che Grok può essere errato, riassumere male o omettere contesto. [X Help](https://help.x.com/en/using-x/about-grok)
- **Wired ha documentato** nel 2024 casi Perplexity di dettagli fabbricati e citazioni/riassunti problematici. È critica storica e non prova che la UI 2026 abbia lo stesso comportamento, ma dimostra che l’aspetto “molte fonti” non è una garanzia. [Wired](https://www.wired.com/story/perplexity-is-a-bullshit-machine)
- **Uno studio bibliografico del 2025** su otto chatbot ha rilevato una quota elevata di riferimenti parzialmente corretti, errati o fabbricati. Il test riguardava recupero bibliografico e versioni disponibili agli autori, non le modalità Deep Research 2026; va usato come rischio di categoria, non classifica corrente. [arXiv](https://arxiv.org/abs/2505.18059)

**Conclusione di design:** il vantaggio non è “mostrare più citazioni”, ma **mostrare meglio la relazione fra affermazione e prova**.

---

## 4. Tabella comparativa

Legenda: **Sì** = verificato e documentato; **Parziale** = presente ma incompleto o diverso dalla formulazione; **No doc.** = la documentazione consultata non mostra la funzione; **NV** = impossibile concludere; **Contr.** = fonti correnti contraddittorie.

| Comportamento | ChatGPT Deep Research | Gemini Deep Research | Perplexity Research | Claude Research | Grok DeepSearch |
|---|---|---|---|---|---|
| **A1. Avanzamento visibile** | **Sì** — piano/attività e fonti in tempo reale. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Parziale** — stato compatto; dettaglio dei passi non specificato. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì** — fonti lette, apprendimenti, formazione del report. [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **Parziale** — indicatore di ricerca, non log documentato. [fonte](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) | **Parziale** — summary trace ufficiale; passi UI da walkthrough. [fonte](https://x.ai/news/grok-3) |
| **A2. Percentuale/passi residui** | **No doc.** — durata tipica, nessun residuo. [fonte](https://openai.com/index/introducing-deep-research/) | **No doc.** — 5–10 min generici. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** — attività concreta, non quantità restante. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **No doc.** — 5–15, fino a 45 min generici. [fonte](https://www.anthropic.com/news/integrations) | **No doc.** [fonte](https://x.ai/news/grok-3) |
| **A3. Lasciare la schermata** | **Sì** — si può fare altro mentre lavora. [fonte](https://openai.com/index/introducing-deep-research/) | **Sì** — continua fuori dalla chat. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **NV**. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **A4. Notifica al termine** | **Sì** — canale non dettagliato. [fonte](https://openai.com/index/introducing-deep-research/) | **Sì** — notifica mobile documentata. [fonte](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en) | **NV**. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **Parziale/3P** — campana vista in walkthrough. [fonte](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/) |
| **A5. Stop e ripresa** | **Parziale** — interrompe per guidare, non pausa/ripresa. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **NV** — background, non controllo utente. [fonte](https://ai.google.dev/gemini-api/docs/deep-research?hl=en) | **NV**. [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **B1. Piano prima dell’avvio** | **Sì** — proposto prima del job. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Sì** — piano esplicito. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Parziale** — piano interno iterativo. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **No doc.** — scomposizione interna. [fonte](https://www.anthropic.com/news/research) | **No doc.** — pianificazione interna. [fonte](https://x.ai/news/grok-3) |
| **B2. Piano modificabile** | **Sì**. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Sì** — “Edit plan”. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **NV**. [fonte](https://x.ai/news/grok-3) |
| **B3. Domande di chiarimento** | **Sì**, numero variabile. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Parziale** — collaborazione sul piano, nessun numero. [fonte](https://ai.google.dev/gemini-api/docs/deep-research?hl=en) | **Sì** — richieste ampie e follow-up durante il job. [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **NV**. [fonte](https://x.ai/news/grok-3) |
| **B4. Costo stimato** | **No** — contatore d’uso, non costo job. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **No doc.** [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **No doc.** [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **No doc.** [fonte](https://x.ai/news/grok-3) |
| **B5. Tempo stimato per il job** | **Parziale** — 5–30 min generici. [fonte](https://openai.com/index/introducing-deep-research/) | **Parziale** — 5–10 min generici. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Parziale/Contr.** — meno di 3 e 4–5 min nella stessa guida. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **Parziale** — 5–15, fino a 45. [fonte](https://www.anthropic.com/news/integrations) | **No doc.** [fonte](https://x.ai/news/grok-3) |
| **C1. Forma del rapporto** | **Sì, documento** — viewer fullscreen. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Sì, documento** — Canvas desktop / Open mobile. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì, file** — streaming, editabile, fullscreen. [fonte](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview) | **Chat** — risposta conversazionale. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **Chat** — report e trace. [fonte](https://x.ai/news/grok-3) |
| **C2. Citazioni cliccabili** | **Sì**. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Sì**. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì**. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **Sì**. [fonte](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) | **Sì**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **C3. Vista fonti dedicata** | **Sì** — fonti nel viewer. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Parziale** — gruppi/fonti nel report. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì** — tab/pannelli e sessione con fonti. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **No doc.** — link nel testo. [fonte](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) | **Parziale/3P** — sezione citazioni/pagine. [fonte](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/) |
| **C4. Letta per intero vs frammento** | **No doc.** [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **No doc.** [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **No doc.** [fonte](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) | **No doc.** [fonte](https://help.x.com/en/using-x/about-grok) |
| **C5. Export PDF** | **Sì**. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **No diretto documentato** — export a Docs. [fonte](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en) | **Sì**. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **No doc.** [fonte](https://support.claude.com/en/articles/9450526-export-your-claude-data) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **C6. Export Markdown/DOCX** | **Sì** — Markdown e Word. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Parziale** — copia/Google Docs. [fonte](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en) | **Sì** — Markdown e DOCX. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **No doc.** [fonte](https://support.claude.com/en/articles/9450526-export-your-claude-data) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **C7. Pagina propria** | **Parziale** — fullscreen, legata alla chat. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Parziale** — Canvas nella chat. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì/Parziale** — asset fullscreen nella sessione. [fonte](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview) | **No doc.** — chat snapshot. [fonte](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **C8. Condivisione pubblica** | **Sì** — link snapshot, chiunque col link. [fonte](https://help.openai.com/it-it/articles/7925741-chatgpt-shared-links-faq) | **Sì** — link Canvas. [fonte](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en) | **Sì** — privato/link/organizzazione. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **Sì** — snapshot; ambito dipende account. [fonte](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) | **NV** per report autonomo. [fonte](https://help.x.com/en/using-x/about-grok) |
| **D1. Cronologia ricerche** | **Parziale** — cronologia chat e report recenti. [fonte](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research) | **Sì/Generica** — Recent, se Activity attiva. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì/Dedicata** — History delle sessioni. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **Sì/Generica** — chat. [fonte](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation) | **Parziale** — cronologia esiste, dettagli NV. [fonte](https://help.x.com/en/using-x/about-grok) |
| **D2. Ricerca nella cronologia** | **Sì**. [fonte](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt) | **Sì**. [fonte](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) | **Sì**. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **Sì**. [fonte](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **D3. Filtri/raggruppamento** | **No doc.** specifico DR. [fonte](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt) | **No doc.** specifico DR. [fonte](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) | **Sì** — modalità, ordine, progetti. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **No doc.** specifico Research. [fonte](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |
| **D4. Rinomina/elimina** | **Sì** a livello chat. [fonte](https://help.openai.com/it-it/articles/8809935-how-to-delete-and-archive-chats-in-chatgpt) | **Sì**. [fonte](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) | **Sì** — anche bulk delete. [fonte](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) | **Sì**. [fonte](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation) | **Parziale** — cancellazione totale documentata. [fonte](https://help.x.com/en/using-x/about-grok) |
| **E1. Desktop documento + fonti** | **Sì** — indice/report/fonti. [fonte](https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer) | **Sì** — chat + Canvas. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **Sì** — pannelli/tab + file. [fonte](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview) | **No doc.** — colonna chat. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **Parziale/3P** — chat + trace. [fonte](https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/) |
| **E2. Mobile adattato** | **NV** nel viewer corrente. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **Sì** — report aperto in vista primaria. [fonte](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en) | **Parziale** — mobile disponibile, layout non descritto. [fonte](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) | **Parziale** — mobile disponibile, layout NV. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **Parziale** — mobile disponibile, layout NV. [fonte](https://help.x.com/en/using-x/about-grok) |
| **E3. Colore per affidabilità** | **No doc.** [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **No doc.** [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **No doc.** [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **No doc.** [fonte](https://help.x.com/en/using-x/about-grok) |
| **F1. Ammette limiti/errori** | **Sì** — limiti ufficiali. [fonte](https://openai.com/index/introducing-deep-research/) | **Parziale** — non focalizzato nella guida UI. [fonte](https://gemini.google/overview/deep-research/) | **Parziale** — processo ispezionabile, warning UI non documentato. [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **Sì** — warning esplicito. [fonte](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) | **Sì** — warning esplicito. [fonte](https://help.x.com/en/using-x/about-grok) |
| **F2. Verificato vs raccolto** | **No doc.** [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **No doc.** [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **No doc.** [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **No doc.** [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **No doc.** [fonte](https://x.ai/news/grok-3) |
| **F3. Fallimento per ramo** | **NV**. [fonte](https://help.openai.com/it-it/articles/10500283-deep-research) | **NV**. [fonte](https://support.google.com/gemini/answer/15719111?hl=en) | **NV**. [fonte](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | **NV**. [fonte](https://support.claude.com/en/articles/11088861-use-research-on-claude) | **NV**. [fonte](https://help.x.com/en/using-x/about-grok) |

---
## 5. Raccomandazioni per TALOS

### L1 — parità

1. **Trasformare ogni ricerca in un oggetto con pagina propria.** Motivazione: OpenAI, Gemini e Perplexity hanno già separato il rapporto dalla semplice riga espandibile; restare dentro una lista piatta rende il prodotto meno navigabile. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview)
2. **Eseguire il job in background e notificare il completamento.** Motivazione: Gemini lo documenta esplicitamente su Android e ChatGPT permette di allontanarsi; interrompere la ricerca quando si lascia la schermata viola un’aspettativa già formata. [Gemini Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en) · [OpenAI](https://openai.com/index/introducing-deep-research/)
3. **Mostrare un piano revisionabile prima dell’avvio.** Motivazione: ChatGPT e Gemini rendono l’utente co-autore del perimetro; TALOS possiede già un piano modificabile e deve preservarlo, dandogli più gerarchia e meno aspetto da form tecnico. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en)
4. **Mostrare un avanzamento semanticamente utile.** Motivazione: Perplexity espone fonti lette e apprendimenti, ChatGPT piano e attività; un contatore monospaziato isolato non comunica cosa sta succedendo. [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research)
5. **Aggiungere indice del rapporto e vista fonti separata.** Motivazione: il viewer OpenAI e il Canvas Gemini riducono il costo di orientamento in documenti lunghi. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en)
6. **Rendere ogni citazione toccabile e mantenere il punto di lettura.** Motivazione: le citazioni cliccabili sono presenti in tutti i cinque prodotti e sono il minimo atteso. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) · [Claude](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) · [Grok](https://help.x.com/en/using-x/about-grok)
7. **Offrire PDF oltre a Markdown.** Motivazione: OpenAI e Perplexity esportano direttamente in PDF e formati modificabili; il solo Markdown limita condivisione e uso professionale. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
8. **Creare una cronologia ricercabile e gestibile.** Motivazione: ricerca, rinomina ed eliminazione sono funzioni ordinarie nei concorrenti; Perplexity aggiunge filtri per modalità e progetti. [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread) · [OpenAI](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt) · [Gemini](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en) · [Claude](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)
9. **Conservare il follow-up nello stesso oggetto ricerca.** Motivazione: tutti mantengono un contesto conversazionale dopo il report; la pagina propria non deve diventare un documento morto. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
10. **Progettare esplicitamente il telefono.** Motivazione: Gemini apre il rapporto come vista primaria su mobile; TALOS non deve tentare di comprimere piano, log, report e fonti in una sola colonna simultanea. [Gemini Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en)

### L2 — meglio di loro

1. **Mostrare un ETA come intervallo, con livello di confidenza.** Motivazione: tutti comunicano durate generiche ma nessuno documenta una stima per job; “6–12 min, confidenza bassa” è più onesto di una percentuale fittizia. [OpenAI](https://openai.com/index/introducing-deep-research/) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Claude](https://www.anthropic.com/news/integrations)
2. **Separare “Ferma e conserva”, “Riprendi” e “Annulla”.** Motivazione: la categoria confonde interruzione, steering e cancellazione; un modello di stato esplicito riduce paura di perdere lavoro e costo già sostenuto. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
3. **Mostrare errori per ramo con retry selettivo.** Motivazione: nessun concorrente documenta bene il fallimento parziale; TALOS già pensa per rami e può recuperare senza rilanciare tutto. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://gemini.google/overview/deep-research/)
4. **Marcare i risultati intermedi come provvisori.** Motivazione: Perplexity mostra finding mentre lavora ma non documenta un grado di consolidamento; un badge “provvisorio — non ancora giudicato” evita fiducia prematura. [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
5. **Creare card di cronologia specifiche per ricerca.** Motivazione: titolo, data, stato, numero fonti, rami completati e percentuale di affermazioni supportate sono più utili della sola riga di chat; anche Perplexity non documenta una card con tutti questi dati. [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
6. **Offrire tre livelli di lettura nello stesso report.** Motivazione: sintesi, conclusioni verificate e rapporto completo riducono l’abbandono dei documenti lunghi senza duplicare contenuto. [Discussione utente](https://ca.reddit.com/r/singularity/comments/1p9hrd8/gpt51search_is_superior_to_gemini3progrounding/?sort=old)
7. **Dare un’anteprima reale dell’export.** Motivazione: la presenza nominale del PDF non garantisce resa o affidabilità; anteprima, dimensione, indice e fallback Markdown rendono il flusso controllabile. [Community OpenAI](https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950)
8. **Esporre la provenienza del piano e delle modifiche.** Motivazione: distinguere rami proposti dal modello, aggiunti dall’utente o generati durante la ricerca rende il processo più leggibile di un piano che muta senza storia. [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [OpenAI](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research)
9. **Aggiungere un riepilogo delle contraddizioni.** Motivazione: Grok dichiara di ragionare su fatti conflittuali, ma nessuno documenta una vista che mostri quali fonti dissentono e come è stata risolta la divergenza. [Grok](https://x.ai/news/grok-3)
10. **Usare testo prima del colore per gli stati.** Motivazione: nessuno offre una codifica probatoria matura; etichette come “supportata” e “contraddetta” restano accessibili anche senza percezione cromatica.

### L3 — strutturale

1. **Fare della profondità di lettura un dato di prima classe.** Motivazione: TALOS può mostrare “pagina completa / frammento / snippet / accesso fallito”; nessuno dei cinque documenta questa distinzione visibile. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research) · [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) · [Claude](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) · [Grok](https://help.x.com/en/using-x/about-grok)
2. **Esporre la verifica a tre livelli per ogni affermazione.** Motivazione: i concorrenti mostrano citazioni, non un giudizio strutturato sul sostegno; TALOS può trasformare l’onestà da disclaimer a interfaccia operativa. [OpenAI limiti](https://openai.com/index/introducing-deep-research/) · [Anthropic limiti](https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on) · [X limiti](https://help.x.com/en/using-x/about-grok)
3. **Rendere visibile la separazione autore/giudice senza esporre complessità inutile.** Motivazione: chi scrive non si verifica da solo è una proprietà architetturale che nessun concorrente documenta nella UI; può diventare un segnale di fiducia comprensibile, per esempio “Redatto da… · verificato indipendentemente da…”.
4. **Conservare localmente un archivio cifrato e ricercabile.** Motivazione: una libreria sul dispositivo offre continuità e controllo dei dati che le cronologie cloud non possono replicare nello stesso modo; la UI deve mostrare chiaramente cosa resta locale e cosa è stato condiviso.
5. **Rendere la ri-verifica un ciclo di vita del rapporto.** Motivazione: il pulsante già esistente in TALOS può diventare stato persistente — “verificato il 3 agosto”, “2 fonti cambiate”, “1 affermazione degradata” — mentre i concorrenti trattano il report soprattutto come risultato finale statico.
6. **Consentire recupero offline e ripresa deterministica del job.** Motivazione: l’esecuzione sul dispositivo permette di salvare checkpoint per ramo e riprendere senza ricostruire l’intera ricerca; nessuno dei cinque documenta questo controllo utente.
7. **Aprire una pagina propria per ogni fonte, non solo il browser.** Motivazione: TALOS può unire estratto usato, profondità di lettura, affermazioni collegate, data di accesso, errori e stato di ri-verifica in un’unica scheda locale.
8. **Mostrare un bilancio probatorio prima del testo completo.** Motivazione: “12 supportate, 3 parziali, 1 contraddetta, 2 non verificate” comunica più valore di “56 fonti consultate”, perché misura la tenuta del rapporto e non il volume del processo.

### Flusso raccomandato per Android

1. **Nuova ricerca:** domanda in alto; selezione fonti/modelli/profondità in un pannello progressivo; CTA “Proponi piano”.
2. **Revisione piano:** rami in card riordinabili; stima tempo/costo come intervallo; warning autore/giudice; CTA “Avvia ricerca”.
3. **Job in corso:** header con stato e intervallo ETA; tre tab “Attività”, “Rami”, “Fonti”; azioni “Ferma e conserva” e “Apri in background”.
4. **Elenco ricerche:** card con titolo, data, stato, rami, fonti, bilancio probatorio e avvisi; ricerca e filtri “in corso / da verificare / completate / interrotte”.
5. **Pagina report:** sintesi, bilancio probatorio, indice, contenuto, citazioni toccabili; bottom sheet della fonte sul telefono; tab “Affermazioni” e “Fonti”.
6. **Pagina affermazione:** testo, verdetto del giudice, passaggi citati, fonti favorevoli/contrarie, pulsante “Ri-verifica”.
7. **Pagina fonte:** URL, data, profondità di lettura, passaggio usato, affermazioni collegate e stato di accessibilità.
8. **Export:** anteprima PDF, opzioni copertina/indice/bibliografia, PDF e Markdown; avviso se contiene elementi non verificati.

---

## 6. Cosa NON copiare

1. **Non copiare il report come bolla di chat molto lunga.** Claude e Grok mostrano che una risposta può essere completa ma restare difficile da navigare; TALOS deve usare una pagina documento con indice e viste della prova. [Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude) · [Grok](https://x.ai/news/grok-3)
2. **Non copiare la cronologia generica come unico archivio.** Una ricerca ha stati, fonti, rami ed esiti che una riga di chat non rappresenta; Perplexity indica la direzione corretta con filtri per modalità e progetti. [Perplexity](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
3. **Non copiare il progresso teatrale.** Un flusso di verbi, pagine o “sto analizzando” sembra vivo ma non dice quanto resta né cosa è recuperabile; mostrare meno eventi e più stato operativo.
4. **Non usare il numero di fonti come proxy di qualità.** “56 siti” o “centinaia di fonti” comunica scala, non sostegno; il bilancio delle affermazioni è più utile. [Gemini](https://support.google.com/gemini/answer/15719111?hl=en) · [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
5. **Non dare la stessa forza visiva a tutte le citazioni.** Una pagina completa, uno snippet e una fonte non accessibile non devono apparire equivalenti.
6. **Non mostrare finding intermedi senza etichetta di provvisorietà.** Il pattern Perplexity è utile, ma un risultato emerso a metà non è ancora un risultato verificato. [Perplexity](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
7. **Non confondere “interrompi per dare istruzioni” con “pausa”.** L’utente deve sapere se il job continua, si ferma, conserva il lavoro o perde lo stato. [OpenAI](https://help.openai.com/it-it/articles/10500283-deep-research)
8. **Non nascondere errori parziali dietro un report apparentemente completo.** Se un ramo o una fonte falliscono, conservarli come elementi visibili e azionabili.
9. **Non trattare l’export come una voce finale non verificabile.** Mostrare anteprima e fallback; una segnalazione pubblica dimostra che il PDF può fallire anche quando il comando esiste. [Community OpenAI](https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950)
10. **Non copiare una struttura desktop a tre colonne sul telefono.** Su Android l’indice e le fonti devono diventare viste o bottom sheet, come il passaggio esplicito “Open” di Gemini suggerisce. [Gemini Android](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en)
11. **Non usare solo colore per “buono/cattivo”.** Gli stati probatori devono avere testo, icona e spiegazione; il colore è rinforzo, non contenuto.
12. **Non esporre la catena di pensiero grezza.** Una traccia sintetica di attività è utile; un flusso interno prolisso crea rumore e può suggerire una trasparenza che non coincide con la prova. Il “summary trace” di Grok è il limite massimo utile, non un invito a mostrare tutto. [Grok](https://x.ai/news/grok-3)
13. **Non promettere tempi puntuali usando medie di marketing.** Le cifre ufficiali variano e Perplexity ne pubblica due diverse nella stessa guida; usare intervalli aggiornabili e dichiarare incertezza. [Perplexity](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
14. **Non fare della condivisione pubblica il default.** I link snapshot di categoria sono comodi ma spesso accessibili a chiunque li possieda; per un archivio locale cifrato la scelta deve essere esplicita e revocabile. [OpenAI](https://help.openai.com/it-it/articles/7925741-chatgpt-shared-links-faq) · [Claude](https://support.claude.com/en/articles/10593882-share-and-unshare-chats)

---

## 7. Non verificato

### OpenAI — ChatGPT Deep Research

- Comportamento esatto del viewer 2026 su Android: collasso di indice, fonti e cronologia attività. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- Esistenza di una vera pausa/ripresa del job distinta dall’interruzione per steering. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- Metadati precisi delle schede “recent reports” e disponibilità uniforme su tutti i piani. [OpenAI Academy](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research)
- Resa PDF: indice cliccabile, immagini, bibliografia, note e comportamento in caso di errore. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)
- Indicatore esplicito di fonte letta integralmente rispetto a snippet: non trovato nelle fonti consultate. [Help Center](https://help.openai.com/it-it/articles/10500283-deep-research)

### Google — Gemini Deep Research

- Forma esatta e granularità del progresso durante ogni fase; nessuna specifica di percentuale o passi residui. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)
- Stop, pausa e ripresa dal client consumer. [API](https://ai.google.dev/gemini-api/docs/deep-research?hl=en)
- Export PDF diretto del report testuale: non trovato; è verificato solo export a Docs/copia. [Canvas](https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en)
- Libreria dedicata ai report con filtri per tipo/stato/fonti. [Gestione chat](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en)
- Rappresentazione di un ramo fallito o di fonti insufficienti. [Help Center](https://support.google.com/gemini/answer/15719111?hl=en)

### Perplexity — Research / Advanced Deep Research / Pages

- Continuità del job dopo l’uscita dalla schermata e notifica al termine. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- Controlli stop/pausa/ripresa. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)
- Piano pre-run visibile e modificabile; è documentato solo il piano iterativo interno. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- Stato effettivo di “Convert to Page” al 3 agosto 2026, perché le guide correnti si contraddicono. [Research](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) · [Pages](https://www.perplexity.ai/help-center/en/articles/10352968-perplexity-pages)
- Distinzione full-page/snippet e UI di fallimento per ramo. [Advanced Deep Research](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research)

### Anthropic — Claude Research

- Qualsiasi log o lista di passi durante la modalità Research oltre all’indicatore di ricerca. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- Possibilità di lasciare la schermata, continuazione in background e notifica. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- Piano pre-run, modifica del piano e domande di chiarimento standard. [Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- Viewer dedicato del rapporto, colonna fonti, export PDF/Markdown/DOCX. [Export dati](https://support.claude.com/en/articles/9450526-export-your-claude-data)
- Filtri cronologia specifici per Research e recupero da fallimento parziale. [Gestione conversazioni](https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation)

### xAI — Grok DeepSearch

- Stato corrente della UI mostrata nei walkthrough 2025, perché la documentazione ufficiale non contiene una specifica equivalente. [Grok 3](https://x.ai/news/grok-3)
- Background, notifica ufficiale, stop, pausa e ripresa. [Help X](https://help.x.com/en/using-x/about-grok)
- Piano pre-run, modificabilità e chiarimenti. [Grok 3](https://x.ai/news/grok-3)
- Export in PDF/Markdown/DOCX e pagina pubblica autonoma del report. [Help X](https://help.x.com/en/using-x/about-grok)
- Ricerca, filtro, rinomina e metadati della cronologia DeepSearch. [Help X](https://help.x.com/en/using-x/about-grok)
- UI per profondità di lettura, verdetto per affermazione e fallimento per ramo. [Help X](https://help.x.com/en/using-x/about-grok)

### Non verificato trasversalmente

- Misure tipografiche esatte, griglie, spaziature e durate delle animazioni: le fonti pubbliche non costituiscono design system ispezionabili.
- Differenze fra piani, regioni e test A/B al 3 agosto 2026 per ogni singolo controllo.
- Accessibilità effettiva con screen reader, ordine di focus e contrasto dei report; nessuna fonte consultata offre un audit specifico delle modalità Research.
- Affidabilità quantitativa di notifiche, background ed export; le fonti descrivono disponibilità, non tassi di successo.
- Comportamento in assenza di rete e recupero dopo kill del processo mobile.

---

## 8. Fonti

### OpenAI — ChatGPT Deep Research

- Help Center, “Deep research in ChatGPT”: https://help.openai.com/it-it/articles/10500283-deep-research
- Annuncio, “Introducing deep research”: https://openai.com/index/introducing-deep-research/
- OpenAI Academy, guida Deep Research: https://academy.openai.com/public/clubs/work-users-ynjqu/resources/deep-research
- Help Center, ricerca nella cronologia: https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt
- Help Center, eliminare e archiviare chat: https://help.openai.com/it-it/articles/8809935-how-to-delete-and-archive-chats-in-chatgpt
- Help Center, link condivisi: https://help.openai.com/it-it/articles/7925741-chatgpt-shared-links-faq
- The Verge, viewer fullscreen 2026 [terza parte]: https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer
- Community OpenAI, segnalazione export PDF [testimonianza utente]: https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950

### Google — Gemini Deep Research

- Help Center desktop, “Create in-depth research reports”: https://support.google.com/gemini/answer/15719111?hl=en
- Help Center Android: https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=en
- Help Center, gestione chat desktop: https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en
- Help Center, gestione chat Android: https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DAndroid&hl=en
- Help Center, condivisione ed export Canvas: https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en
- Gemini API, Deep Research: https://ai.google.dev/gemini-api/docs/deep-research?hl=en
- Pagina prodotto Gemini Deep Research: https://gemini.google/overview/deep-research/
- 9to5Google, feedback pubblico Gemini [terza parte]: https://9to5google.com/2026/07/09/gemini-app-feedback/

### Perplexity — Research / Advanced Deep Research / Pages

- Help Center, “What is Research mode?”: https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode
- Help Center, “What’s new in Advanced Deep Research”: https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research
- Help Center, Sessions/Threads: https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread
- Help Center, Pages: https://www.perplexity.ai/help-center/en/articles/10352968-perplexity-pages
- Help Center, Assets: https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview
- Annuncio Deep Research: https://www.perplexity.ai/it/hub/blog/introducing-perplexity-deep-research
- Annuncio Labs: https://www.perplexity.ai/it/hub/blog/introducing-perplexity-labs
- Wired, critica storica [terza parte]: https://www.wired.com/story/perplexity-is-a-bullshit-machine

### Anthropic — Claude Research

- Help Center, “Use Research on Claude”: https://support.claude.com/en/articles/11088861-use-research-on-claude
- Annuncio “Research”: https://www.anthropic.com/news/research
- Annuncio integrazioni e durata: https://www.anthropic.com/news/integrations
- Help Center, web search: https://support.claude.com/en/articles/10684626-enable-and-use-web-search
- Help Center, condivisione chat: https://support.claude.com/en/articles/10593882-share-and-unshare-chats
- Help Center, rinominare/eliminare conversazioni: https://support.claude.com/en/articles/8230524-how-can-i-delete-or-rename-a-conversation
- Help Center, export dati: https://support.claude.com/en/articles/9450526-export-your-claude-data
- Help Center, risposte errate o fuorvianti: https://support.claude.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on

### xAI / X — Grok DeepSearch

- xAI, “Grok 3”: https://x.ai/news/grok-3
- xAI, “Grok 1212”: https://x.ai/news/grok-1212
- X Help, “About Grok”: https://help.x.com/en/using-x/about-grok
- Fastweb, walkthrough DeepSearch [terza parte]: https://www.fastweb.it/fastweb-plus/intelligenza-artificiale/come-usare-deepsearch-di-grok-su-x-da-desktop/
- Ben’s Bites, walkthrough DeepSearch [terza parte]: https://catalog.bensbites.com/tutorial/use-grok-3-deepsearch-to-do-product-research-on-x

### Critiche e ricerca trasversale

- Wired, critica a Perplexity [terza parte, 2024]: https://www.wired.com/story/perplexity-is-a-bullshit-machine
- Studio bibliografico su riferimenti generati da chatbot [ricerca accademica, 2025]: https://arxiv.org/abs/2505.18059
- Discussione utente sulla leggibilità dei report lunghi [aneddotica]: https://ca.reddit.com/r/singularity/comments/1p9hrd8/gpt51search_is_superior_to_gemini3progrounding/?sort=old
- Community OpenAI, problema export PDF [testimonianza utente]: https://community.openai.com/t/deep-research-pdf-export-fails-on-chatgpt-web/1379950

