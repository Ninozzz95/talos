# Modelli locali da Hugging Face — ricerca e piano

Data: 2026-07-31
Ordine: priorità assoluta subito dopo la fase B (owner, `phase-order-change`).
Stato: ricerca fatta, piano proposto. Nessuna riga scritta ancora.

---

## 1 · La documentazione, ridotta a ciò che ci serve

**Scaricare un file.** `https://huggingface.co/{repo}/resolve/{revision}/{file}`
è una GET normale che redirige al CDN. Accetta `Range`, quindi **il ripristino
di un download interrotto è HTTP standard**, non una libreria. Non ci serve
`huggingface_hub` (è Python) — ci serve il contratto, e il contratto è banale.

**Elencare.** `GET /api/models?filter=gguf&search=…` per cercare,
`GET /api/models/{repo}/tree/{revision}` per i file di un repo. Un repo GGUF
contiene **molte quantizzazioni dello stesso modello**: scaricarne uno solo non è
un'ottimizzazione, è l'unico comportamento corretto su un telefono.

**Modelli chiusi (gated).** Token `Bearer`, accettazione della licenza per
modello, quasi sempre approvata in pochi secondi. Il token è dell'utente.
Vincolo D0: **nessuna chiave nell'APK** — il token sta dove stanno le chiavi dei
provider, cifrato, e la funzione senza token deve funzionare lo stesso sui
modelli aperti.

**Quantizzazioni.** Consenso 2026: `Q4_K_M` è il punto di equilibrio sotto gli
8 GB di RAM (~4,5 GB per un 7B), `Q5_K_M` sopra. E la regola che conta:
*prendi la quantizzazione più alta che entra, lasciando spazio alla KV cache e
al contesto* — più **un modello più grande a quantizzazione più bassa batte quasi
sempre un modello piccolo a quantizzazione alta**.

## 2 · Cosa fanno i competitor — il pavimento della parità

PocketPal, LM Studio Mobile, SmolChat, ChatterUI fanno tutti la stessa cosa:
cerchi su HF, vedi una lista di file, ne scegli uno, si scarica, lo gestisci.
PocketPal arriva anche ai modelli chiusi col token.

**Il difetto che condividono tutti**: ti mostrano un elenco di nomi di file —
`…Q4_K_M.gguf`, `…Q5_K_M.gguf`, `…Q8_0.gguf` — e ti lasciano indovinare. La
domanda vera non è «quale file voglio», è **«questo gira sul mio telefono?»**, e
nessuno di loro la risponde. La guida più diffusa la risponde con una regola del
pollice su una tabella di RAM.

## 3 · I vincoli Android, che decidono la forma

- **WorkManager con foreground worker** è la via raccomandata per download
  lunghi; `DownloadManager` non sa riportare un progresso granulare.
- **Android 16**: i worker lunghi con foreground service consumano la quota di
  job dell'app — potrebbe servire un foreground service diretto.
- **Scoped storage**: cartella privata dell'app, nessun permesso da chiedere.
- **Capacitor**: un download da 4 GB **non può passare dalla WebView**. Serve un
  plugin nativo. È il pezzo che decide il calendario, non l'API di HF.

## 4 · Il one-up — dove li superiamo, e perché possiamo

**L3 — «gira sul MIO telefono?», risposta misurata.**
TALOS ha già specificata la scoperta hardware VIVA con callback termico e il
benchmark che arbitra fra motore nativo e WebGPU (M1-M8b,
`talos-model-catalogue-spec`). Quindi la regola del pollice degli altri per noi è
**calcolabile**: RAM reale, spazio libero reale, margine termico reale, meno la
KV cache del contesto che l'utente usa davvero. Il catalogo non mostra un elenco
di file: **ordina le quantizzazioni per questo telefono e dice quale striscerà**.
Nessuno può copiarlo senza avere un client nativo che misura il dispositivo.

**L2 — un download che sopravvive al telefono.** Ripristino per `Range` **più
verifica sha256 contro l'hash dichiarato da HF**. Un file da 4 GB troncato non
deve mai diventare in silenzio un modello che produce spazzatura: è il modo in
cui questi errori si manifestano, e il modo in cui nessuno se ne accorge.

**L2 — due porte** (regola dell'owner su tutte le funzioni): il centro modelli
**e** un tool, così in chat puoi dire «voglio un modello che funzioni offline» e
lui propone, spiega il costo in spazio, e scarica con la tua approvazione.
Nessun competitor ha la porta della chat.

**Vincoli portati dentro**: niente elenco cablato nell'APK
(`app-distributed-nothing-static`) — catalogo remoto firmato con ripiego onesto;
nessuna chiave nell'APK (D0); e il centro modelli è una **stazione**, quindi
segue le stesse regole di ogni altra stazione.

## 5 · Le fette, in ordine, ognuna verificabile

1. **Il client HF, puro.** Ricerca, elenco file di un repo, parsing dei nomi in
   `{modello, quantizzazione, byte}`. Nessuna rete nei test, nessun permesso.
2. **La matematica del «ci entra?».** Pura: byte del file + KV cache stimata dal
   contesto → verdetto contro RAM/spazio misurati. È il one-up, ed è la fetta
   più testabile di tutte.
3. **Il plugin nativo di download.** Foreground worker, `Range`, ripresa,
   progresso, cancellazione, sha256 alla fine. Il pezzo lungo.
4. **La stazione.** Catalogo, verdetti per questo telefono, gestione dello
   spazio, cancellazione.
5. **Il tool.** La seconda porta.
6. **Il token per i modelli chiusi.** Dove stanno le chiavi, con la licenza
   accettata su HF dall'utente.

Le fette 1 e 2 non hanno bisogno di niente: né chiavi, né plugin, né rete.
Si parte da lì.

## 6 · Su ultracode

La **ricerca** di questa fase si divide bene. La **costruzione** no: è una
catena — scoperta → download → verifica → storage → catalogo → motore — e venti
agenti su una catena producono conflitti, non velocità. Ultracode serve alla
piattaforma agentica, che è **larga**; qui servirebbe solo a fare rumore.
