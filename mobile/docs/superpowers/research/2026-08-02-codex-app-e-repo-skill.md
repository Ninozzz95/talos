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

---

# PARTE 2 — Le skill: censire i repository che esistono

## 2.1 La notizia che cambia il piano: il formato è uno solo, ed è aperto

L'obiettivo dell'owner era «avere una nostra repo di skill open source già
affermate da altri, da adattare a TALOS». La ricerca ha trovato qualcosa di
meglio di un elenco di repository: **ha trovato che l'adattamento non serve.**

Esiste uno **standard aperto unico**, pubblicato su
[agentskills.io](https://agentskills.io/), con il suo repository su
[github.com/agentskills/agentskills](https://github.com/agentskills/agentskills)
— *«Specification and documentation for Agent Skills»*, **licenza Apache-2.0**,
**23.757 stelle**, 1.660 fork, creato il 2025-12-16, ultimo push 2026-07-10
(GitHub API, letta il 2026-08-02). La pagina di panoramica lo dice senza giri di
parole:

> *«The Agent Skills format was originally developed by Anthropic, released as an
> open standard, and has been adopted by a growing number of agent products.»*

Questo è il fatto che riorganizza tutta la Parte 2. Non ci sono cinque formati
concorrenti da mediare: c'è **un formato** che Anthropic ha scritto, ha
regalato, e che i suoi concorrenti diretti hanno adottato. La Client Showcase
ufficiale ([agentskills.io/clients](https://agentskills.io/clients)) elenca **44
prodotti** — conteggio ottenuto enumerando le voci `name:` dell'array `clients`
nel sorgente della pagina, non stimato — e fra questi ci sono:

**OpenAI Codex, Google Gemini CLI, GitHub Copilot, VS Code, Cursor, Mistral AI
Vibe, Kiro (AWS), TRAE (ByteDance), Databricks Genie Code, Snowflake Cortex
Code, JetBrains Junie, Tabnine, Spring AI, Laravel Boost, Pulumi Neo, Qodo,
Goose, OpenHands, OpenCode, Roo Code, Amp, Factory, Letta, Firebender, Mux,
ZeroClaw, nanobot, fast-agent, Claude Code e Claude.**

Chi implementa il caricatore di skill di TALOS non sta scegliendo una fazione.
Sta implementando **l'unica interfaccia che parlano tutti**.

### La specifica, per intero, perché è corta

Da [agentskills.io/specification](https://agentskills.io/specification).
Una skill è **una cartella con dentro un `SKILL.md`**:

```
skill-name/
├── SKILL.md          # Obbligatorio: metadati + istruzioni
├── scripts/          # Opzionale: codice eseguibile
├── references/       # Opzionale: documentazione
├── assets/           # Opzionale: template, risorse
└── ...
```

Il frontmatter YAML ha **esattamente sei campi**, due obbligatori:

| Campo | Obblig. | Vincolo esatto |
|---|---|---|
| `name` | **Sì** | Max **64** caratteri, solo `a-z`, `0-9` e trattini; niente trattino iniziale o finale; niente trattini consecutivi; **deve coincidere col nome della cartella** |
| `description` | **Sì** | Max **1024** caratteri, non vuota. Deve dire *cosa fa* **e** *quando usarla* |
| `license` | No | Nome della licenza o riferimento a un file incluso |
| `compatibility` | No | Max **500** caratteri. Requisiti d'ambiente (prodotto, pacchetti di sistema, accesso di rete) |
| `metadata` | No | Mappa stringa→stringa arbitraria |
| `allowed-tools` | No | Stringa separata da spazi di tool pre-approvati. **Sperimentale** |

**Non esiste un campo `version` di primo livello.** L'esempio ufficiale della
specifica mette la versione dentro `metadata`:

```yaml
metadata:
  author: example-org
  version: "1.0"
```

**La divulgazione progressiva è la parte architetturalmente importante**, ed è
il motivo per cui questo formato funziona su un telefono:

1. **Metadati (~100 token)** — *«The `name` and `description` fields are loaded at
   startup for all skills»*
2. **Istruzioni (<5000 token consigliati)** — *«The full SKILL.md body is loaded
   when the skill is activated»*
3. **Risorse (a richiesta)** — i file in `scripts/`, `references/`, `assets/`
   *«are loaded only when required»*

Con due regole di igiene: *«Keep your main SKILL.md under 500 lines»* e *«Keep
file references one level deep from SKILL.md»*.

**Perché conta su un telefono:** cento skill installate costano ~10.000 token di
catalogo, non cento file interi. Su un modello on-device con finestra di contesto
ridotta questa non è un'ottimizzazione, è la condizione di esistenza della
funzione. La specifica è stata progettata per un vincolo che TALOS ha in forma
più acuta di chiunque altro.

### Come si dichiarano i tool richiesti — la verità è meno bella della specifica

`allowed-tools` esiste ed è scritto **col trattino**. Esempio ufficiale:

```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read
```

Ma la specifica stessa lo marca *«Experimental. Support for this field may vary
between agent implementations»*, e c'è una cosa che va capita bene prima di
progettarci sopra un modello di permessi: **`allowed-tools` non restringe, allarga.**
Nella documentazione di Claude Code è una **pre-concessione di permessi**, non un
sandbox: i tool restano tutti richiamabili. Chi vuole *togliere* tool deve usare
`disallowed-tools`, che è un'estensione di client, non della specifica.

**Le skill non dichiarano i server MCP.** Quella dichiarazione sta un livello
sopra, nel manifesto del plugin, oppure — ed è la soluzione più interessante per
noi — in un **file affiancato specifico del fornitore**. OpenAI fa esattamente
così: ognuna delle sue 44 skill ha un `agents/openai.yaml` accanto al `SKILL.md`.
Esempio reale, non inventato, dalla skill `linear`
([raw](https://raw.githubusercontent.com/openai/skills/main/skills/.curated/linear/agents/openai.yaml)):

```yaml
interface:
  display_name: "Linear"
  short_description: "Manage Linear issues in Codex"
  icon_small: "./assets/linear-small.svg"
  default_prompt: "Use Linear context to triage or update relevant issues..."
dependencies:
  tools:
    - type: "mcp"
      value: "linear"
      description: "Linear MCP server"
      transport: "streamable_http"
      url: "https://mcp.linear.app/mcp"
```

La documentazione di OpenAI aggiunge un campo che a noi serve moltissimo:
`policy.allow_implicit_invocation: false`
([build-skills](https://learn.chatgpt.com/docs/build-skills)).

**Il modello da copiare è questo: nucleo portabile + file affiancato del
fornitore.** TALOS può definire `agents/talos.yaml` — con i tool richiesti, i
permessi Shizuku necessari, il livello di rischio, l'icona, il fatto che la skill
funzioni o no col motore locale — **senza rompere la compatibilità con nessuno
dei 44 client**. Un `SKILL.md` scritto per Claude continua a funzionare da noi; una
skill scritta da noi continua a funzionare su Claude Code, ignorando il file
affiancato. È il modo giusto di estendere uno standard: additivo, non
divergente.

## 2.2 `anthropics/skills` — la licenza è a scacchiera, e quattro caselle sono nere

**Metadati (GitHub API, 2026-08-02):** **165.788 stelle**, 19.724 fork, ultimo
push 2026-07-24, `open_issues_count` 1.055 (che su GitHub include le PR).
Descrizione: *«Public repository for Agent Skills»*.

**Il fatto che decide tutto: il campo `license` dell'API vale `null`, e nella
radice del repository non c'è alcun file LICENSE.** La radice contiene solo
`.claude-plugin/`, `.gitignore`, `README.md`, `THIRD_PARTY_NOTICES.md`,
`skills/`, `spec/`, `template/`. **La licenza è per singola cartella**, e va
letta cartella per cartella. È esattamente il tipo di dettaglio che un riassunto
di seconda mano perde, e che costerebbe caro.

**Conteggio:** 18 file `SKILL.md` nel repository, di cui uno è `template/SKILL.md`
→ **17 skill reali** (metodo: albero git ricorsivo via `gh api`, filtrato su
`SKILL.md$`).

**Censimento delle licenze, fatto leggendo i 16 file `LICENSE.txt` presenti:**

| Licenza | N. | Skill |
|---|---|---|
| **Apache-2.0** ✅ | **12** | `algorithmic-art`, `brand-guidelines`, `canvas-design`, `claude-api`, `frontend-design`, `internal-comms`, `mcp-builder`, `skill-creator`, `slack-gif-creator`, `theme-factory`, `web-artifacts-builder`, `webapp-testing` |
| **Proprietaria** ⛔ | **4** | `docx`, `pdf`, `pptx`, `xlsx` |
| **Nessuna licenza** ⛔ | **1** | `doc-coauthoring` |

Anthropic dichiara la separazione nel proprio README, e la dichiara bene:

> *«Many skills in this repo are open source (Apache 2.0). We've also included the
> document creation & editing skills that power Claude's document capabilities
> under the hood in the `skills/docx`, `skills/pdf`, `skills/pptx`, and
> `skills/xlsx` subfolders. **These are source-available, not open source**»*

E il testo della licenza proprietaria non lascia margini di interpretazione
creativa. Testuale, da
[skills/docx/LICENSE.txt](https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/LICENSE.txt):

> © 2025 Anthropic, PBC. All rights reserved.
> ADDITIONAL RESTRICTIONS: […] users may not:
> - **Extract these materials from the Services or retain copies of these
>   materials outside the Services**
> - Reproduce or copy these materials […]
> - **Create derivative works based on these materials**
> - **Distribute, sublicense, or transfer these materials to any third party**
> - […] Reverse engineer, decompile, or disassemble these materials

**Verdetto operativo, senza ambiguità:**

- ✅ **12 skill sono spedibili dentro TALOS.** Apache-2.0, uso commerciale
  consentito, con gli obblighi soliti: conservare LICENSE, conservare le
  attribuzioni, dichiarare le modifiche.
- ⛔ **`docx`, `pdf`, `pptx`, `xlsx` non sono spedibili in nessuna forma.** Né
  copiate, né adattate, né «ispirate». La licenza vieta espressamente di
  *tenerne copia fuori dai Servizi di Anthropic*. Ed è una beffa che siano
  proprio queste: sono le quattro con più script (`docx` 59 file, `pptx` 54,
  `xlsx` 51), cioè le più tentanti.
- ⛔ **`doc-coauthoring` non ha né `LICENSE.txt` né campo `license` nel
  frontmatter** (verificato aprendo il file). Nessuna concessione = tutti i
  diritti riservati per default. **L'assenza di una licenza non è un permesso.**
  Se serve, si chiede ad Anthropic; non si assume per vicinanza.

**Nota di coerenza interessante:** il `marketplace.json` di Anthropic raggruppa
le quattro skill proprietarie in un plugin a sé (`document-skills`), separato da
`example-skills`. **Il confine del plugin coincide esattamente col confine della
licenza.** È una scelta di design che TALOS dovrebbe imitare: se un catalogo
mescola licenze, il raggruppamento deve renderle separabili con un solo gesto.

## 2.3 `openai/skills` — stesso problema, esito migliore

**Metadati (GitHub API, 2026-08-02):** **24.428 stelle**, 1.663 fork, ultimo push
2026-07-14, `license: null`, descrizione *«Skills Catalog for Codex»*. È il
repository linkato dal comunicato dell'app come *«the open source repo»*.

**Anche qui la licenza non è a livello di repository**, e il README lo dice in
una riga: *«The license of an individual skill can be found directly inside the
skill's directory inside the `LICENSE.txt` file.»*

**Conteggio:** **44 `SKILL.md`** — 39 sotto `skills/.curated/` e 5 sotto
`skills/.system/` (metodo: albero git ricorsivo). Tutte e 44 hanno un
`LICENSE.txt` e tutte e 44 hanno un `agents/openai.yaml`.

**Censimento delle licenze, fatto scaricando e classificando tutti e 44 i file:**

| Licenza | N. | Note |
|---|---|---|
| **Apache-2.0** ✅ | **31** | Il grosso del catalogo, incluse `pdf`, `openai-docs`, `playwright`, `linear`, le skill di sicurezza |
| **MIT** ✅ | **1** | `vercel-deploy` — *«Copyright (c) 2026 Vercel»* |
| **MIT (testo, senza intestazione)** ✅ | **4** | Le quattro skill Notion — *«Copyright 2025 Notion Labs, Inc. Permission is hereby granted, free of charge…»*, corpo MIT integrale |
| **Figma, proprietaria** ⛔ | **8** | Tutte le `figma-*` — *«Use of these Figma skills and related files ("Materials") is governed by the Figma Developer…»* |

**Verdetto: 36 skill su 44 sono redistribuibili** (31 Apache + 1 MIT + 4 Notion
MIT). Le 8 di Figma sono da escludere. Il rapporto è nettamente migliore che in
casa Anthropic, e per un motivo comprensibile: OpenAI ha costruito un catalogo di
integrazioni di terzi, e ogni terzo ha messo la sua licenza — Vercel MIT, Notion
MIT, Figma no.

**Nota di verifica:** il campo `license` dell'API GitHub vale `null` su entrambi i
repository. Chiunque riporti «anthropics/skills è MIT» o «openai/skills è
Apache» sta riportando un'impressione, non un fatto. Il fatto è che **la licenza
va letta per cartella**, e che in entrambi i cataloghi ci sono cartelle che non
si possono toccare.

## 2.4 Come i cataloghi esistenti gestiscono fiducia e firma

Il vincolo dell'owner dice: *repo di skill remota **e firmata***. La domanda
naturale è come lo fanno gli altri. La risposta, verificata su tutti e tre gli
attori principali, è netta e sorprendente:

> **Nessuno firma niente.**

**Anthropic.** I marketplace dei plugin sono **JSON ospitati su git, non
firmati**. Il `marketplace.json` di `anthropics/skills` è un file semplice con
`name`, `owner`, `metadata`, `plugins[]`. Gli unici controlli d'integrità
disponibili sono: **il pinning allo SHA git**, l'allowlist amministrativa dei
marketplace, e una protezione contro l'occupazione di nomi riservati. Nessuna
firma crittografica. La documentazione è esplicita sul livello di fiducia
richiesto: *«Plugins and marketplaces are highly trusted components that can
execute arbitrary code on your machine with your user privileges. Only install
plugins and add marketplaces from sources you trust»*
([code.claude.com/docs/en/discover-plugins](https://code.claude.com/docs/en/discover-plugins)).

**OpenAI.** L'installatore è a sua volta una skill, ed è leggibile
([skill-installer](https://raw.githubusercontent.com/openai/skills/main/skills/.system/skill-installer/SKILL.md)).
Comportamento reale: *«Curated listing is fetched from
`https://github.com/openai/skills/tree/main/skills/.curated` via the GitHub API»*
— cioè **il catalogo è remoto, non cablato**, esattamente come vuole il vincolo
TALOS *«app distribuita: niente statico»*. Installa in
`$CODEX_HOME/skills/<skill-name>`, scarica direttamente per i repo pubblici, e
ricade su `git sparse checkout` in caso di errori di autenticazione. **Zero
verifica di firma.** La fiducia è delegata interamente a «è su GitHub sotto
l'organizzazione openai».

**Google, che è il caso più interessante perché è già su Android** (§2.5). Il
codice sorgente della AI Edge Gallery mostra due meccanismi e nessun terzo:
1. un **allowlist di host compilato nell'APK** —
   `private val APPROVED_SKILL_HOSTS = listOf("google-ai-edge.github.io")`
   ([AddSkillFromUrlDialog.kt](https://github.com/google-ai-edge/gallery/blob/main/Android/src/app/src/main/java/com/google/ai/edge/gallery/customtasks/agentchat/AddSkillFromUrlDialog.kt));
2. una **allowlist remota in JSON** per le skill in vetrina — `SkillManager.kt`
   contiene `private const val SKILL_ALLOWLIST_URL = ""` (svuotata nella build
   open source) e il commento *«Fetches the featured skill allowlist from
   [SKILL_ALLOWLIST_URL]»*, deserializzata in `data class SkillAllowlist(val
   featuredSkills: List<AllowedSkill>)`.

Una ricerca di codice su `signature|sha256|verifySignature` nei sorgenti Kotlin
del repository **non restituisce risultati**. Il presidio è un disclaimer
testuale, che vale la pena leggere perché è onesto:

> *«Third-party skills are not authored or endorsed by Google. Google is not
> responsible for their contents, security, or data handling practices. Please
> exercise caution before providing sensitive information, such as personal
> identification, tokens, or API keys.»*

### Il one-up è disponibile, ed è a portata di mano

**Lo stato dell'arte del settore, ad agosto 2026, è: allowlist di host + fiducia
in GitHub + un disclaimer.** Nessuno dei tre attori maggiori firma le skill.

Il vincolo che l'owner ha scritto — **repo remota e firmata** — non è quindi
parità: è **L2 immediato**, e diventa **L3** se la firma è verificata sul
dispositivo contro una chiave pubblica spedita nell'APK, perché a quel punto
compromettere l'hosting non basta più per iniettare istruzioni in un agente che
ha accesso al telefono. È un vantaggio che si prende con poche centinaia di
righe: un manifesto remoto firmato Ed25519, la chiave pubblica nell'APK, la
verifica prima del parsing del frontmatter, e il rifiuto in caso di firma
assente — **fail-closed**, come fa Codex col sandbox su macOS (§1.6) e come
Windows di Codex, per sua stessa ammissione, non fa (§1.5).

## 2.5 Il precedente che conta più di tutti: Google AI Edge Gallery

Fra i 44 client dello standard ce n'è uno che è, letteralmente, il gemello
architetturale di TALOS: **Google AI Edge Gallery**
([github.com/google-ai-edge/gallery](https://github.com/google-ai-edge/gallery))
— *«A gallery that showcases on-device ML/GenAI use cases and allows people to
try and use models locally»*. **Apache-2.0**, **24.333 stelle**, 2.594 fork,
ultimo push 2026-07-31 (GitHub API, 2026-08-02).

È un'app Android che fa girare LLM **sul dispositivo** e che ha implementato le
Agent Skills. La sua documentazione affronta di petto il problema che TALOS avrà
fra tre settimane, e lo scrive così
([skills/README.md](https://github.com/google-ai-edge/gallery/blob/main/skills/README.md)):

> *«Unlike cloud-based LLMs that can spin up containers or access a terminal to
> run Python scripts or CLI tools, on-device LLMs operate within a sandboxed
> mobile environment. They cannot easily execute arbitrary system commands or
> local scripts due to security and resource constraints.»*

La loro soluzione ha **due vie di esecuzione, e nessuna delle due è una shell**:

1. **Skill JavaScript** — *«Running logic inside a lightweight, hidden webview,
   which provides a cross-platform execution environment for custom logic»*. La
   logica sta in un file HTML caricato in una WebView nascosta, e l'app chiama
   una funzione asincrona esposta globalmente. La skill può restituire testo,
   **un'immagine**, o **una webview** da mostrare.
2. **Intent nativi** — *«Leveraging the Android/iOS operating system's built-in
   capabilities (like sending email / text messages)»*, attraverso un tool
   `run_intent` che prende `intent` e `parameters` (JSON). Con un limite
   dichiarato: *«supporting additional native intent-based skills requires
   updating the app's source code»* — ogni nuovo intent è codice nell'APK, non
   dato scaricabile.

**Le tre vie di installazione** sono: dalla lista in vetrina (allowlist remota),
**da un URL** (con l'allowlist di host), e da un file locale via file picker.
Con un dettaglio operativo che ci risparmierà mezza giornata quando ci arriveremo:
`raw.githubusercontent.com` **non funziona** per le skill JS, perché serve i file
come `text/plain` e la WebView rifiuta di eseguirli; serve un hosting vero
(GitHub Pages con `.nojekyll`, Cloudflare, ecc.).

**Cosa ci prendiamo, per intero:**
- L'architettura a due vie — **WebView per la logica, Intent per il sistema
  operativo** — è esattamente la forma che TALOS può assumere: la WebView ce
  l'abbiamo già (Capacitor + Vue 3), e gli Intent sono la porta che il programma
  Shizuku vuole aprire in modo molto più ambizioso del loro `send_email`.
- Il fatto che **una skill scaricata non ottenga mai una shell** risolve in
  partenza metà del problema di sicurezza e tutto il problema iOS (§3.4).
- Il loro catalogo attuale — 8 skill `built-in` (`calculate-hash`,
  `interactive-map`, `kitchen-adventure`, `mood-tracker`, `qr-code`,
  `query-wikipedia`, `send-email`, `text-spinner`) e 3 `featured` (`mood-music`,
  `restaurant-roulette`, `virtual-piano`) — è **Apache-2.0** e riusabile.

**Dove li superiamo, e senza sforzo:** loro non firmano, il loro allowlist è un
solo host cablato nell'APK, e gli intent nativi nuovi richiedono una nuova
release. TALOS con Shizuku ha un ventaglio di azioni di sistema incomparabilmente
più largo, e con la firma sul manifesto ha una garanzia che loro non offrono.

---

# PARTE 3 — I vincoli TALOS applicati a quello che le Parti 1 e 2 hanno trovato

## 3.0 Come è stata fatta questa parte, e cosa non è confermato

Il budget di ricerca web era esaurito anche per questa parte (200 chiamate su
200, esattamente come per le prime due). Le fonti sono state aperte lo stesso, in
tre modi: `curl` sui file grezzi di GitHub, `gh api` per gli alberi git e la
ricerca di codice, e il fetcher standard per le pagine di documentazione che lo
consentono. **Reddit non è stato usato: risponde 403 e nessuna affermazione qui
sotto vi poggia.**

Tre fatti di questa parte non vengono da documentazione ma **dal codice
sorgente**, letto riga per riga: il caricatore di skill di Gemini CLI, il suo
tool `activate_skill`, e il suo gestore di integrità delle policy. Dove cito
codice, cito il file e la funzione. È l'unico modo di rispondere alla domanda
«una skill può auto-approvarsi i tool?» senza fidarsi di un riassunto.

Le quattro cose che **non** sono state confermate stanno in §3.8, in fondo, come
elenco separato. Non sono state dedotte e non sono state riempite con
ragionevolezza.

## 3.1 Quali skill adottare per prime

### Il criterio che decide tutto, e non è la licenza

La licenza dice cosa **si può** spedire. Ma la domanda dell'owner era *«a cosa
servirebbero su un telefono»*, e lì il filtro che elimina più candidati è un
altro, ed è quello che Google ha scritto in una riga sola
([skills/README.md](https://github.com/google-ai-edge/gallery/blob/main/skills/README.md)):

> *«Unlike cloud-based LLMs that can spin up containers or access a terminal to
> run Python scripts or CLI tools, on-device LLMs operate within a sandboxed
> mobile environment. They cannot easily execute arbitrary system commands or
> local scripts.»*

**Su un telefono non c'è una shell.** Una skill Apache-2.0, perfettamente
redistribuibile, che nel corpo dice «esegui `scripts/extract.py`» non è vietata:
è **inerte**. E una skill inerte è peggio di una skill assente, perché occupa
posto nel catalogo e il modello la sceglie, prova, fallisce. È lo stesso guasto
che OpenAI ha in produzione con `gh-fix-ci`
([#10695](https://github.com/openai/codex/issues/10695), §1.5).

Il censimento va quindi rifatto su **due assi**, non uno: *licenza* × *cosa
serve per girare*. Ne escono tre livelli.

### Livello 0 — le undici che girano già su un telefono, oggi

Sono le skill della Google AI Edge Gallery. **Licenza: Apache-2.0**, dal file
`LICENSE` alla radice del repository
([google-ai-edge/gallery](https://github.com/google-ai-edge/gallery)). Verifica
fatta: sull'albero git ricorsivo **non esiste alcun file `LICENSE` o `NOTICE`
sotto `skills/`** — non c'è la scacchiera di Anthropic, la licenza del
repository copre tutto (metodo: `gh api .../git/trees/main?recursive=1` filtrato
su `^skills/.*licen|notice`, zero risultati, 2026-08-02). Le tre skill
`featured`, benché il README le presenti come contributi della community,
portano ciascuna nel proprio README *«Copyright 2026 Google LLC / Licensed under
the Apache License, Version 2.0»*.

| Skill | `description` testuale | Perché su un telefono |
|---|---|---|
| `query-wikipedia` | *«Query summary from Wikipedia for a given topic.»* | **La più importante del lotto.** Un modello da 2-4 B non sa nulla dopo il proprio taglio e non ha browsing. Questa è l'unica messa a terra fattuale che costa una `fetch` |
| `calculate-hash` | *«Calculate the hash of a given text.»* | Il modello locale sbaglia l'aritmetica esatta; il JS no. È il caso di scuola del «delega al codice» |
| `qr-code` | *«Generates a QR code for the given url.»* | Output visuale nella chat, zero rete, zero permessi |
| `interactive-map` | *«Show an interactive map view for the given location.»* | Dimostra il ritorno di una **webview** dentro la conversazione |
| `mood-tracker` | *«A simple mood tracking skill that stores your daily mood and comments…»* | L'unica del lotto con **stato persistente**: serve come banco di prova di dove una skill scrive |
| `send-email` | *«Send an email.»* | È la skill di **intent nativo**, cioè la porta che il programma Shizuku vuole spalancare. Da adottare come *forma*, non come funzione |
| `text-spinner`, `kitchen-adventure` | demo | Non sono prodotto. Sono ottime **fixture di regressione** per il caricatore |
| `mood-music` (featured) | genera musica via API Loudly | Il caso d'uso del **segreto dell'utente** (§3.4) |
| `restaurant-roulette` (featured) | ricerca ristoranti in una ruota | Rete + UI ricca |
| `virtual-piano` (featured) | tastiera virtuale | **Attenzione alla catena di licenze**: gli 88 file `.mp3` non sono di Google. Il README dichiara *«piano sound are from https://github.com/fuhton/piano-mp3 under MIT license»*. È l'esempio pratico che gli *asset* di una skill hanno una licenza propria, distinta dal codice |

**Perché queste per prime, e non le più famose:** perché sono le uniche a essere
state scritte **contro il vincolo che abbiamo noi**. Girano in una WebView
nascosta, non chiedono una shell, non chiedono Python, e restituiscono testo,
un'immagine o una webview. TALOS ha già quella WebView — è Capacitor 8 + Vue 3.
Adottarle non è un port: è un caricamento.

### Livello 1 — le skill di sola prosa, che non chiedono niente all'ambiente

Sono skill il cui corpo è **istruzioni e basta**. Girano ovunque, incluso un
modello da 4 GB, perché l'unica risorsa che consumano è contesto.

**Da `anthropics/skills`** — Apache-2.0, `LICENSE.txt` presente in ciascuna
cartella (ri-verificato oggi con una richiesta HTTP per cartella: tutte 200):

| Skill | A cosa serve su TALOS |
|---|---|
| `skill-creator` | *«Create new skills, modify and improve existing skills, and measure skill performance…»* — è la skill che permette all'utente di **creare skill dal telefono**. Senza questa, la repo di skill è a senso unico |
| `mcp-builder` | *«Guide for creating high-quality MCP servers…»* — TALOS parla già MCP; questa è la controparte lato autore |
| `frontend-design` | *«Guidance for distinctive, intentional visual design when building new UI…»* — prosa pura, zero dipendenze |
| `internal-comms` | *«…status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports…»* — è il caso d'uso «assistente» che non richiede rete |
| `theme-factory` | 10 temi preimpostati di colori e font — utile per gli artefatti generati in chat |

**Da `openai/skills`** — Apache-2.0, `LICENSE.txt` presente e verificato oggi:

| Skill | A cosa serve su TALOS |
|---|---|
| `define-goal` | *«Help the user define a concrete, measurable goal before starting work…»* — è **il pezzo che manca alla piattaforma agentica**: prima di lanciare N agenti, definire cosa vuol dire «fatto» |
| `security-best-practices` | Review di sicurezza per python/js/ts/go. Il `description` dichiara i limiti da sé: *«Trigger only for supported languages»* |
| `security-threat-model` | *«…enumerates trust boundaries, assets, attacker capabilities, abuse paths, and mitigations…»* |
| `security-ownership-map` | Completa le due sopra |
| `.system/skill-creator`, `.system/plugin-creator` | Le controparti OpenAI di `skill-creator` |
| `.system/skill-installer` | **Da leggere come specifica, non da spedire.** È il codice che risolve il problema «catalogo remoto, non cablato» (§2.4), e ci serve il suo comportamento, non il suo testo |

### Livello 2 — quello che è redistribuibile ma non va spedito lo stesso

Qui la licenza dice sì e il giudizio dice no. Vale la pena essere espliciti,
perché è dove un elenco automatico sbaglierebbe.

- **`brand-guidelines` (Anthropic, Apache-2.0).** Redistribuibile alla lettera.
  Ma il `description` recita *«Applies **Anthropic's official** brand colors and
  typography»*. Spedirla dentro TALOS significa mettere l'identità visiva di
  Anthropic dentro il nostro prodotto — e **la Apache-2.0 non concede marchi**:
  la §6 della licenza esclude espressamente i trademark dal grant. Licenza
  concessa, marchio no. **Non si spedisce.**
- **`webapp-testing`, `web-artifacts-builder`, `slack-gif-creator`,
  `canvas-design`, `algorithmic-art`, `claude-api` (Anthropic, Apache-2.0).** Tutte
  legittime, tutte **inerti sul telefono**: presuppongono Playwright, `bash`,
  Python, un filesystem di progetto. `webapp-testing` dice testualmente *«write
  native Python Playwright scripts»*. Sul telefono non c'è Python.
- **`pdf`, `transcribe`, `speech` (OpenAI, Apache-2.0).** Le più tentanti e le
  più ingannevoli. `pdf` vuole *«Poppler»* e *«`reportlab`, `pdfplumber`,
  `pypdf`»*; `speech` dichiara *«require `OPENAI_API_KEY` for live calls»*. La
  prima è inerte, la seconda trasforma una skill locale in un cliente di OpenAI
  a spese dell'utente. Se un giorno TALOS avrà un runtime Python on-device, si
  riaprono; oggi no.
- **`docx`, `pdf`, `pptx`, `xlsx`, `doc-coauthoring` (Anthropic).** Già chiuse in
  §2.2. Ri-verificato oggi: `doc-coauthoring/LICENSE.txt` continua a restituire
  **404**. Nessuna licenza resta nessun permesso.
- **Le 8 `figma-*` (OpenAI).** Licenza Figma, escluse in §2.3.

### Il numero, in chiaro

**Adottabili subito e utili su un telefono: 11 dalla Gallery + 5 da Anthropic +
6 da OpenAI = 22 skill.** Tutte Apache-2.0, tutte con il file di licenza
verificato aprendolo. Non sono le 165.788 stelle di `anthropics/skills`: sono le
ventidue che funzionano dentro il vincolo che abbiamo.

## 3.2 La repo remota e firmata: cosa copiare, cosa non copiare

### Il confronto che l'owner ha chiesto, risolto sul codice

**Gemini CLI: una skill non può auto-approvarsi i tool. E il motivo è più
radicale di una policy — il campo non viene proprio letto.**

Il caricatore di skill è
[`packages/core/src/skills/skillLoader.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/skills/skillLoader.ts).
La sua funzione di parsing ha questa firma, testuale:

```ts
export function parseFrontmatter(
  content: string,
): { name: string; description: string } | null
```

E la struttura che ne esce, `SkillDefinition`, contiene esattamente: `name`,
`description`, `location`, `body`, `disabled?`, `isBuiltin?`, `extensionName?`.
**`allowed-tools` non compare da nessuna parte.** Un `SKILL.md` che dichiari
`allowed-tools: Bash(rm:*)` viene caricato senza errori e quel campo finisce nel
nulla. *Un campo che non viene interpretato non può essere abusato.*

Cosa succede all'attivazione lo dice
[`packages/core/src/tools/activate-skill.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/activate-skill.ts).
Due gesti, e due soli. Primo, un consenso — `getConfirmationDetails()` compone
un dialogo intitolato `Activate Skill: <nome>` che mostra la descrizione e
l'elenco dei file, sotto l'etichetta **«Resources to be shared with the
model»**; le skill `isBuiltin` sono le uniche che lo saltano. Secondo, l'unico
privilegio concesso, con il commento originale del codice accanto:

```ts
// Add the skill's directory to the workspace context so the agent has permission
// to read its bundled resources.
this.config.getWorkspaceContext().addDirectory(path.dirname(skill.location));
```

**L'attivazione di una skill, in Gemini CLI, concede una cosa sola: leggere la
propria cartella.** Non un tool, non un comando, non un permesso di rete.

E la documentazione impone **due consensi distinti**, non uno
([using-agent-skills.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md)):

> *«1. **Installation consent**: When installing from a remote URL, you will be
> asked to confirm the source. 2. **Activation consent**: Every time a skill is
> triggered during a session, the agent must ask for permission to activate it
> and gain access to its resources.»*

C'è un dettaglio che chiude il cerchio e che si vede solo scavando. Nel
repository di Gemini CLI esiste
`.gemini/skills/async-pr-review/policy.toml`: una skill con accanto la propria
policy permissiva, che pre-approva decine di comandi. Sembrerebbe la
contraddizione. Non lo è: quella policy **non viene letta dal caricatore**. È lo
script della skill stessa a passarla a mano, con
`gemini --policy "${POLICY_PATH}" -p …`
([async-review.sh](https://github.com/google-gemini/gemini-cli/blob/main/.gemini/skills/async-pr-review/scripts/async-review.sh),
riga 85). Cioè: per ottenere quei permessi bisogna eseguire uno script, e per
eseguire uno script bisogna che l'utente lo approvi. **Anche quando una skill
vuole allargarsi, deve passare da una porta che l'utente apre.**

**Copilot / VS Code: l'esatto opposto, e in una riga.** Dal file sorgente della
documentazione ufficiale
([`docs/agent-customization/agent-plugins.md`](https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/agent-plugins.md),
riga 276; pagina pubblicata:
[code.visualstudio.com/docs/agent-customization/agent-plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins);
`DateApproved: 7/29/2026` nel front matter del file):

> *«Plugin MCP servers are implicitly trusted when you install the plugin.
> Unlike workspace MCP servers, they do not show a separate trust prompt at
> startup.»*

Il resto della pagina conferma che è una scelta, non una svista: la fiducia si
concede **una volta al marketplace** (*«The first time you install a plugin from
a new marketplace, VS Code shows a trust prompt»*), e da lì in avanti tutto ciò
che il bundle contiene entra senza altre domande — mentre la pagina stessa
avverte che *«Plugins can include hooks and MCP servers that run code on your
machine»*.

**La differenza in una frase.** In Gemini CLI il consenso è **per attivazione**
e non è delegabile al contenuto; in Copilot il consenso è **per installazione**
e si eredita a tutto il pacchetto. Il primo modello sopravvive a un pacchetto
malevolo che passi il controllo iniziale. Il secondo no.

**E Claude Code sta dalla parte di Copilot, ma almeno lo scrive.** La
documentazione di Claude Code dice, testuale
([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)):

> *«Review project skills before trusting a repository, since a skill can grant
> itself broad tool access.»*

*Una skill può concedere a se stessa un accesso ampio ai tool.* È l'ammissione
esplicita che `allowed-tools` **allarga** (§2.1) e che il presidio è la
diligenza dell'utente. Su un telefono, dove l'utente non legge un `SKILL.md`
prima di premere «installa», quel presidio non esiste.

### Il quadro completo, cinque host su una riga ciascuno

| Host | Cosa verifica | Chi paga se l'hosting viene compromesso |
|---|---|---|
| **Anthropic** (marketplace) | JSON su git, pinning allo SHA, allowlist amministrativa. *«Plugins and marketplaces are highly trusted components that can execute arbitrary code»* ([discover-plugins](https://code.claude.com/docs/en/discover-plugins)) | L'utente |
| **OpenAI** (`skill-installer`) | Nulla. Catalogo letto dall'API GitHub, download diretto | L'utente |
| **Google** (Gallery) | Allowlist di host **cablato nell'APK** + allowlist remota in JSON + disclaimer testuale (§2.4) | L'utente |
| **Gemini CLI** (policy) | **SHA-256 sull'intera cartella di policy**, tre stati `NEW`/`MATCH`/`MISMATCH` ([`policy/integrity.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/integrity.ts)) | Nessuno, se l'utente rifiuta al `MISMATCH` |
| **Copilot / VS Code** | Un prompt al marketplace, poi fiducia implicita sul bundle | L'utente |

Il quarto è l'unico che assomiglia a qualcosa. `PolicyIntegrityManager` calcola
un SHA-256 deterministico su percorso relativo + contenuto di ogni file di
policy (ordinati, con separatore `\0`), lo confronta con l'ultimo accettato, e
distingue **«mai visto»** da **«cambiato sotto i piedi»**. Non è una firma — è
*trust on first use* — ma è **la struttura di controllo giusta su cui montare
una firma**: c'è già il punto in cui il codice decide se procedere.

**Nota che vale quanto le altre cinque righe:** la specifica del formato non ha
niente da dire in materia. L'indice ufficiale
[agentskills.io/llms.txt](https://agentskills.io/llms.txt) elenca **nove**
documenti — implementazione client, vetrina, panoramica, best practice,
valutazione, ottimizzazione delle descrizioni, quickstart, uso degli script,
specifica — e **nessuno riguarda sicurezza, fiducia, firma o provenienza**. La
pagina della specifica non contiene una sezione di sicurezza. Anche la
specifica MCP, che pure ha un documento di sicurezza lungo e serio
([modelcontextprotocol.io/specification/draft/basic/security_best_practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)),
copre confused deputy, token passthrough, SSRF, dirottamento di handle,
compromissione di server locali — e **non definisce alcuna firma o verifica di
provenienza**. Il silenzio degli standard non è un'approvazione: è un vuoto.

### Cosa copiare, in ordine di importanza

1. **Il parser che legge solo `name` e `description`** (Gemini CLI). Tutto il
   resto del frontmatter è dato da mostrare, non configurazione da applicare.
   `allowed-tools` va **letto e ignorato**, e la sua presenza va mostrata
   all'utente come «questa skill chiede X» — mai eseguita.
2. **I due consensi separati** (Gemini CLI): installazione e attivazione. Il
   secondo è quello che manca a tutti gli altri.
3. **L'attivazione concede una cosa sola**: leggere la propria cartella.
4. **Il controllo di integrità con tre stati** (Gemini CLI), promosso da hash a
   firma: manifesto remoto firmato Ed25519, chiave pubblica nell'APK, verifica
   **prima** del parsing del frontmatter, rifiuto in caso di firma assente o non
   valida. Fail-closed, come Codex su macOS: *«if the selected policy cannot be
   enforced by the platform sandbox, Codex refuses to run the command»* (§1.6).
   Il `MISMATCH` di Gemini diventa da noi «la skill è cambiata dopo che l'hai
   approvata»: schermata, non log.
5. **La lista di chiavi che una configurazione locale non può sovrascrivere**
   (Codex, §1.5 punto 5). Da noi: nessuna skill, in nessuna forma, tocca il
   provider del modello, l'endpoint, la telemetria, le chiavi dell'utente.
6. **Il confine del plugin che coincide col confine della licenza** (Anthropic,
   §2.2). Un catalogo che mescola licenze deve renderle separabili con un gesto.
7. **La composizione delle decisioni di permesso** (VS Code, riga 209 dello
   stesso file): *«the most restrictive permission decision across all hooks
   wins: `deny` overrides `ask`, which overrides `allow`»*. È l'unica regola di
   composizione che non si può sbagliare.
8. **Il passaggio dei segreti della Gallery**, che è la risposta diretta al
   guasto di Codex `gh-fix-ci`: *«If your JS script requires an API key or
   token, **do not pass it through the LLM prompt**. Instead, the AI Edge
   Gallery app provides a secure mechanism: it will display a native dialog to
   the user to input the required secret… which is then passed directly to your
   script»*, dichiarato con `require-secret: true` nei `metadata` e ricevuto
   come **secondo parametro** della funzione JS
   ([skills/README.md](https://github.com/google-ai-edge/gallery/blob/main/skills/README.md)).
   Il segreto non attraversa mai il modello.

### Cosa non copiare, e perché

1. **La fiducia implicita di Copilot.** Un consenso all'installazione che si
   eredita a tutto il pacchetto per sempre. Su desktop è discutibile; su un
   telefono con Shizuku è inaccettabile.
2. **`allowed-tools` come auto-concessione.** Se lo implementiamo come lo
   implementa Claude Code, importiamo la frase *«a skill can grant itself broad
   tool access»* dentro un'app che può toccare il sistema operativo.
3. **L'allowlist di host cablata nell'APK** (Google). Viola direttamente il
   vincolo *«app distribuita: niente statico»*: un elenco che invecchia dentro
   il binario. E l'allowlist remota della loro build open source è **svuotata**
   (`SKILL_ALLOWLIST_URL = ""`), cioè la funzione esiste solo nella loro build.
4. **«È su GitHub sotto la nostra organizzazione»** come intero modello di
   fiducia (OpenAI). Lega la sicurezza al controllo di un account.
5. **Il silenzio della specifica.** Non aspettare che `agentskills.io` aggiunga
   una sezione di sicurezza per progettarne una.
6. **La delega alla diligenza dell'utente.** Tutti e cinque gli host, alla fine,
   scrivono una variante di «controlla prima di installare». È la parte del
   modello che non sopravvive al passaggio su mobile.

### Dove ci mette, nella tassonomia interna

§2.4 concludeva che la firma è **L2 immediato**, e **L3** se verificata sul
dispositivo. Il lavoro di questa parte lo conferma e aggiunge un secondo asse:
**il consenso per attivazione** esiste già (Gemini CLI) ma nessuno lo ha portato
su mobile, e **il parser che ignora i campi di privilegio** esiste già (Gemini
CLI) ma nessuno lo ha combinato con una firma. La combinazione *firma verificata
sul dispositivo + frontmatter senza potere + consenso a ogni attivazione* non è
implementata da nessuno dei cinque host censiti. **Quello è il L3.**

## 3.3 Due porte: cosa implica sul formato e sulla registrazione

### Il modello di riferimento esiste, ed è a due assi

Claude Code è l'unico host censito che tratta le due porte come **due assi
indipendenti**, e pubblica la tabella
([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)):

| Frontmatter | L'utente può invocarla | Il modello può invocarla | Quando entra in contesto |
|---|---|---|---|
| (default) | Sì | Sì | Descrizione sempre in contesto, corpo all'invocazione |
| `disable-model-invocation: true` | Sì | No | **Descrizione non in contesto**, corpo all'invocazione |
| `user-invocable: false` | No | Sì | Descrizione sempre in contesto, corpo all'invocazione |

Con la motivazione, che è quella giusta: *«Use this for workflows with side
effects or that you want to control timing, like `/commit`, `/deploy`, or
`/send-slack-message`. You don't want Claude deciding to deploy because your code
looks ready.»*

**Gemini CLI, per contro, ha una porta sola — la sua.** Testuale, dalla pagina
del tool: *«The `activate_skill` tool is used exclusively by the Gemini agent.
**You cannot invoke this tool manually.**»*
([docs/tools/activate-skill.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/activate-skill.md)).
I comandi `/skills list|enable|disable|reload` gestiscono il catalogo, non
invocano la skill. Un utente Gemini CLI **non può dire «usa questa skill adesso»**:
può solo sperare che il modello la scelga. È esattamente la metà di funzione che
il vincolo TALOS vieta.

### Cosa implica sul formato

**La `description` è una superficie di prodotto con due pubblici, non una
docstring.** Entrambe le fonti primarie lo dicono nello stesso modo: per la
specifica, *«The `name` and `description` fields are loaded at startup for all
skills»*; per Gemini, *«This is the only information the model has before
activation»*
([skills-best-practices.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills-best-practices.md)).
Ma con due porte quella stessa stringa la legge anche **l'umano**, nel menu
della chat e nell'elenco della stazione. I 1024 caratteri della specifica sono
un **tetto**, non un obiettivo: su un telefono la descrizione va scritta per
essere letta su tre righe e instradata da un modello da 4 B. Conseguenza pratica:
serve una **regola redazionale interna**, non solo un limite tecnico.

**Il `name` è già il token del comando.** La specifica lo vincola a `a-z`, `0-9`
e trattini, e impone che coincida col nome della cartella. Non serve inventare
un secondo schema di nomi per la porta della chat: `/nome-skill` è dato dal
formato. Uno schema di nomi in più sarebbe una divergenza dallo standard senza
guadagno.

**I due interruttori non sono campi di primo livello.** La specifica ha
**esattamente sei** campi (§2.1) e aggiungerne di nostri romperebbe la
compatibilità che la Parte 2 ha guadagnato. Vanno dove §2.1 ha già individuato
il posto: `metadata` per le cose semplici, `agents/talos.yaml` per le cose
strutturate (tool richiesti, permessi Shizuku, livello di rischio, se la skill
funziona col motore locale). Un client che non conosce TALOS ignora il file
affiancato e la skill continua a funzionare; è additivo, non divergente.

**Il corpo non deve sapere da quale porta è entrato.** Stesso `SKILL.md`, stesse
risorse. L'unica cosa che cambia legittimamente è **l'argomento**: dalla chat
arriva testo libero, dalla piattaforma agentica arriva un payload strutturato.
Claude Code risolve con la sostituzione di `$ARGUMENTS` e `$1..$n`; è il
meccanismo minimo, e va progettato subito, perché aggiungerlo dopo significa
riscrivere ogni skill già pubblicata.

### Cosa implica sulla registrazione

**Un solo registro, due adattatori.** Se la chat e la piattaforma agentica
scoprono le skill con due percorsi diversi, prima o poi divergono. Codex ha già
questo guasto in produzione, tracciato due volte:
[#9752](https://github.com/openai/codex/issues/9752) (skill di progetto non più
scoperte) e [#9226](https://github.com/openai/codex/issues/9226) (script sotto
`scripts/` non scoperti). La scoperta va fatta **una volta**, e le due porte
devono essere due viste sullo stesso indice.

**La registrazione dev'essere osservabile.** Corollario diretto delle due issue
qui sopra: una skill che sparisce in silenzio è indistinguibile da una skill che
non è mai stata installata. Serve una schermata che dica **cosa è stato
scoperto, cosa è stato scartato e perché** (firma assente, `name` non conforme,
cartella e `name` che non coincidono, licenza mancante). Questo è anche il
posto naturale in cui mostrare i campi ignorati del punto 1 di §3.2.

**Le due porte hanno rischi diversi, e la differenza va codificata.** Dalla chat
l'utente è presente e vede l'effetto; dalla piattaforma agentica può non
esserci. `disable-model-invocation` esiste esattamente per questo. Su TALOS con
Shizuku la regola dev'essere più stretta di quella di Claude Code: **una skill
che agisce sul sistema operativo è invocabile solo dall'utente**, finché
l'utente non ne alza esplicitamente il livello — che è la forma che i sette
livelli di rischio del documento-visione Shizuku devono prendere qui.

**E c'è un vincolo che nessuno dei due host affronta**: la porta della chat e
quella della piattaforma agentica **possono essere attive insieme**. Due agenti
paralleli che attivano la stessa skill con stato persistente (`mood-tracker` è
l'esempio nel Livello 0) si pestano i piedi. Codex risolve il problema analogo
con i worktree git (§1.4); noi non abbiamo worktree, quindi la risposta deve
stare nel formato: **una skill dichiara se ha stato**, e se ce l'ha il registro
la serializza.

## 3.4 Una skill scaricata è un dato, mai un'istruzione

### Cosa dicono le fonti sulla prompt injection

**La specifica del formato non dice niente.** È il fatto più importante di
questa sezione e va ripetuto: i nove documenti di
[agentskills.io/llms.txt](https://agentskills.io/llms.txt) non includono una
pagina di sicurezza, e la
[specifica](https://agentskills.io/specification) non contiene una sezione di
sicurezza. **Il formato che 44 prodotti hanno adottato non definisce un modello
di minaccia.** Ogni host se lo è costruito da sé, e le differenze le abbiamo
viste in §3.2.

**Chi lo definisce meglio è Microsoft**, nella pagina di sicurezza degli agenti
([`docs/agents/security.md`](https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agents/security.md)):

> *«AI systems are vulnerable to prompt injection attacks where malicious
> content in tool outputs influences the AI's behavior and decision-making. This
> content might be visible to the user, or hidden in comments or obscured
> through formatting.»*

E le quattro classi di rischio, testuali, che sono la lista di controllo più
utile trovata in tutta la ricerca:

- *«**Data exfiltration**: Sensitive information can be extracted and sent to
  unauthorized parties through tool invocations or terminal commands.»*
- *«**Context contamination**: Malicious content introduced into the workspace
  through files, comments, or tool outputs can influence the AI's understanding
  of the task.»*
- *«**Tool output chaining**: Output from one tool becomes input for another,
  creating opportunities for malicious content to propagate through the system.»*
- *«**External data processing**: When the AI processes untrusted content from
  files, web requests, or external tools, malicious instructions embedded in
  that content can be interpreted as legitimate commands.»*

Con l'avvertenza, nella stessa pagina, che le regole di auto-approvazione **non
bastano**: *«Agent sandboxing is the strongest protection against malicious
terminal commands. If prompt injection is a concern, use agent sandboxing…
rather than relying on auto-approval rules alone. Auto-approval rules use
best-effort command parsing and have known limitations with shell aliases, quote
concatenation, and complex shell syntax.»*

### Cosa fanno gli host per difendersi — e la cosa che nessuno fa

Le difese realmente implementate, ciascuna con la fonte:

| Difesa | Chi | Testo |
|---|---|---|
| **Finestra di contesto isolata per il contenuto scaricato** | Claude Code | *«Isolated context windows: Web fetch uses a separate context window to avoid injecting potentially malicious prompts»* ([security](https://code.claude.com/docs/en/security)) |
| **Approvazione in due tempi sull'URL, con revisione del contenuto** | VS Code | *«First, it asks you to trust the domain… Then, **after the content is fetched, it presents the content for review before it is passed to the model**»* |
| **Risultati di ricerca in cache per default** | Codex | Riduce *«exposure to prompt injection from arbitrary live content»* (§1.6) |
| **Rete tagliata durante la fase dell'agente** | Codex cloud | *«Codex blocks internet access during the agent phase»* (§1.6) |
| **Fail-closed sul matching dei comandi** | Claude Code | *«Fail-closed matching: Unmatched commands default to requiring manual approval»* |
| **Consenso a ogni attivazione** | Gemini CLI | §3.2 |
| **Delimitazione del corpo della skill** | Gemini CLI | Il corpo viene incapsulato in `<activated_skill name="…"><instructions>…</instructions><available_resources>…</available_resources></activated_skill>` ([activate-skill.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/activate-skill.ts)) |

**E adesso la cosa scomoda, che va detta perché è il cuore della domanda.**
Nessuno dei cinque host tratta davvero il corpo di una skill come un dato. Tutti
lo **iniettano come istruzione**. Il tag `<activated_skill>` di Gemini è una
delimitazione, non una neutralizzazione: il testo dentro resta prosa che il
modello legge come guida. Claude Code lo dice senza infingimenti: *«the rendered
`SKILL.md` content enters the conversation as a single message and stays there
for the rest of the session»*. Una skill firmata e una skill scaricata da un URL
arbitrario, una volta attivate, hanno **esattamente lo stesso potere retorico**.

Quindi: **«una skill è un dato, mai un'istruzione» non è parità. È una cosa che
TALOS deve inventare.** Nella tassonomia interna è L3, come la firma, e per lo
stesso motivo — nessuno ce l'ha.

### La forma concreta che può prendere su TALOS

Il vincolo che l'owner ha già scritto altrove — *metadati = dati, mai istruzioni*
— si applica qui con quattro conseguenze operative:

1. **La firma è il confine fra dato e istruzione.** Una skill con firma valida
   contro la chiave nell'APK entra come istruzione. Una skill senza firma —
   caricata da URL, da file, da messaggio — entra come **dato**: il suo corpo si
   mostra all'utente, si può leggere, non si attiva mai da sola. È la
   traduzione onesta del `--consent` di Gemini, che oggi serve a *saltare* il
   controllo; da noi serve a *concederlo*.
2. **Il catalogo è sempre dato.** Le `description` di N skill entrano nel prompt
   come elenco delimitato, con una regola permanente accanto che dice al modello
   che quel blocco descrive strumenti disponibili e non contiene istruzioni da
   eseguire. È la difesa più economica che esista e va messa al primo giro,
   perché la `description` è **l'unico campo che un attaccante controlla e che
   entra in contesto senza nessuna attivazione**.
3. **Nessuna skill cambia lo stato dei permessi.** La regola di Gemini,
   applicata alla lettera: il frontmatter non ha potere, `agents/talos.yaml` è
   una **richiesta** che l'utente concede, mai una concessione che la skill si
   prende.
4. **I metadati possono contenere chiavi.** È la lezione di
   [#31588](https://github.com/openai/codex/issues/31588) (§1.5): gli URL dei
   remote git con dentro un PAT finivano non sanificati nei file di sessione e
   venivano spediti all'API. Da noi: **i metadati di una skill non partono mai
   verso un provider cloud senza sanificazione**, e il `require-secret` della
   Gallery (§3.2, punto 8) è il meccanismo che impedisce a un segreto di entrare
   nel prompt in primo luogo.

## 3.5 iOS: il testo esatto di 2.5.2 e 4.7.2, e cosa comporta

### Le due regole, verbatim

Da [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/),
lette il 2026-08-02:

> **2.5.2** *«Apps should be self-contained in their bundles, and may not read or
> write data outside the designated container area, nor may they **download,
> install, or execute code which introduces or changes features or functionality
> of the app**, including other apps. Educational apps designed to teach,
> develop, or allow students to test executable code may, in limited
> circumstances, download code provided that such code is not used for other
> purposes. Such apps must make the source code provided by the app completely
> viewable and editable by the user.»*

> **4.7.2** *«**Your app may not extend or expose native platform APIs or
> technologies to the software without prior permission from Apple.**»*

### La deroga che salva l'idea, e che va letta insieme

Presa da sola, la 2.5.2 chiuderebbe la partita: una repo di skill scaricabili è
letteralmente *download di codice che introduce funzionalità nell'app*. Ma la
2.5.2 non va letta da sola, perché la **4.7** apre una porta stretta e precisa:

> **4.7 — Mini apps, mini games, streaming games, chatbots, plug-ins, and game
> emulators.** *«Apps may offer certain software that is not embedded in the
> binary, specifically **HTML5 and JavaScript mini apps** and mini games,
> streaming games, chatbots, and **plug-ins**. […] You are responsible for all
> such software offered in your app, including ensuring that such software
> complies with these Guidelines and all applicable laws. Software that does not
> comply with one or more guidelines will lead to the rejection of your app. You
> must also ensure that the software adheres to the additional rules that follow
> in 4.7.1 through 4.7.5.»*

**Conclusione, e non è quella che ci si aspetta.** Una repo di skill scaricabili
**è ammissibile su iOS a una condizione sola: che le skill siano HTML5 e
JavaScript, e niente altro.** Nessun binario, nessuno script nativo, nessuna
shell. Che è — parola per parola — l'architettura della Google AI Edge Gallery
descritta in §2.5: la logica in un file HTML dentro una WebView nascosta.

E non è teoria: **la Gallery è sull'App Store**. Il README linka
[apps.apple.com/us/app/google-ai-edge-gallery/id6749645337](https://apps.apple.com/us/app/google-ai-edge-gallery/id6749645337)
e dichiara *«Android 12 and up, and iOS 17 and up»*
([README](https://github.com/google-ai-edge/gallery/blob/main/README.md)). C'è
anche un allowlist di modelli specifico per iOS nel repository
(`model_allowlists/ios_1_0_0.json`, con Gemma-3n E2B e E4B, `accelerators:
"gpu"`, `minDeviceMemoryInGb` 6 e 8). Un'app che fa girare LLM locali su iPhone
esiste e ha superato la review.

### La 4.7.2 è il vero muro, ed è quello che colpisce Shizuku

La 2.5.2 riguarda il *come* si esegue; la **4.7.2 riguarda il *cosa si può
toccare***. *«Your app may not extend or expose native platform APIs or
technologies to the software without prior permission from Apple.»*

Un tool `run_intent` **il cui elenco di intent fosse scaricabile** sarebbe
esattamente questo: esporre API native al software scaricato. E qui si capisce
perché Google ha fatto una scelta che in §2.5 sembrava un limite tecnico:

> *«While the app currently supports sending email and sending text out of the
> box, **supporting additional native intent-based skills requires updating the
> app's source code**. To add new capabilities, such as opening the camera,
> setting alarms, etc., you must define the logic within the app's codebase.»*

**Quella non è una scorciatoia: è conformità alla 4.7.2.** L'insieme degli
intent è cablato nell'app e cambia solo con una release, quindi nessuna software
scaricata «estende o espone» API native. Google ha pagato il prezzo giusto per
poter stare sullo Store.

### Le tre regole che nessuno cita e che sono obblighi di prodotto

- **4.7.1** — il software offerto deve *«follow all privacy guidelines… include
  a method for filtering objectionable material, a mechanism to report content
  and timely responses to concerns, and the ability to block abusive users»*, e
  seguire la 3.1 per i beni digitali. **Un catalogo di skill di terzi implica una
  moderazione e un canale di segnalazione**, non solo una firma.
- **4.7.3** — *«Your app may not share data or privacy permissions to any
  individual software offered in your app without explicit user consent in each
  instance.»* Cioè: **il consenso per attivazione di Gemini CLI (§3.2) non è solo
  buona ingegneria: su iOS è un obbligo di review.** «in each instance», non una
  volta all'installazione. La fiducia implicita di Copilot, su iOS, è
  irregolare.
- **4.7.4** — *«You must provide an index of software and metadata available in
  your app. It must include universal links that lead to all of the software
  offered in your app.»* Ogni skill del catalogo deve avere una **pagina web
  pubblica raggiungibile da universal link**. Che, guarda caso, è anche il posto
  dove pubblicare la scheda di provenienza e la licenza — le due cose che il
  programma «library file provenance record» già chiede.
- **4.7.5** — identificazione del software oltre la fascia d'età dell'app e
  meccanismo di limitazione per età.

### Cosa fare oggi, sapendo questo

TALOS si distribuisce fuori dal Play Store (documento di distribuzione), e su
Android **niente di tutto questo si applica**. Ma il costo di ignorarlo non è
zero, è **differito**: se un giorno esiste una versione iOS, un catalogo di
skill che mescola JS e azioni native va riscritto tutto.

La mitigazione costa una riga adesso: **`agents/talos.yaml` porta un campo di
modalità di esecuzione** — `js` (WebView, portabile su iOS) contro `native`
(intent/Shizuku, solo Android, mai scaricabile come dato) — e il catalogo lo
espone come filtro. La divisione della 4.7 diventa un attributo del formato
invece che una migrazione.

## 3.6 Il vincolo del contesto: 4k non è 200k

### Prima i numeri veri, poi l'aritmetica

L'unica misura affidabile di «quanto contesto ha un modello su un telefono» è
quella che un'app spedita dichiara per i modelli che spedisce. Dal file di
allowlist della Google AI Edge Gallery
([`model_allowlists/1_0_15.json`](https://github.com/google-ai-edge/gallery/blob/main/model_allowlists/1_0_15.json),
letto il 2026-08-02):

| Modello | `maxTokens` | Peso su disco |
|---|---|---|
| Gemma-4-E2B-it | **4.000** | 2,59 GB |
| Gemma-4-E4B-it | **4.000** | 3,66 GB |
| Gemma-3n-E2B-it | **4.096** | 3,66 GB |
| Gemma-3n-E4B-it | **4.096** | 4,92 GB |
| Gemma3-1B-IT | **1.024** | 584 MB |
| Qwen2.5-1.5B-Instruct | **4.096** | 1,60 GB |
| DeepSeek-R1-Distill-Qwen-1.5B | **4.096** | 1,83 GB |
| TinyGarden-270M, MobileActions-270M | **1.024** | 289 MB |

E la conferma testuale nella descrizione che Google scrive per Gemma 3n:
*«The current checkpoint only supports text and vision input, **with 4096 context
length**.»* L'allowlist iOS dichiara gli stessi 4.096.

Per llama.cpp — che è il motore di TALOS — il default è diverso ma non più
generoso in pratica: `n_ctx = 0` significa *«context the model was trained
with»*, e la costante che governa la riduzione automatica per stare in memoria è
`fit_params_min_ctx = 4096`
([`common/common.h`](https://github.com/ggml-org/llama.cpp/blob/master/common/common.h)).
Cioè: **quando llama.cpp deve stringere per farci stare il modello, il pavimento
è 4.096.** Il numero che l'owner ha in testa non è un'ipotesi prudente: è quello
che i due stack principali scrivono nei propri file.

**L'aritmetica, con le cautele.** La specifica dice che i metadati costano
*«~100 tokens»* per skill. Va segnalata una **discrepanza fra due fonti
primarie**: le best practice di Gemini CLI scrivono per lo stesso livello
*«Metadata (name + description): Always in context (**~100 words**)»* — parole,
non token, quindi una cifra più alta. Non le concilio: le riporto entrambe e uso
la più favorevole, che è quella della specifica.

Su una finestra di 4.096 token, con ~100 token di catalogo per skill:

- **10 skill** = ~1.000 token = **~24%** della finestra, prima che l'utente
  scriva.
- **20 skill** = ~2.000 token = **~49%**.
- **44 skill** (il catalogo di `openai/skills`) = ~4.400 token = **più
  dell'intera finestra**.

E questo *prima* del prompt di sistema, prima della cronologia, prima delle
definizioni dei tool, e prima del corpo della skill attivata — che la specifica
raccomanda sotto i 5.000 token, cioè **da solo più grande della finestra**.

**Il tetto, detto in chiaro: su 4k si tengono visibili circa 8-12 skill; su 32k
qualche decina.** Non centinaia. La frase di §2.1 — *«cento skill installate
costano ~10.000 token di catalogo»* — è corretta come aritmetica ma va letta
insieme a questa: **10.000 token è due volte e mezzo la finestra intera del
modello che gira sul telefono.** Cento skill installate sono compatibili con il
disco, non con il contesto.

### Cosa fanno gli host per limitare il costo

**1. Divulgazione progressiva** — è nella specifica (§2.1) e la implementano
tutti. Tre livelli: metadati sempre, corpo all'attivazione, risorse a richiesta.
È il pavimento, non il soffitto: **anche con la divulgazione progressiva perfetta,
i metadati di 44 skill non entrano in 4k.**

**2. Tool search** — Anthropic, generalmente disponibile sulla Claude API. Le
cifre, dalla pagina che le pubblica
([platform.claude.com — tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)):

> *«A typical multiserver setup (GitHub, Slack, Sentry, Grafana, and Splunk) can
> consume ~55k tokens in definitions before Claude does any work. Tool search
> typically reduces this by over 85 percent, loading only the 3–5 tools Claude
> needs for a given request.»*

E il secondo effetto, che su un modello piccolo pesa più del primo:

> *«Claude's ability to pick the right tool degrades once you exceed 30–50
> available tools.»*

Le soglie dichiarate per usarla: 10 o più tool, oppure definizioni oltre i 10k
token. I limiti: 10.000 tool differibili per richiesta, 5 risultati per ricerca,
almeno un tool non differito.

**3. Code mode / chiamata programmatica dei tool** — invece di far passare ogni
risultato intermedio dal modello, il modello scrive codice che chiama i tool e
riceve solo il risultato filtrato. Le cifre, con la loro provenienza distinta:

- Dalla documentazione: *«adding programmatic tool calling on top of basic
  search tools improved performance by an average of 11% while using **24% fewer
  input tokens**»*
  ([programmatic-tool-calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)),
  e *«intermediate results are not loaded into Claude's context window»*.
- Dal blog di ingegneria: *«This reduces the token usage from 150,000 tokens to
  2,000 tokens—a time and cost saving of 98.7%»*
  ([anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp)).
  **Attenzione:** questa seconda cifra è **un esempio illustrativo in un post del
  fornitore**, riferito a un singolo scenario (Google Drive → Salesforce), non a
  un benchmark. La riporto perché la fonte è primaria, ma non ha lo stesso peso
  del 24% misurato sopra.

**4. Budget e sfratto** — Claude Code, alla compattazione automatica: *«Claude
Code re-attaches the most recent invocation of each skill after the summary,
**keeping the first 5,000 tokens of each**. Re-attached skills share a combined
budget of **25,000 tokens**»*, riempito partendo dalla più recente, *«so older
skills can be dropped entirely»*. E Codex fissa il budget di contesto dei
metadati delle skill **al 2%**, come tracciato in
[#19679](https://github.com/openai/codex/issues/19679) (§1.5).

### Cosa significa per TALOS, in decisioni

1. **Il tool search di Anthropic è un servizio, non una libreria: non esiste per
   llama.cpp.** Va implementato lato client — e la documentazione dichiara che è
   legittimo farlo: *«You can implement your own tool search logic (for example,
   using embeddings or semantic search)»*. Su un telefono la scelta ovvia è
   **BM25 sul catalogo locale**, che non richiede un secondo modello, non
   richiede rete, e costa millisecondi. È esattamente una delle due varianti che
   Anthropic offre lato server (`tool_search_tool_bm25`).
2. **Il budget si esprime in percentuale della finestra, non in numero di
   skill.** Il 2% di Codex è la forma giusta; il numero fisso è la forma
   sbagliata. La finestra la conosce il motore quando carica il GGUF, quindi il
   tetto si deriva a runtime — che è anche l'unico modo di rispettare *«app
   distribuita: niente statico»*: nessun numero di skill cablato nell'APK.
3. **Il catalogo va ordinato, non elencato.** Su 4.096 token, dopo il prompt di
   sistema, ci stanno le descrizioni di 5-8 skill. Quali cinque è una decisione
   di prodotto: le fissate dall'utente, poi le più usate di recente, poi quelle
   pescate dalla ricerca sul turno corrente.
4. **Il code mode non è un'ottimizzazione: è la condizione di esistenza.** Ed è
   già disponibile — è la WebView nascosta della Gallery. Una skill che chiama
   Wikipedia e restituisce *«a concise summary (1-3 complete sentences) to
   conserve context»* — la frase è nel `SKILL.md` di `query-wikipedia`, e Google
   l'ha scritta per lo stesso motivo per cui la scriveremmo noi — è la
   differenza fra stare dentro 4k e non starci.
5. **Il contatore dei token è lo strumento principale, non un vezzo.** §1.5 lo
   ricavava dalla fatturazione ([#23794](https://github.com/openai/codex/issues/23794),
   173 commenti). Su un modello locale l'argomento è più forte: non si paga a
   token, ma **quando il contesto finisce la conversazione si degrada**, e
   l'utente deve poterlo vedere arrivare.
6. **Il tetto di 30-50 tool oltre il quale la selezione peggiora è misurato su
   Claude.** Su un modello da 2-4 B è ragionevole aspettarsi che sia più basso,
   ma **non ho una misura e non la invento**: è una cosa che TALOS deve misurare
   sul proprio telefono di prova, ed è un candidato naturale per il banco di
   benchmark già previsto dalla libreria modelli.

## 3.7 Le decisioni che questa parte lascia sul tavolo

Non sono raccomandazioni generiche: sono le scelte che vanno prese **prima** di
scrivere la prima riga del caricatore, perché ognuna è costosa da cambiare dopo.

1. **Il frontmatter non ha potere.** Si leggono `name` e `description`; tutto il
   resto è dato da mostrare. `allowed-tools` si legge, si mostra, non si applica.
2. **Due consensi, non uno.** Installazione e attivazione. Il secondo è anche un
   obbligo della 4.7.3 se un giorno si va su iOS.
3. **Firma Ed25519 verificata prima del parsing, fail-closed.** Il `MISMATCH` di
   Gemini diventa una schermata, non un log.
4. **La firma è il confine fra dato e istruzione.** Firmata = istruzione. Non
   firmata = dato, mostrata all'utente, mai auto-attivata.
5. **`agents/talos.yaml` è una richiesta, mai una concessione**, e porta il campo
   `js | native` che tiene aperta la strada iOS.
6. **Un registro, due adattatori, e una schermata che dice cosa è stato
   scartato e perché.**
7. **Il budget del catalogo è una percentuale della finestra del modello
   caricato**, e la selezione è BM25 locale.
8. **Il segreto non passa dal prompt**: dialogo nativo, secondo parametro,
   modello mai coinvolto.
9. **Le prime 22 skill sono quelle di §3.1**, e nessuna di esse presume una
   shell.

## 3.8 Cosa resta non confermato

Quattro cose. Nessuna è stata riempita per ragionevolezza.

- **Se l'app iOS della Google AI Edge Gallery spedisca davvero la funzione Agent
  Skills.** Il repository contiene solo la cartella `Android/`; il sorgente iOS
  non è pubblicato lì. Il README elenca le Agent Skills fra le funzioni senza
  qualificare il sistema operativo, ed esiste un allowlist di modelli iOS. Ma
  **non ho potuto verificare che la funzione ci sia**, e la differenza è esattamente
  il punto della §3.5. **Non confermato.**
- **Se Apple abbia mai concesso a qualcuno la «prior permission» della 4.7.2.**
  Le linee guida la nominano; non esiste, nella documentazione pubblica che ho
  potuto aprire, un elenco di deroghe concesse né una procedura per chiederla.
  **Non confermato.**
- **La data di ultimo aggiornamento delle App Review Guidelines.** Il testo di
  2.5.2, 4.7 e 4.7.1-4.7.5 è stato letto il 2026-08-02 ed è riportato verbatim,
  ma **la pagina, nel contenuto che ho ottenuto, non espone una data di
  revisione**. Le citazioni valgono per come stavano quel giorno.
- **Il numero oltre il quale la selezione delle skill peggiora su un modello
  on-device.** La cifra 30-50 è di Anthropic e si riferisce a Claude. Per un
  modello da 2-4 B non ho trovato una misura pubblicata e **non ne ho dedotta
  una**. Va misurata.

Una quinta, minore, per completezza: nei nomi dei file `.task` della Gallery
compaiono suffissi come `ekv1280` ed `ekv2048`, che sembrano indicare la
dimensione della cache KV. **L'interpretazione è mia e la fonte non la
dichiara**, quindi non l'ho usata per nessun calcolo: i numeri di §3.6 vengono
tutti dal campo `maxTokens` e dalle descrizioni testuali.

