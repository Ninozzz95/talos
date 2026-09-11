# L6 — cache dei risultati web nella corsa, e budget deterministico per pagina (11/09/2026)

> Lotto **L6** di `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` §7 — «dove Hermes è avanti».
> Lane `lane/harness-desktop`. ⛔ Nessuna rete, nessun giro col modello, nessun contatto col 4174.

---

## 1. La baseline, e che cosa dice davvero

Corsa `deep` vera del desktop, sessione `d2a453a8` (disegno §1): **484.171 token in ingresso,
`cached_tokens: 0`**, **9 ricerche + 14 navigazioni**. Nella tabella §4.2 sono le uniche due righe in
cui Hermes è avanti **a noi e al mobile**: C21 (cache dei risultati fra rami) e C22 (budget per
pagina con spillover su disco).

⛔ **Distinzione che ho tenuto ferma in tutto il lotto, perché confonderla farebbe promettere il
numero sbagliato.** `cached_tokens: 0` è un guasto della cache del **PROMPT** (prefisso esatto, lato
fornitore). Questo lotto attacca il **numeratore** — i 484.171 — togliendo giri e caratteri. Le due
si moltiplicano, e per moltiplicarsi vogliono la stessa cosa: **una chiamata identica deve produrre
byte identici**. Da qui la scelta, scritta in `fetch-cache.mjs`, di non marcare mai «servito dalla
cache» dentro il testo che legge il modello: quel marcatore cambierebbe il prefisso e brucerebbe
proprio la cache che stiamo cercando di far scattare.

⛔ Nota di lettura sul numero di partenza: `session-registry.mjs:1059-1064` distingue apposta
`cached_tokens: null` («non dichiarato») da `0` («dichiarato zero»). Il `0` della baseline è uno zero
**dichiarato**, quindi è un guasto vero e non un dato mancante.

---

## 2. Ricerca web PRIMA di scrivere — fonte + data

⛔ `WebSearch` era **esaurito (200/200)** al primo tentativo, come nella sessione del disegno e in
quella di L3b. Le domande del brief sono state chiuse con `WebFetch` su **fonti primarie**, più una
**misura fatta da me** su un corpus vero. Nessuna riga di questo lotto viene dal training data.

| # | domanda | fonte | data | che cosa ha cambiato nel codice |
|---|---|---|---|---|
| S1 | *web page extraction budget for agents* | **Hermes Agent v0.21**, `website/docs/user-guide/features/web-search.md:47-57`, clone `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21` | letta 11/09/2026 | La forma intera del budget: 15.000 caratteri, **testa ~75% / coda ~25% tagliate sui confini di riga**, footer `[TRUNCATED]` esplicito che dice **il percorso del file e la chiamata esatta** per sfogliare il mezzo, testo conservato **capped a 2 MB**, tetto configurabile e alzabile per chiamata. ⇒ `page-budget.mjs` ha la stessa forma; ciò che **non** ho copiato è il footer che promette una chiamata, perché da noi quella chiamata non esiste (vedi §4). |
| S2 | *LLM tool result caching across sub-agents* | **Hermes Agent v0.21**, stesso file `:65-80` («Result caching») | letta 11/09/2026 | Le cinque regole che ho implementato una per una: chiave `web_search` = query **insensibile a maiuscole e spazi** + fornitore, con i **limiti raggruppati 10/20/50/100** «so near-identical requests share one entry, with each caller receiving its requested count»; chiave `web_extract` = URL + formato + fornitore; richieste identiche **concorrenti coalescite** in una sola («the first caller pays; the rest share the response»); «**Only successful responses are cached. Failures always retry the backend**»; **mai** in cache `localhost`, `*.local`, nomi a etichetta sola e reti private. I due schemi d'uso che nomina sono esattamente i nostri: «subagent fan-outs … and the agent re-checking a page it read minutes ago». |
| S3 | *prompt caching: che cosa fa scattare un hit* | **Anthropic**, [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | letta 11/09/2026 | Il vincolo che governa tutto il lotto: **prefisso esatto e immutabile**, con lookback all'indietro di 20 blocchi. «If your breakpoint is on content that changes every request, cache hits never occur.» ⇒ (a) la finestra del budget è **deterministica**, senza date, senza `toLocaleString`, senza separatori di migliaia; (b) un risultato servito dalla cache torna **byte per byte identico** all'originale e il fatto che venisse dalla cache va nel **registro**, mai nel testo. Altro fatto che uso in §6: **cambiare le definizioni degli attrezzi invalida tools + system + messages**, quindi il diff del kernel non va applicato durante una campagna del banco. |
| S4 | *prompt caching automatico, lato OpenAI-compatibile* | **OpenAI**, [developers.openai.com/api/docs/guides/prompt-caching](https://developers.openai.com/api/docs/guides/prompt-caching) | letta 11/09/2026 | Conferma il nome del campo che il nostro lettore cerca (`usage.input_tokens_details.cached_tokens`, cfr. `context-native-compaction.mjs:9`), il **minimo di 1.024 token** perché un prefisso sia cacheabile e la **finestra di 30 minuti** dall'ultimo uso. ⇒ la ripresa dopo una pausa lunga **non** può contare sulla cache del fornitore: la nostra cache dei risultati è l'unica che sopravvive, ed è la ragione per cui `snapshot()`/`restore()` esistono. |
| S5 | *quanto costa un sistema multi-agente, e dove mettere gli artefatti* | **Anthropic**, [«How we built our multi-agent research system»](https://www.anthropic.com/engineering/multi-agent-research-system) | 13/06/2025, riletta 11/09/2026 | Numeri: gli agenti usano **~4×** i token di una chat, i multi-agente **~15×**. E la duplicazione fra sotto-agenti è indicata come **modo di fallimento osservato**, non come ipotesi. Sulla forma: «artifact systems where specialized agents can create outputs that persist independently … **reduces token overhead from copying large outputs through conversation history**» ⇒ il testo intero va **su disco con un riferimento**, non nel contesto. |
| S6 | *tool result che riempiono il contesto* | **Anthropic**, [«Effective context engineering for AI agents»](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | letta 11/09/2026 | «**Context rot**: as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases», e la ricetta *just-in-time*: «lightweight identifiers (**file paths**, stored queries, web links) and use these references to dynamically load data into context at runtime». ⇒ è la giustificazione del **riferimento** nel marcatore, e la ragione per cui alzare il tetto non è gratis nemmeno quando il contesto ci starebbe. |

⛔ **Che cosa la ricerca ha aggiunto e che dal codice non si vedeva** (è il punto della regola): non la
soluzione — la forma della cache l'avevo in mente — ma **i vincoli**. Tre, e tutti e tre hanno
cambiato il codice: (1) i fallimenti **non** si conservano; (2) gli indirizzi locali **mai**, e da noi
questo significa il **4174**; (3) il risultato servito dalla cache deve essere **identico**, perché il
prefisso esatto è ciò che fa scattare la cache del fornitore. Senza S3 avrei marcato il testo con un
«(dalla cache)» che sembrava onesto e avrebbe fatto danno.

---

## 3. La misura che ha scelto il tetto — 430 pagine vere, non un'opinione

Hermes usa 15.000. Il mobile conserva 20.000 (`collector.mjs:79`). `naviga` nel kernel mostra 4.000
(`talosHarness.mjs:1296`, `uscitaUtile`) e la sintesi 4.000 di sola testa (`synthesis.mjs:59`).
Quattro numeri diversi, nessuno con una misura sotto. Ne ho fatta una.

**Corpus**: le 430 pagine `.md`/`.mdx` di `website/docs` del clone Hermes — pagine **pubblicate sul
web**, non un campione inventato — con gli spazi compattati come fa `trim()` del collettore.

```
mediana 10.688 · p75 15.752 · p90 27.983 · p95 43.899 · max 187.135

tetto      pagine che arrivano INTERE     caratteri coperti
 4.000        30/430   ( 7,0%)                 26,1%
 8.000       130/430   (30,2%)                 47,9%
15.000       313/430   (72,8%)                 69,4%
20.000       357/430   (83,0%)                 76,3%
40.000       403/430   (93,7%)                 89,3%
```

**Che cosa dice.** I 4.000 di oggi consegnano al modello il **26% dei caratteri** e fanno arrivare
intera **una pagina su quattordici**: non è un budget, è un troncone — e nessuno se ne accorge perché
il marcatore non dice quanto manca rispetto al totale. I 15.000 di Hermes cadono quasi esattamente sul
**75° percentile** (15.752): tre pagine su quattro arrivano intere.

**Perché 15.000 e non i 20.000 del mobile**, che coprirebbero di più: è strutturale, non di gusto.
20.000 è il tetto di ciò che si **conserva**. Se il tetto mostrato fosse uguale a quello conservato,
il riferimento «il resto è in …» punterebbe **sempre a zero caratteri residui**, e tutto il
meccanismo sarebbe una bugia cortese. ⇒ **il tetto mostrato deve stare strettamente sotto quello
conservato**. 15.000 < 20.000, e sul desktop il conservato sale a 2 MB (§5, vincolo trovato).

**Quota testa/coda, e perché è l'inverso di `uscitaUtile`.** `uscitaUtile` tiene un quarto in testa e
tre quarti in coda **e ha ragione**: misura l'uscita di una suite di test, dove la diagnosi sta in
fondo (`talosHarness.mjs:1282-1295`). Una pagina web è l'opposto: titolo, apertura e tesi in cima,
note e footer in coda. Stesso meccanismo, quote invertite, e la ragione scritta accanto a tutte e due.

---

## 4. La cura, con file:riga

### Nuovi

| file | che cosa porta |
|---|---|
| `harness-ui/src/research/fetch-cache.mjs` (465 righe) | `talosResearchNormalizeUrl` · `talosResearchNormalizeQuery` · `talosResearchLimitBucket` · `talosResearchFetchKey` · `talosResearchNeverCached` · `talosResearchFetchCache` |
| `harness-ui/src/research/page-budget.mjs` (209 righe) | `TALOS_RESEARCH_PAGE_BUDGET` (15.000) · `TALOS_RESEARCH_HEAD_SHARE` (0,75) · `TALOS_RESEARCH_KEPT_CAP` (2 MB) · `talosResearchPageBudget` |
| `harness-ui/tests/research/fetch-cache.test.mjs` | 27 test |
| `harness-ui/tests/research/page-budget.test.mjs` | 10 test |
| `harness-ui/tests/research/collector-cache.test.mjs` | 13 test — **è la misura** |

**La chiave** (`fetch-cache.mjs:104-190`). URL: schema e host minuscoli, porta di default via,
frammento via (`#sezione` è un punto della stessa pagina), **query ordinata per chiave** (`?b=2&a=1`
è la stessa richiesta di `?a=1&b=2`) ma **mai tolta** (su moltissimi siti `?id=12` e `?id=13` sono due
articoli diversi), barra finale via. ⭐ La barra finale la tolgo **per stare d'accordo con `chiaveDi`
di `synthesis.mjs:124-133`**, che deduplica le fonti allo stesso modo: due identità diverse per la
stessa pagina farebbero cadere la cache esattamente dove la sintesi ha già deciso che si tratta di
una pagina sola. Query: spazi compattati e maiuscole via. Limiti raggruppati 10/20/50/100.
Nella stringa le parti a vocabolario chiuso (tipo, fornitore, formato, gruppo) stanno **prima** e la
parte libera **ultima**, così un `|` dentro una query non può fingersi un confine.

**La cache** (`fetch-cache.mjs:274-465`). Una sola porta, `around(descrittore, produttore)`: serve
dalla memoria, oppure **si accoda a una chiamata identica già in volo** (il primo paga), oppure chiama.
Solo le risposte riuscite si conservano; `null` e le eccezioni si ritentano. LRU con tetto per voce
(2 MB) e tetto complessivo. `stats()` mantiene l'invariante `calls === fetched + served + coalesced`,
provata da un test.

**Scadenza: la corsa, non 20 minuti** (`fetch-cache.mjs:57-73`). È l'unico punto in cui mi sono
scostato da Hermes, di proposito: **un dossier dev'essere coerente**. Due rami che citano la stessa
pagina con due testi diversi perché in mezzo è passata mezz'ora producono un rapporto che si
contraddice da solo, e la contraddizione non sarebbe nemmeno visibile. La freschezza è il mestiere di
`recheck.mjs`, che rilegge apposta e dice **che cosa** è cambiato. `ttlMs` resta configurabile.

**Il contratto di persistenza, dichiarato e non scritto** (`fetch-cache.mjs:415-459`). Questo modulo
**non tocca il disco**: `snapshot()` torna
`{ version: 1, savedAt, entries: [{ key, storedAt, chars, value }] }`, JSON-serializzabile, che
l'orchestratore salverà accanto al giornale; `restore()` è **tollerante** come il giornale — versione
sconosciuta ignorata, voce malformata saltata — perché un formato più nuovo non deve impedire a una
ricerca di **ripartire**, al massimo la fa ripagare.

**Il budget** (`page-budget.mjs:171-209`). Testa + marcatore + coda, tagli portati ai confini di riga
quando ce ne sono (spazio come ripiego, taglio netto se non c'è nemmeno quello: meglio un taglio netto
che una regola che non si applica). ⛔ Il marcatore dice **quanto**, mai **che cosa** — è la lezione
D-10G del 10/09, pagata su `uscitaUtile`, che scriveva «l'elenco completo dei test» su qualunque
troncamento ed è finita sotto gli occhi dell'owner **su una pagina web**.

⛔ **Dove NON ho copiato Hermes: la chiamata per sfogliare il mezzo.** Loro scrivono nel footer la
`read_file` esatta. Da noi quella chiamata **non esiste**: `leggi` non ha né offset né lunghezza
(`talosHarness.mjs:1446-1451`). Scriverla comunque sarebbe un'istruzione che il modello prova e che
fallisce — un giro bruciato per colpa nostra. ⇒ il riferimento è **iniettato dal chiamante**
(`{percorso, chiamata?}`) e, senza, il marcatore dice solo che il testo intero è nel dossier (vero:
ce lo mette il collettore) e **tace** sul come. Un test lo prova al contrario: `assert.doesNotMatch(marker, /leggi\(|read_file|percorso=/)`.

### Modificato — uno solo

`harness-ui/src/research/collector.mjs`, **solo** per far passare cache e budget attraverso `deps`,
come il brief prescrive:

- `:27-46` la nota di testa nuova; `:68-78` `window` / `omitted` / `fromCache` su `TalosResearchSource`;
  `:98-102` `fromCache` su `TalosResearchCollection`; `:104-124` i `deps` nuovi (`cache`, `provider`,
  `budget.{cap,headShare,keep,reference}`).
- `:164-185` `attorno()` — ⛔ **senza cache è la funzione identità sul produttore**: la porta è sempre
  la stessa, così non ci sono due percorsi da tenere allineati e nessun ramo che solo una
  configurazione attraversa (è come nascono i cancelli inerti).
- `:203-235` la lettura passa dalla cache e la fonte si porta dietro `fromCache`.
- `:261-274` `spend` **al netto della cache**, `fromCache` a parte.

**Perché `spend` è al netto.** `spend` è la **spesa**, e `talosResearchSpent` (`run.mjs:230`) la somma
per mostrare quanto è costata la corsa. Una pagina non riaperta **non è stata pagata**: contarla lì
renderebbe invisibile il guadagno proprio nel numero fatto per mostrare il costo. Quanto è arrivato
gratis sta in `collection.fromCache`, così chi legge ha tutte e due le cifre — «16 fonti ottenute, 6
pagate» — e nessuna delle due mente.

⛔ **Asimmetria da dire ad alta voce**: `spend.tokens` **non** è al netto, ed è giusto così. Una
pagina che arriva dalla cache costa zero di rete ma i suoi caratteri **entrano lo stesso nel prompt**.
I token li tagliano il budget e la cache del prompt, non questa cache.

---

## 5. La misura, con dipendenze finte che contano le chiamate

`tests/research/collector-cache.test.mjs`. Quattro rami sulla stessa domanda — com'è fatto un piano
`deep` — sei pagine in tutto, sovrapposizioni che nascono da sole, e il quarto ramo che ripete la
domanda del primo (succede quando due rami sono parafrasi, il caso che `plan.mjs` avvisa di temere).
`search` e `read` sono chiusure che incrementano un contatore: **la rete non viene mai toccata**.

| | senza cache | con cache |
|---|---:|---:|
| ricerche | **4** | **3** |
| letture di pagina | **16** | **6** |
| **chiamate di rete totali** | **20** | **9**  (**−55%**) |
| fonti nel dossier | 16 | 16 (identiche: URL, testo, ordine, provati con `deepEqual`) |
| pagine **pagate** | 16 | 6 |
| pagine **servite** | 0 | 10 |

Il primo ramo paga tutto (4 pagine), il quarto **zero** (4 dalla cache). Ogni fonte sa da sola se è
stata riaperta (`source.fromCache`), quindi il registro non deve dedurlo.

**Caratteri consegnati al modello: oggi non cambiano di un byte, ed è voluto.** Un test dedicato lo
prova: `talosResearchSynthesisPrompt` produce un prompt **identico** con e senza cache e budget. Un
lotto di ottimizzazione che cambia in silenzio ciò che il modello vede non è misurabile, perché due
variabili si muovono insieme. Il cambiamento di ciò che il modello riceve è nel diff §6-A, **non
applicato**, e va deciso con un numero davanti (sotto).

### ⚠️ La proiezione sui token — è aritmetica, NON una misura

I 484.171 token su 23 chiamate d'attrezzo non sono 23 risultati: sono **23 rispedizioni di un
prefisso che cresce**. Con una crescita lineare, `totale = g·n(n+1)/2` ⇒ `g ≈ 484.171/276 ≈ 1.754`
token per giro. Togliendo giri nella stessa proporzione della prova (9/20 = 0,45 ⇒ n' ≈ 10):

```
n = 23  →  484.171 token   (misurato)
n' = 12 →  ~137.000        (−72%)   ┐ proiezione aritmetica
n' = 10 →  ~96.000         (−80%)   ┘ sotto due ipotesi NON verificate
```

⛔ Le due ipotesi: **(a)** il prefisso cresce linearmente; **(b)** la sovrapposizione della corsa vera
è come quella della mia prova. **Nessuna delle due è misurata** — la seconda men che meno: quanto si
sovrappongano davvero i rami di `d2a453a8` non l'ho potuto guardare (il 4174 mi è vietato). Il numero
vero lo dà solo §7. Lo scrivo lo stesso perché dice l'**ordine di grandezza** e perché il
meccanismo — un giro tolto vale molto più del suo risultato — è il motivo per cui questo lotto conta.

---

## 6. La prova al contrario, e il vincolo che ha trovato

⛔ Il brief la chiede per nome: **un passaggio nel mezzo, tagliato**.

Pagina di 51.651 caratteri con `la frase esatta che il modello citera a meta pagina` piantata in
mezzo. Con `budget.keep = TALOS_RESEARCH_KEPT_CAP`:

- `talosResearchLocate(fonte.text, PASSAGGIO)` → **trovato**, e `text.slice(from, to)` restituisce il
  passaggio alla lettera;
- `talosResearchLocate(fonte.window, PASSAGGIO)` → **null**.

⇒ Se la verifica guardasse la finestra, una citazione **onesta** uscirebbe «non trovata»: il prodotto
accuserebbe di invenzione un modello che ha copiato bene. È il verso peggiore in cui si possa
sbagliare, ed è per questo che `source.text` resta il testo intero e la finestra vive in un campo che
si chiama diversamente.

### ⛔⛔ Il vincolo trovato per strada — vale più del resto del lotto

Con il tetto di conservazione del **telefono** (`MAX_CHARS_PER_SOURCE = 20.000`) la stessa citazione
**non si ritrova nemmeno nel testo conservato**: la pagina era già stata tagliata prima, dal
collettore, per una ragione scritta nel suo commento che sul desktop **non vale** («un telefono tiene
l'intero dossier in un database solo»). Sul desktop il dossier sta su disco.

⇒ **Sul desktop `budget.keep` DEVE essere alzato a `TALOS_RESEARCH_KEPT_CAP`.** Se si accendesse il
budget per pagina lasciando il tetto del telefono, il budget **peggiorerebbe la verifica** invece di
lasciarla intatta — e peggiorerebbe in silenzio, perché il sintomo sarebbe «il modello inventa le
citazioni». Il test `col tetto del telefono la citazione si perde PRIMA` lo dimostra e lo blocca.

Altre prove al contrario nei tre file: il **4174 si rilegge sempre** (due letture, due chiamate);
una risposta fallita **non** si conserva (né eccezione né `null`); un'istantanea di versione
sconosciuta **si ignora** senza far fallire la ripresa; una voce malformata si salta e le altre
rientrano; lo sfratto toglie la **meno usata di recente**, non la più vecchia; il marcatore **non**
inventa la chiamata.

---

## 7. I diff proposti — esatti, e NON applicati

⛔ Tutti e quattro toccano file che il brief mi vieta o non mi assegna. Li scrivo perché siano
applicabili così come sono, non perché li applichi io.

### A — `src/research/synthesis.mjs` — far leggere la finestra al costruttore del prompt

Finché questo non entra, **il budget è calcolato e non letto**, cioè inerte. Lo dico qui perché è
esattamente il difetto che questo repo ha già pagato («IL CANCELLO SEMANTICO ERA SPENTO DA SEMPRE»).

```diff
@@ src/research/synthesis.mjs:30-38 @@
+import { TALOS_RESEARCH_PAGE_BUDGET, talosResearchPageBudget } from './page-budget.mjs';
@@ src/research/synthesis.mjs:58-59 @@
-/** Quanto di una fonte entra nel prompt. Oltre questo è imbottitura. */
-const PROMPT_CHARS_PER_SOURCE = 4_000;
+/*
+ * L6 — il budget vive in `page-budget.mjs`, misurato su 430 pagine vere. Qui
+ * resta solo il ripiego per le fonti che arrivano da un dossier vecchio, dove
+ * nessuno aveva calcolato la finestra.
+ */
@@ src/research/synthesis.mjs:151-157 @@
-    source.text.slice(0, PROMPT_CHARS_PER_SOURCE),
+    source.window ?? talosResearchPageBudget(source.text, { cap: TALOS_RESEARCH_PAGE_BUDGET }).window,
```

⛔ **Decisione da prendere con un numero davanti, non un dettaglio.** Oggi la sintesi manda 4.000
caratteri **di sola testa** per fonte: su sei fonti, 24.000 caratteri ≈ **6.000 token**. Col budget
diventano 15.000 testa+coda: 90.000 caratteri ≈ **22.500 token**, cioè **+16.500 token una volta per
corsa** — il **+3,4%** sulla baseline di 484.171 — in cambio di **3,75× più prove** e della coda che
oggi non arriva mai. Vale, ma è denaro dell'owner: **decide lui**.

### B — kernel, ramo `naviga` (`src/kernel/talosHarness.mjs:6920-6930`)

```diff
                 else if (nome === 'naviga') {
                     try {
-                        const pagina = await leggiPaginaSicura(argomenti.url ?? '')
-                        esito = `HTTP ${pagina.stato} · ${pagina.url}\n${uscitaUtile(pagina.corpo, 4_000, 0.25)}`
+                        const chiedi = () => leggiPaginaSicura(argomenti.url ?? '')
+                        const letta = cacheWeb
+                            ? await cacheWeb.around({ kind: 'extract', url: argomenti.url ?? '', provider: 'naviga' }, chiedi)
+                            : { value: await chiedi(), fromCache: false }
+                        const pagina = letta.value
+                        // ⛔ `letta.fromCache` NON entra in `esito`: byte identici, o la cache
+                        //    del prompt del fornitore (prefisso esatto) si azzera.
+                        const finestra = talosResearchPageBudget(pagina.corpo, {
+                            cap: TALOS_RESEARCH_PAGE_BUDGET,
+                            headShare: TALOS_RESEARCH_HEAD_SHARE,
+                            reference: onDepositoPagina ? await onDepositoPagina(pagina.url, pagina.corpo) : null,
+                        })
+                        esito = `HTTP ${pagina.stato} · ${pagina.url}\n${finestra.window}`
                     }
```

più, nella stessa firma di `talosLavora` accanto a `ricercaWeb` (`:5719`) e `richiediRicercaFn`
(`:5859`), due parametri **opzionali** — comportamento bit-per-bit identico a oggi quando mancano,
come già fatto per i tre di `ATTREZZI_ESTESI`:

```diff
     ricercaWeb, // {provider, apiKey?, endpoint?} — usato solo se 'web_search' è in strumentiEstesi
+    cacheWeb, // talosResearchFetchCache() della corsa, o niente: senza, ogni pagina si riapre come oggi
+    onDepositoPagina, // (url, corpo) => {percorso, chiamata?} | null — dove il testo intero è stato depositato
```

e l'inoltro al planner (`:6197`), **da non dimenticare**: senza, il planner cerca fuori dalla cache
della corsa e ripaga le stesse pagine.

```diff
-            ricercaWeb, richiediRicercaFn,
+            ricercaWeb, richiediRicercaFn, cacheWeb,
```

### C — kernel, ramo `web_search` (`:6931-6948`)

```diff
-                            const risultati = await eseguiRicercaWeb(
-                                argomenti.query ?? '', argomenti.maxResults, ricercaWeb,
-                                ...(richiediRicercaFn ? [richiediRicercaFn] : []),
-                            )
+                            const cerca = () => eseguiRicercaWeb(
+                                argomenti.query ?? '', argomenti.maxResults, ricercaWeb,
+                                ...(richiediRicercaFn ? [richiediRicercaFn] : []),
+                            )
+                            const risultati = cacheWeb
+                                ? (await cacheWeb.around({
+                                    kind: 'search', query: argomenti.query ?? '',
+                                    limit: argomenti.maxResults, provider: ricercaWeb?.provider,
+                                }, cerca)).value
+                                : await cerca()
```

### D — `src/research/ledger.mjs` — il campo che il brief chiede di proporre

Additivo: `read` **non cambia semantica** (resta «fonti ottenute con `obtained: 'page'`»), e accanto
compare quante di quelle non sono state riaperte.

```diff
@@ TalosResearchLedgerEvidence @@
- * @property {readonly { obtained?: 'page' | 'snippet' }[]} [sources]
+ * @property {readonly { obtained?: 'page' | 'snippet', fromCache?: boolean }[]} [sources]
@@ TalosResearchLedgerSummary @@
   * @property {number} read ⛔ Pagine APERTE davvero, contate dalle fonti — non passi `read`.
+  * @property {number} cached ⛔ Di quelle, quante NON sono state riaperte: le aveva già
+  *   pagate un altro ramo della stessa corsa. «9 pagine, 4 servite dalla cache» dice una
+  *   cosa che «9 pagine» non dice.
@@ talosResearchLedger @@
             read: (evidence.sources ?? []).filter((s) => s.obtained === 'page').length,
+            cached: (evidence.sources ?? []).filter((s) => s.obtained === 'page' && s.fromCache).length,
```

Un test mio già prova che l'evidenza arriva con il campo e che `summary.read` resta 16: l'aggancio è
pronto, manca solo la riga.

### ⛔ Quando NON applicare B e C

Cambiare lo schema o l'uscita degli attrezzi **invalida la cache del prompt di tutto** (tools →
system → messages, fonte S3) e cambia il profilo di token che TALOS-BANCO misura. ⇒ non durante una
campagna, e comunque non prima che il banco «giri alla perfezione» (owner, 11/09).

---

## 8. La misura vera su `cached_tokens` — il comando, per l'owner

⛔ Non l'ho eseguita e non potevo: il 4174 mi è vietato e serve un giro **a pagamento**.

```powershell
# 1) PRIMA — la baseline è già in archivio (sessione d2a453a8)
curl.exe -s http://127.0.0.1:4174/api/v1/sessions -o "$env:TEMP\l6-prima.json"

# 2) applicare i diff §7-A/B/C, riavviare il 4174

# 3) DOPO — stessa identica domanda, stesso modello, stessa profondità
#    (dalla chat: «ricerca approfondita» su glm-5.3-flash, profondità `deep`)

# 4) rileggere
curl.exe -s http://127.0.0.1:4174/api/v1/sessions -o "$env:TEMP\l6-dopo.json"
```

Nei due file, per la sessione in questione, i campi da confrontare sono
`usageSessione.prompt_tokens` e `usageSessione.cached_tokens`
(`session-registry.mjs:1048-1068`, esposti da `GET /api/v1/sessions`).

**Le quattro guardie, o il confronto non vale** — sono le stesse che questo repo ha già pagato con
una campagna buttata: **stessa domanda** (verbatim) · **stesso modello e stessa quota**
(`glm-5.3-flash`, decisione owner 09/09) · **stessa profondità e stesso numero di rami approvati** ·
**stessa versione del corpus**. E ⛔ `cached_tokens: null` **non è** `0`: il primo è «il fornitore non
l'ha dichiarato», il secondo è «zero dichiarato» (`session-registry.mjs:1059-1064`).

Chiude se: `cached_tokens > 0`, `prompt_tokens` sceso, **e** il numero di ricerche/navigazioni nel
registro è sceso della stessa proporzione delle chiamate — se scendono i token ma non le chiamate, il
merito è della cache del **prompt** e non di questo lotto, e va detto.

---

## 9. La suite

```
node --test tests/research/*.test.mjs          →  tests 325   pass 325   fail 0
node --test tests/*.test.mjs tests/research/*.test.mjs
                                               →  tests 2685  pass 2685  fail 0
```

- **I miei: 50 su 50 verdi** (27 cache + 10 budget + 13 misura), più i **7 del mobile intatti** — il
  collettore resta un porto fedele quando nessuno gli passa cache o budget.
- ⭐ **I 7 rossi che L3b attribuiva ai lotti L1/L2 non ci sono più**: la suite completa è **tutta
  verde**. ⛔ E l'ho contata **due volte di fila** prima di scriverlo, perché un conteggio raccolto
  mentre un altro agente scrive non è una misura: 2685/2685 entrambe le volte. Al momento della
  seconda, `git status` mostrava in scrittura da altri solo `src/research-store.mjs`.

---

## 10. Cosa NON ho verificato — per nome

1. **`cached_tokens` non l'ho misurato.** Il numero che chiude il lotto è in §8 e lo lancia l'owner.
   Tutto ciò che dico sui token oltre §5 è **aritmetica dichiarata**, non misura.
2. **Quanto si sovrappongano davvero i rami della corsa vera.** La mia prova costruisce la
   sovrapposizione (16 letture su 6 pagine). Che `d2a453a8` si sovrapponga così **non lo so**: per
   saperlo servirebbe leggere i suoi eventi dal 4174, che mi è vietato. ⇒ il **−55%** è vero sulla
   mia prova, **non** è una previsione sulla corsa vera.
3. **Il budget è calcolato e non ancora letto da nessuno.** Finché §7-A non entra, ciò che il modello
   riceve è **identico a oggi** — l'ho provato apposta. La metà «budget» di L6 **non è chiusa**.
4. **Nessun diff applicato al kernel, a `synthesis.mjs`, a `ledger.mjs`.** Scritti, non eseguiti: non
   li ho nemmeno compilati nel contesto vero, quindi sono **da rileggere** prima di applicarli.
5. **Nessuna persistenza.** `snapshot()`/`restore()` sono provati in memoria, andata e ritorno via
   `JSON.parse(JSON.stringify(...))`. Che l'orchestratore li salvi accanto al giornale e li ritrovi
   dopo un riavvio **è L4**, e non l'ho toccato.
6. **Nessuna rete, mai.** Che `search`/`read` veri si comportino come i finti non è provato da niente
   qui dentro — in particolare **non so** se i nostri estrattori restituiscano `null` o lancino sui
   casi limite, e la cache tratta le due cose diversamente (entrambe non conservate, ma solo la
   seconda propaga).
7. **`duckduckgo-search.mjs` non l'ho toccato**, e l'ho deciso invece di dimenticarlo: agganciare la
   cache lì coprirebbe **un solo fornitore** e **solo** il percorso senza chiave. La cache sta sopra
   il fornitore, come in Hermes, dove la chiave **contiene** il fornitore.
8. **Nessuna prova visiva**: in questo lotto non c'è UI. Quando il registro mostrerà «di cui N dalla
   cache» (diff §7-D) quella riga andrà guardata in **chiaro e scuro**, e non l'ho fatto perché la
   riga non esiste ancora.
9. **La rassegna dei prodotti chiusi** (OpenAI Deep Research, Gemini, Perplexity) resta quella del
   disegno: `WebSearch` era esaurito anche oggi, quindi **non** l'ho estesa.
