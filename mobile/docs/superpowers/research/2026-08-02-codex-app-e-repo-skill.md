# La Codex app di OpenAI, e i repository di skill che esistono già

> **Ricerca per la piattaforma agentica di TALOS.** Data: 2026-08-02.
> Documento di analisi, non di implementazione. Nessun file in `mobile/src/` è stato toccato.
> Committente: owner AVM/TALOS. Metodo: fonti primarie, verificate una per una.

---

## 0. Come è stata fatta questa ricerca, e cosa non è confermato

La regola di rigore imposta è: **niente cifre di seconda mano**. Va detto subito come
sono state ottenute, perché il valore di questo documento sta lì.

**Le fonti primarie sono state aperte davvero.** `openai.com` restituisce 403 al
fetcher standard; le pagine sono state scaricate con `curl` e uno user-agent di
browser, poi ridotte a testo e lette per intero. Le pagine di documentazione
(`developers.openai.com/codex/*`) rispondono con un redirect 308 permanente verso
`learn.chatgpt.com/docs/*`: è il redirect che ha rivelato, da solo, uno dei fatti
più interessanti di questa ricerca (§1.1).

**I numeri sui repository non vengono da blog.** Stelle, fork, data dell'ultimo
push, licenza e conteggio delle skill sono stati presi dalle API di GitHub
autenticate (`gh api`) e dai file grezzi su `raw.githubusercontent.com`. Dove
scrivo un conteggio, indico il metodo con cui l'ho ottenuto. Le licenze non sono
state dedotte dal campo `license` dell'API — che su entrambi i repo ufficiali
vale `null` — ma **leggendo il testo di ogni singolo file di licenza**.

**Limite dichiarato.** Il budget di ricerca web di questa sessione era esaurito in
partenza; le ricerche sono state fatte via `curl` sull'endpoint HTML di
DuckDuckGo e via API di GitHub e Hacker News. Questo non ha limitato l'accesso
alle fonti primarie, ma significa che la copertura dei *forum* è meno esaustiva
di quella della documentazione. Dove non ho potuto aprire una fonte, scrivo
**non confermato** e mi fermo lì.

**Una cifra di seconda mano non ne troverete.** Ogni numero in questo documento
proviene dalla pagina che lo pubblica, e l'URL è accanto.

---

# PARTE 1 — La Codex app di OpenAI

## 1.1 La cosa che nessun riassunto dice: «la Codex app» non esiste più come tale

Il comunicato che l'owner ha indicato è del **2 febbraio 2026**
([openai.com/index/introducing-the-codex-app](https://openai.com/index/introducing-the-codex-app/)).
Ma quel comunicato **è stato modificato dopo la pubblicazione**, e porta in cima
una riga che non c'era: *«March 4, 2026 update: The Codex app is now available on
Windows.»* Questo è il primo indizio che si sta guardando un prodotto in
movimento, non un annuncio fermo.

Il secondo indizio è più forte. Oggi, 2 agosto 2026, la pagina di documentazione
canonica dell'app — `developers.openai.com/codex/app` — **reindirizza in modo
permanente (HTTP 308) a `learn.chatgpt.com/docs/app`**, e quella pagina non si
intitola più «Codex app». Si intitola **«ChatGPT desktop app»**, sottotitolo
*«Your command center for complex work»*
([learn.chatgpt.com/docs/app](https://learn.chatgpt.com/docs/app)). Nel
quickstart, il passo 4 recita testualmente: *«Choose ChatGPT or Codex. In
ChatGPT, use the toggle above the composer to select Chat or Work. In Codex,
start with New chat.»*

Il terzo indizio è una data esatta, che OpenAI pubblica nel proprio registro
delle novità: *«On July 9, the Codex app merged into the ChatGPT desktop app for
macOS and Windows. Codex keeps its dedicated coding experience alongside
ChatGPT's Chat and Work.»*
([learn.chatgpt.com/docs/whats-new](https://learn.chatgpt.com/docs/whats-new),
sezione 6–10 luglio 2026). Stessa pagina: *«The updated desktop app is available
globally on every ChatGPT plan, including Free.»*

**Cosa è successo, in chiaro.** In cinque mesi e una settimana OpenAI ha lanciato
un'app dedicata all'agente di coding (2 feb), l'ha portata su Windows (4 mar), le
ha aggiunto un telecomando mobile (14 mag), e poi **l'ha riassorbita dentro
l'app ChatGPT desktop** (9 lug), dove «Codex» è diventata una modalità accanto a
«Chat» e «Work». La superficie separata è durata **158 giorni**.

**Perché conta per TALOS.** Il vincolo *«economise existing sections»* — le
funzioni nuove sono sezioni di superfici esistenti, non app nuove — non è una
preferenza estetica dell'owner. È la stessa conclusione a cui è arrivata OpenAI
con molte più risorse, dopo aver provato la strada opposta e aver fatto
marcia indietro. La piattaforma agentica di TALOS deve nascere come sezione,
non come seconda app.

### Le tre date, e i tre prodotti diversi che portano lo stesso nome

| Data | Cosa è uscito davvero | Fonte primaria |
|---|---|---|
| **2 feb 2026** | Codex app **per macOS**. Nessun iOS, nessun Android, nessun Windows | [introducing-the-codex-app](https://openai.com/index/introducing-the-codex-app/) |
| **4 mar 2026** | Windows, annunciato come update in testa allo stesso comunicato | stessa pagina |
| **14 mag 2026** | Codex **dentro l'app ChatGPT mobile**, in preview, iOS e Android | [work-with-codex-from-anywhere](https://openai.com/index/work-with-codex-from-anywhere/) |
| **9 lug 2026** | La Codex app **viene fusa** nella ChatGPT desktop app. Codex diventa una modalità | [whats-new](https://learn.chatgpt.com/docs/whats-new) |
| **ago 2026** | La documentazione canonica dell'app si intitola «ChatGPT desktop app» | [learn.chatgpt.com/docs/app](https://learn.chatgpt.com/docs/app) |

Chi legge solo il comunicato di febbraio si costruisce un'immagine sbagliata del
prodotto di oggi. È il motivo per cui il compito chiedeva di **verificare**, non
di riassumere.

## 1.2 Cosa fa esattamente l'app, e su cosa gira

Dal comunicato primario, con le parole di OpenAI:

> *«Today, we're introducing the Codex app for macOS—a powerful new interface
> designed to effortlessly manage multiple agents at once, run work in parallel,
> and collaborate with agents over long-running tasks.»*

Le quattro funzioni che il comunicato mette in vetrina sono:

**Agenti in parallelo.** *«Agents run in separate threads organized by projects»*,
con *«built-in support for worktrees, so multiple agents can work on the same repo
without conflicts. Each agent works on an isolated copy of your code»*. La
documentazione conferma tre scelte all'apertura di una chat: **Local** (*«work
directly in your current project directory»*), **Worktree** (*«isolate changes in
a Git worktree»*), **Cloud** (*«run remotely in a configured cloud environment»*),
e precisa che *«Both Local and Worktree chats run on your computer»*
([learn.chatgpt.com/docs/environments/modes](https://learn.chatgpt.com/docs/environments/modes)).

**Skill.** *«Codex is evolving from an agent that writes code into one that uses
code to get work done on your computer.»* Le skill sono il tema della Parte 2 di
questo documento; qui basta registrare che OpenAI le ha messe al centro
dell'annuncio dell'app, non in fondo.

**Automations.** Istruzioni + skill opzionali, eseguite su una schedule definita
dall'utente; *«When an Automation finishes, the results land in a review queue»*.
Con un limite che OpenAI dichiara da sé nel paragrafo «What's next»: stanno
costruendo *«Automations with support for cloud-based triggers, so Codex can run
continuously in the background—not just when your computer is open»*. Tradotto:
alla data del comunicato, **le Automations si fermano quando chiudi il portatile**.

**Personalità.** Due stili — *«a terse, pragmatic style and a more
conversational, empathetic one»* — selezionabili con `/personality`, e OpenAI
specifica *«without any change in capabilities»*.

## 1.3 La divisione del lavoro fra dispositivo e cloud

Questa è la domanda che l'owner ha posto e che merita una risposta netta, perché
è l'asse su cui TALOS si differenzia.

**Sul dispositivo gira l'esecuzione. Nel cloud gira il modello. Sempre.**

L'app desktop esegue localmente: legge e scrive i file del progetto, lancia
comandi shell, gestisce i worktree git, applica il sandbox del sistema
operativo. Ma **il ragionamento non è mai locale**: ogni turno è una chiamata ai
modelli GPT-5.6 sui server di OpenAI. Non esiste una modalità in cui l'app
desktop ragiona senza rete.

C'è una sfumatura che vale la pena registrare, perché è l'unica apertura: la
Codex **CLI** accetta provider di modello alternativi. Il riferimento di
configurazione documenta `model_provider`, `model_providers.<id>.base_url`,
`model_providers.<id>.env_key`, e dichiara che *«Built-in provider IDs (`openai`,
`ollama`, and `lmstudio`) are reserved and cannot be overridden»*
([config-reference](https://learn.chatgpt.com/docs/config-file/config-reference)).
Quindi Ollama e LM Studio sono provider di prima classe nella CLI. Con un
paletto che ne limita molto la portata: `model_providers.<id>.wire_api` ha
*«`responses` is the only supported value»* — il provider locale deve parlare la
Responses API di OpenAI, non un dialetto qualsiasi.

**Non confermato:** la documentazione aperta non dichiara da nessuna parte che
l'app desktop (a differenza della CLI) esponga la stessa scelta di provider, né
che Codex funzioni interamente offline. Non lo deduco: lo lascio come non
confermato.

## 1.4 Punti di forza, con la prova accanto

**1. Il parallelismo è architetturale, non cosmetico.** I worktree git non sono
una vista: sono copie isolate del codice. *«Each agent works on an isolated copy
of your code, allowing you to explore different paths without needing to track
how they impact your codebase»*, e *«you can check out changes locally or let it
continue making progress without touching your local git state»*
([comunicato](https://openai.com/index/introducing-the-codex-app/)). È la
differenza fra «più chat aperte» e «più agenti che non si pestano i piedi».

**2. La continuità fra superfici è reale, non promessa.** *«The app picks up your
session history and configuration from the Codex CLI and IDE extension, so you
can immediately start using it with your existing projects.»* E per le skill:
*«When you create a new skill in the app, Codex can use it wherever you work: in
the app, CLI or in your IDE extension.»* Questa è, di fatto, la **dottrina delle
due porte** che l'owner ha già scritto per TALOS, applicata da OpenAI: una skill
creata in un posto vale in tutti.

**3. Il sandbox è quello del sistema operativo, non uno finto.** *«The Codex app
uses native, open-source and configurable system-level sandboxing just like in
the Codex CLI»*. La documentazione nomina i meccanismi: su macOS *«sandboxing
works out of the box using the built-in Seatbelt framework»*; su Linux/WSL2
`bubblewrap` (*«Codex uses the first `bwrap` executable it finds on `PATH`»*);
su Windows sandbox nativo con PowerShell o il sandbox Linux dentro WSL2
([sandboxing](https://learn.chatgpt.com/docs/sandboxing)). Il codice è aperto:
`openai/codex` è **Apache-2.0**, 103.311 stelle, 15.593 fork, ultimo push
2026-08-02 (GitHub API, letta il 2026-08-02).

**4. La dimostrazione delle skill è misurata, non aneddotica.** OpenAI ha fatto
costruire a Codex un gioco di corse: *«Codex built the game by working
independently using more than 7 million tokens with just one initial user
prompt»*, assumendo i ruoli di *«designer, game developer, and QA tester to
validate its work by actually playing the game»*. E hanno pubblicato **il prompt
e le skill usate**, oltre a tre stadi intermedi (7MM / 800k / 60k token). È una
prova riproducibile, non uno screenshot.

**5. Il precedente di privilegio separato è ben progettato, e ci serve.** La
configurazione per progetto **non può** sovrascrivere le chiavi che contano:
*«Codex ignores `openai_base_url`, `chatgpt_base_url`, `apps_mcp_product_sku`,
`model_provider`, `model_providers`, `notify`, `profile`, `profiles`,
`experimental_realtime_ws_base_url`, and `otel` when they appear in a
project-local `.codex/config.toml`»*, e *«Codex loads project-scoped config files
only when you trust the project»*
([config-reference](https://learn.chatgpt.com/docs/config-file/config-reference)).
Un repository clonato non può quindi dirottare il provider del modello né
l'endpoint di telemetria. Torneremo su questo in §3.3: è il modello esatto da
copiare per le skill di TALOS.

## 1.5 Punti deboli

### Quello che l'app non fa, dichiarato da OpenAI stessa

- **Le Automations non girano a computer chiuso.** Dichiarato nel «What's next»
  del comunicato come lavoro futuro: *«so Codex can run continuously in the
  background—not just when your computer is open»*.
- **Al lancio non c'era Windows.** Aggiunto un mese dopo, con la riga di update
  in cima.
- **Il telecomando mobile non parla con Windows.** Al 14 maggio 2026: *«Support
  for connecting your phone to the Codex app on Windows is coming soon»*
  ([work-with-codex-from-anywhere](https://openai.com/index/work-with-codex-from-anywhere/)).
- **Su macOS l'app è per Apple Silicon.** Il pulsante è *«Download for macOS
  (Apple Silicon)»* ([learn.chatgpt.com/docs/app](https://learn.chatgpt.com/docs/app)).
- **La generazione immagini non c'è nel piano Free**
  ([pricing](https://learn.chatgpt.com/docs/pricing)).

### Quello che richiede un account, e quello che richiede la rete

**Account: sempre, senza eccezioni.** *«Anyone with a ChatGPT Plus, Pro,
Business, Enterprise or Edu subscription can use Codex across the CLI, web,
IDE-extension and app with their ChatGPT login»*. Il quickstart della
documentazione non ammette alternative: *«Open the app, then sign in with your
ChatGPT account»*. L'unica via senza abbonamento ChatGPT è una **API key**, che
però la pagina prezzi descrive con una rinuncia esplicita: *«No cloud-based
features (GitHub code review, Slack, etc.)»*.

**Rete: sempre, per il ragionamento.** Ogni turno è una chiamata ai server. In
più il sandbox chiede il permesso per la rete: il default è `workspace-write` con
policy di approvazione `on-request`, e la rete *«requires approval by default»*.

### Prezzi e quote — cifre lette sulla pagina che le pubblica

Tutti i numeri qui sotto vengono da
[learn.chatgpt.com/docs/pricing](https://learn.chatgpt.com/docs/pricing),
verificati sul testo grezzo della pagina il 2026-08-02, non su un blog.

| Piano | Prezzo dichiarato |
|---|---|
| Free | $0 /month — *«Explore Codex capabilities on quick coding tasks»* |
| Go | $8 /month |
| Plus | $20 /month |
| Pro | From $100 /month — *«Choose 5x or 20x higher rate limits than Plus»* |
| Business | $20 /user/month — nota: *«2+ users, billed annually. $25 per user per month when billed monthly»* |
| Enterprise & Edu | Contact sales |
| API Key | *«Pay only for the tokens Codex uses, based on API pricing»* |

**Come sono espresse le quote.** In **finestre mobili di 5 ore**, con l'avvertenza
testuale: *«The usage limits for local messages and cloud chats share a five-hour
window. Additional weekly limits may apply.»* I limiti sono dati come
**intervalli**, non come numeri fissi, perché *«The number of messages you can
send depends on the model used, size and complexity of your tasks»*:

| Modello | Plus, msg locali / 5h | Pro 5x | Pro 20x |
|---|---|---|---|
| GPT-5.6 Sol | 10–100 | 50–500 | 200–2.000 |
| GPT-5.6 Terra | 25–200 | 125–1.000 | 500–4.000 |
| GPT-5.6 Luna | 250–2.000 | 1.250–10.000 | 5.000–40.000 |
| GPT-5.5 | 15–80 | 75–400 | 300–1.600 |
| GPT-5.4 | 20–100 | 100–500 | 400–2.000 |
| GPT-5.4 mini | 60–350 | 300–1.750 | 1.200–7.000 |

Business ha gli stessi numeri di Plus. Per Enterprise/Edu con flexible pricing
*«there are no fixed rate limits - usage scales with credits»*.

**Debolezza da registrare, perché è un fatto di assenza:** la pagina prezzi
espone i tab **Plus / Pro 5x / Pro 20x / Business / API Key**. **Non pubblica
alcuna tabella di limiti per Free e per Go**, benché entrambi i piani siano
elencati come inclusi. Quanto Codex ottenga un utente Free è, sulla
documentazione pubblica di OpenAI, **non dichiarato**.

**Rate card dei crediti**, per milione di token (stessa pagina):

| Modello | Input | Input in cache | Output |
|---|---|---|---|
| GPT-5.6 Sol | 125 | 12,5 | 750 |
| GPT-5.6 Terra | 50 | 5 | 300 |
| GPT-5.6 Luna | 5 | 0,5 | 30 |
| GPT-5.5 | 125 | 12,50 | 750 |
| GPT-5.4 | 62,50 | 6,250 | 375 |
| GPT-5.4 mini | 18,75 | 1,875 | 113 |
| GPT-Image-2 (image) | 200 | 50 | 750 |
| GPT-Image-2 (text) | 125 | 31,25 | 250 |

Con due note dell'operatore che valgono più della tabella: *«GPT-5.6 usage
averages 5-40 credits per message»* e *«Fast mode consumes credits at a higher
rate»*, oltre a *«Image generations also use included limits ~3-5x faster on
average»*. E il comportamento a limite raggiunto: *«If you reach your usage
limits during an active turn, the agent will be able to continue working on that
turn, subject to fair use limits»*.

**Seconda assenza, e pesa più della prima: quanto costa un credito in euro non è
pubblicato.** La meccanica d'acquisto è documentata (Codex Settings > Usage >
Credits, auto top-up con Minimum balance / Target balance / limite mensile), ma
**nessuna pagina OpenAI dichiara un prezzo in dollari per credito o per
pacchetto**. L'unica cifra in valuta che OpenAI pubblica è una stima di esito, e
la riporto testualmente perché è quella che l'owner deve avere in testa quando
confronta i modelli economici: *«On average, Codex costs ~$100-$200/developer
per month, though there is a large variance depending on model used, number of
instances users are running, automations, and usage of fast mode»*
([help.openai.com — Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card)).
I crediti, inoltre: *«Credits are valid for 12 months from purchase. Unused
credits expire and do not roll over after the expiry date»* e *«Credits are
non-refundable»*
([help.openai.com/en/articles/12642688](https://help.openai.com/en/articles/12642688)).

**Il modello di prezzo è cambiato due volte nel 2026**, e OpenAI lo scrive:
*«On Apr 2, 2026, we updated Codex pricing to align with API token usage, instead
of per-message pricing… On Apr 23, 2026, we made this update for all existing
ChatGPT Enterprise plans as well»* (stessa rate card). Chi aveva costruito
un'aspettativa sul prezzo per messaggio se l'è vista riscrivere sotto i piedi.

**E c'è una riga sulla privacy che TALOS deve conoscere**, perché è esattamente
il terreno del vincolo *local-first*: per i piani Plus e Pro, *«Conversations may
be used to improve models unless you turn off training in ChatGPT data
controls»*, e — la parte che colpisce — *«Your ChatGPT training data controls
apply to content processed through Codex, including screenshots taken by
Computer Use»*
([help.openai.com/en/articles/11369540](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)).
Su Business, Enterprise, Edu e API il default è l'opposto: non usati.

**Il numero che pesa davvero.** Un'ora di lavoro agentico serio brucia milioni di
token. A 125 crediti per milione di input su Sol, con la promozione temporanea di
febbraio (*«For a limited time we're including Codex with ChatGPT Free and Go,
and we're doubling the rate limits on Plus, Pro, Business, Enterprise, and Edu
plans»*) esplicitamente segnata come **limitata nel tempo**, il modello economico
di Codex è un rubinetto che l'operatore controlla. Questo è il punto su cui TALOS
ha un'asimmetria strutturale, non un vantaggio di feature: **un modello che gira
sul telefono non ha una finestra di 5 ore.**

### Le lamentele reali degli utenti — separando il fatto dall'aneddoto

Qui la regola di rigore vale il doppio, perché è il terreno dove è più facile
scambiare uno sfogo per un dato. Il criterio adottato: **FATTO** = una issue
tracciata con numero, riproducibile o accompagnata da misure, oppure un limite
documentato dall'operatore. **ANEDDOTO** = una testimonianza singola,
attribuibile ma non verificata.

**Nota di copertura:** Reddit ha risposto **403** a ogni tentativo
(`old.reddit.com/r/OpenAI/search.json` e `/r/ChatGPTCoding/search.json`).
**Nessuna affermazione di questo documento poggia su Reddit.** Le fonti usate
sono le issue di `openai/codex`, `community.openai.com` e i thread di Hacker
News, tutti aperti davvero.

**Il consumo delle quote è il capitolo più voluminoso, e i numeri sono
strumentati.** La issue [#28879](https://github.com/openai/codex/issues/28879)
— *«rate-limit cost per token jumped ~10-20x since June 16, draining the 5h
budget in 2-3 prompts»* — ha **210 commenti e 558 reazioni**, etichette
`bug`/`rate-limits`/`app`, e contiene una tabella ricavata dai log: un prompt da
57K token con 3.6K di reasoning valeva ~1% del budget il 12 giugno; un prompt da
20K token **senza** reasoning ne valeva 10–27% il 18 giugno. La issue
[#14593](https://github.com/openai/codex/issues/14593) («Burning tokens very
fast») ha **627 commenti**. La [#30002](https://github.com/openai/codex/issues/30002)
documenta un `usage_limit_reached` dopo ~41 minuti e ~1,35M token, contro ~156M
token in una finestra piena lo stesso giorno. **FATTO**, tutte e tre.

E l'operatore stesso conferma il cambio di regime: il thread ufficiale «Codex
Rate Limits Discussion» (413 post, 30.037 visualizzazioni), aperto dalla
community lead di OpenAI: *«This topic is for discussing Codex limits after the
move from message-based usage to token-based usage. Additionally the 2x rate
limits promotion has ended and some users have reported hitting limits sooner
after this change»*
([community.openai.com](https://community.openai.com/t/codex-rate-limits-discussion-thread/1378553)).
**FATTO.**

**La cecità sul contesto aggrava il problema, ed è una regressione tracciata.**
[#23794](https://github.com/openai/codex/issues/23794) — «Codex Desktop no
longer shows visible context/token usage indicator» — **173 commenti, 249
reazioni**. Gli utenti vengono fatturati a token mentre l'indicatore di consumo
è sparito. **FATTO.** *Lezione diretta per TALOS: se si fattura a token, il
contatore dei token è una funzione di prodotto, non un vezzo da debug.*

**Il sandbox su Windows è il punto strutturalmente più debole, e OpenAI lo
ammette due volte.** Un dipendente OpenAI il giorno del lancio: *«We have a
robust sandbox for macOS and Linux. Not quite yet for Windows… there are fewer
OS-level primitives for it»*
([news.ycombinator.com/item?id=46859054](https://news.ycombinator.com/item?id=46859054)).
E la documentazione: la modalità `unelevated` *«is weaker than `elevated`»* e
*«has weaker network isolation»*
([windows-sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)).
La conseguenza operativa è in
[#30712](https://github.com/openai/codex/issues/30712): quando `apply_patch` non
funziona, *«Agents have to fall back to shell-based file rewrites inside the
project, which bypasses the sandbox»*. **FATTO, e grave**: il fallback aggira il
confine di sicurezza invece di fallire chiuso — l'opposto esatto della regola
fail-closed che gli stessi documenti rivendicano su macOS (§1.6).

**Niente Linux, sei mesi dopo il «very soon».** Un dipendente OpenAI in gennaio:
*«The team actually built the Codex app in Electron so we can support both
Windows and Linux very soon.»* La issue
[#11023](https://github.com/openai/codex/issues/11023) («Codex desktop app for
Linux») è **aperta con 1.392 reazioni**, la più votata del repository. **FATTO.**

**Consumo di risorse: una issue che merita di essere letta da chiunque scriva
logging.** [#28224](https://github.com/openai/codex/issues/28224) — *«Codex
SQLite feedback logs can write ~640 TB/year and rapidly consume SSD
endurance»*, **616 reazioni**: 37 TB scritti in 21 giorni, con
`logs_2.sqlite` che conservava 506K righe mentre l'AUTOINCREMENT aveva superato
i **5,54 miliardi** di id. **Corretta e chiusa** il 23 giugno 2026. **FATTO.**
Meno divertente ma ancora aperta: [#25719](https://github.com/openai/codex/issues/25719),
runaway di CPU e RAM su `syspolicyd`/`trustd` di macOS, 437 reazioni.

**Le skill hanno bug di integrazione veri.**
[#10695](https://github.com/openai/codex/issues/10695): la skill «GitHub Fix CI»
**inclusa da OpenAI** non può funzionare perché il sandbox dell'app non dà
accesso al Keychain né inietta variabili d'ambiente, quindi `gh auth status` è
sempre invalido. Più [#9752](https://github.com/openai/codex/issues/9752) (skill
di progetto non più scoperte), [#9226](https://github.com/openai/codex/issues/9226)
(script dentro `scripts/` non scoperti),
[#19679](https://github.com/openai/codex/issues/19679) (budget di contesto dei
metadati skill fissato al 2%). **FATTO.**
*Lezione per TALOS: le skill che chiedono un segreto devono dichiararlo, e il
motore deve poterglielo passare in modo esplicito — altrimenti la skill è un
guscio.*

**Una fuga di segreti tracciata e non ancora affrontata.**
[#31588](https://github.com/openai/codex/issues/31588): gli URL dei remote git
che contengono un PAT di GitHub (`https://github_pat_11AA4…@github.com/...`)
finiscono **non sanificati** nei file di sessione e vengono spediti alla
Responses API come `associated_remote_urls`. Zero commenti, ancora aperta.
**FATTO**, e per TALOS è un promemoria concreto: i metadati sono dati, e i dati
possono contenere chiavi.

**Migrazione del 9 luglio: ANEDDOTO, ma attribuibile e ripetuto.** Nel thread HN
«Tell HN: The Codex App is replaced by ChatGPT»
([news.ycombinator.com/item?id=48890384](https://news.ycombinator.com/item?id=48890384)),
`vintagedave`: *«Today Codex (macOS) prompted to upgrade, and it failed — the app
is gone, but was not replaced… Currently my entire Codex workflow is gone.»*
`billziss`: *«Within 5 minutes I had regretted this decision. I ended up deleting
the new app, but the old app is also gone.»* Sono testimonianze singole, non
misure — le riporto come **ANEDDOTO**. Ma il loro numero e la loro convergenza
dicono qualcosa che vale per TALOS: **una fusione di superfici va fatta con una
via di ritorno**, altrimenti si perde l'utente esattamente nel momento in cui
gli si chiede fiducia.

**Nessuna modalità offline, e non per caso.** Le richieste di supporto a modelli
locali — issue **#26** e **#202** di `openai/codex` — sono **chiuse**. Nel
vocabolario di OpenAI «local» significa *il codice gira sulla tua macchina*, mai
*il modello gira sulla tua macchina*. **FATTO**, ed è la conferma che l'asimmetria
di §1.7 è una scelta di architettura, non un ritardo di roadmap.

## 1.6 Il modello di permessi e di approvazione

È la parte progettualmente migliore di Codex, e va studiata riga per riga perché
TALOS deve fare almeno altrettanto.

**Il default, con le parole del comunicato:**

> *«By default, Codex agents are limited to editing files in the folder or branch
> where they're working and using cached web search, then asking for permission
> to run commands that require elevated permissions like network access.»*

**Cosa fa senza chiedere.** In modalità `Auto` (`workspace-write`): legge i file,
fa modifiche ed esegue comandi **dentro la directory di lavoro**. Nel profilo
`:workspace` può *«read and modify files under the path, including creating,
renaming, and deleting files»*
([permissions](https://learn.chatgpt.com/docs/permissions)).

**Cosa chiede.** Modificare file fuori dal workspace; comandi che richiedono
rete; *«Sandbox escalations, blocked network requests, `request_permissions`
prompts, or side-effecting app and MCP tool calls»*. E una regola che TALOS
dovrebbe adottare parola per parola: le chiamate distruttive a tool *«always
require approval when the tool advertises a destructive annotation»*
([agent-approvals-security](https://learn.chatgpt.com/docs/agent-approvals-security)).

**Cosa non può fare mai.** Alcuni percorsi restano in sola lettura per default —
`.git`, `.agents`, `.codex`. I profili *«cannot extend `:danger-full-access`»*.
La rete ha *«a local/private-network guard by default»* contro i servizi locali.
E c'è una scelta di fail-closed che è la più importante di tutte: su macOS,
*«if the selected policy cannot be enforced by the platform sandbox, Codex
refuses to run the command»*. **Se non può garantire il confine, non esegue.**

**I nomi esatti.** Modalità di approvazione: `on-request`, `never`, `untrusted`
(*«approve only known-safe read operations»*). Profili di sandbox: `:read-only`,
`:workspace`, `:danger-full-access`. Modalità del sandbox in `config.toml`:
`read-only`, `workspace-write`, `danger-full-access`. La rete è **disattivata per
default**; quando è attiva funziona su allowlist di domini, e *«deny entries
override allow entries»*. I percorsi si possono negare con glob, es.
`"**/*.env" = "deny"`.

**Le regole sono un linguaggio, non una checkbox.** I file `.rules` (es.
`~/.codex/rules/default.rules`) sono scritti in **Starlark** — descritto come
*«like Python, but it's designed to be safe to run»*, senza effetti collaterali.
La funzione `prefix_rule()` prende `pattern` (*«A non-empty list that defines the
command prefix to match»*), `decision` fra `allow` / `prompt` / `forbidden`,
`justification`, e `match`/`not_match` come **esempi di validazione della regola
stessa**. Si testano con
`codex execpolicy check --pretty --rules ~/.codex/rules/default.rules -- [command]`
([rules](https://learn.chatgpt.com/docs/agent-configuration/rules)).

Due dettagli di implementazione che valgono oro per chi scrive un motore di
permessi: le catene di operatori sicuri (`&&`, `||`, `;`, `|`) con parole semplici
vengono **spezzate e valutate comando per comando**; ma se lo script usa
redirezioni, sostituzioni o variabili, *«the entire invocation is treated as»* un
comando solo. È il compromesso corretto fra granularità e sicurezza: quando il
parsing diventa ambiguo, si stringe invece di allargare.

**E la prompt injection è nominata esplicitamente.** *«Use caution when enabling
network access or web search in Codex. Prompt injection can cause the agent to
fetch and follow untrusted instructions.»* La mitigazione scelta è di
architettura, non di prompt: la ricerca web usa per default **risultati in
cache** per ridurre *«exposure to prompt injection from arbitrary live
content»*. Nel cloud, *«Codex blocks internet access during the agent phase»* e i
rischi elencati sono espliciti — istruzioni nascoste in contenuti non fidati,
esfiltrazione verso server dell'attaccante, *«Downloading malware or vulnerable
dependencies»*, *«Pulling in content with license restrictions»* — con
l'istruzione finale *«Point Codex only to trusted resources and keep internet
access as limited as possible»*
([cloud/internet-access](https://learn.chatgpt.com/docs/cloud/internet-access)).

## 1.7 Il mobile: cosa gira davvero sul telefono

**Risposta breve: niente.**

Il 14 maggio 2026 OpenAI ha portato Codex sul telefono, e va detto esattamente
come: **non è un'app Codex per mobile.** È Codex **dentro l'app ChatGPT**, in
preview, e la sostanza è nella frase che OpenAI scrive da sé:

> *«Your files, credentials, permissions, and local setup stay on the machine
> where Codex is operating, while updates flow back to your phone in real time,
> including screenshots, terminal output, diffs, test results, and approvals.»*
> — [work-with-codex-from-anywhere](https://openai.com/index/work-with-codex-from-anywhere/)

Il telefono **manda** *«prompts, approvals, and follow-up messages»*; l'host
**fornisce** *«the environment ChatGPT uses»* — file del repository, shell,
server MCP, skill, browser, Computer Use
([remote-connections](https://learn.chatgpt.com/docs/remote-connections)).

**Le condizioni sono severe, e sono la vera notizia.** L'host dev'essere *«The
latest ChatGPT desktop app for macOS or Windows running on a host that's awake,
online, and signed in»*, e se l'host *«sleeps, loses network access, or closes
the app, remote access stops»*. Le due parti devono stare *«on the same ChatGPT
account and workspace»*. Sotto c'è *«a secure relay layer [that] keeps trusted
machines reachable across your authorized ChatGPT devices without exposing them
directly to the public internet»*.

**Cosa può fare su telefono:** lavorare su tutti i thread, rivedere output,
approvare comandi, cambiare modello, avviare lavoro nuovo. **Cosa gira comunque
altrove:** tutto. Il modello nel cloud, l'esecuzione sul portatile.

**Disponibilità:** *«rolling out in preview on iOS and Android across all plans,
including Free and Go, in all supported regions»*. Nello stesso annuncio: Remote
SSH in GA, Hooks in GA, access token programmatici (Enterprise e Business),
supporto HIPAA solo per ambienti locali di workspace Enterprise idonei.

**La cifra, dalla fonte primaria:** *«More than 4 million people now use Codex
every week»* (14 maggio 2026). Da confrontare con il comunicato di febbraio:
*«in the past month, more than a million developers have used Codex»* e *«Since
the launch of GPT-5.2-Codex in mid-December, overall Codex usage has doubled»*.
Entrambe da OpenAI, entrambe con la loro data.

### Il L3 che questo regala a TALOS

Il leader di mercato, sul telefono, ha spedito **un telecomando**. Se il
portatile dorme, il telefono non fa niente. Se non hai un portatile, non hai
Codex mobile. Se sei in metropolitana senza campo, non hai niente.

TALOS gira sul telefono. Il motore locale llama.cpp on-device non ha bisogno di
un host sveglio, non ha una finestra di 5 ore, non ha un relay da attraversare.
Nella tassonomia della dottrina interna, **questo non è L1 né L2: è L3.** OpenAI
non può seguirci senza cambiare l'architettura del prodotto e il modello
economico — un modello che gira sul telefono dell'utente non consuma crediti, e
i crediti sono il ricavo.

La frase da mettere sul confronto è la loro, non nostra: *«Your files,
credentials, permissions, and local setup stay on the machine where Codex is
operating.»* Bene. Su TALOS, quella macchina **è** il telefono.

