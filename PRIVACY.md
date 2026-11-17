# Privacy

This page describes TALOS Desktop for Windows only. It does not cover the TALOS command-line app (CLI) or the Android phone app yet.
It was checked against the source code of the desktop 0.2.2 candidate on 11 November 2026, and that day the public model list was
also measured on the network; the update check and the update download are described from the code and not yet measured on the
installed app. *La versione italiana è più sotto.*

## In short

- **No TALOS account, no telemetry.** TALOS has no analytics, no crash reporting and no server of its own that receives your data.
- **Your work stays on your computer:** chats, sessions, projects, notes, settings and downloaded models.
- **TALOS goes online on its own in two cases only:** the update check, and the public model list from OpenRouter. Both are described
  below, with what they send and how to turn them off. The public model list is **off by default**: it starts only after you pick
  an OpenRouter model, add an OpenRouter key or turn it on; only the administrator setting described below keeps it off even then.
- **Everything else goes online because you chose it:** a cloud model, a web search, a model download, remote control, a link you open.

Any request over the internet shows your IP address to the service that receives it. That service's own privacy policy applies.

## What TALOS sends on its own

| What | Sent to | When | What is sent | How to turn it off |
|---|---|---|---|---|
| Update check | `api.github.com` (the TALOS releases on GitHub) | *From the code, not yet measured on the installed app.* Installed app only: 30 seconds after start, then every 4 hours | A request for the list of TALOS releases, with `User-Agent: TALOS-Desktop` and your system language. Nothing about you or your files. | **Settings → Updates → Automatic updates.** When it is off, TALOS does not check, download or install on its own; **Check now** still works when you press it. An administrator can keep it off for the whole computer with the environment variable `TALOS_DESKTOP_AGGIORNAMENTI=off`: the switch then stays off. |
| Update download | `github.com` | *From the code, not yet measured on the installed app.* Only when a newer TALOS release exists and the check above is on | The signed update manifest, read through the app window's browser engine (with its own browser user agent); then the update description and the installer, downloaded by electron-updater with `User-Agent: electron-builder`. Nothing about you or your files. The installer is verified against the signed manifest before it is installed. | Same switch as above. |
| Public model list | `openrouter.ai` | **Off by default.** Once you pick an OpenRouter model, add an OpenRouter key or turn it on (never with the administrator setting in the last column): when the window opens, then at most once every 10 minutes when a screen needs the list; also during a chat, to learn whether the model can read images. If a read fails, TALOS tries once more after 30 seconds, then at most once every 10 minutes. | An anonymous request for OpenRouter's public model catalogue (`GET /api/v1/models`, user agent `node`). No key, no chat content, no identifier. | **Settings → Security and privacy → Public model list**: while it is off, the model picker uses the list built into TALOS and says so. With this switch off, picking an OpenRouter model or adding an OpenRouter key is your choice to use OpenRouter, so TALOS reads the list again: one request when the window opens, then as described in this row. An administrator can keep it off for the whole computer with the environment variable `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off`: the switch then stays off, and TALOS sends no request for the list at all, even with an OpenRouter key and an OpenRouter model chosen. |

## What TALOS sends because you chose it

- **Cloud models.** When you use a cloud model, the conversation, the files you attach and the results of the tools the model runs go
  to the provider you chose (for example OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Mistral), with your key or your ChatGPT sign-in.
  Automations you create do the same when they run. Local models send nothing. During a chat with an OpenRouter model, TALOS also
  asks openrouter.ai which providers serve that model and how long a conversation they accept
  (`GET /api/v1/models/<author>/<model>/endpoints`, no key, no chat content), at most once every 10 minutes per model (once a minute while openrouter.ai cannot be
  reached); this goes to the provider you already chose and does not depend on the public model list switch.
- **Model lists for direct providers.** After you add the key of a direct provider, the model picker reads the public catalogue at
  `models.dev`. Your key is not sent. The copy is kept for 4 hours.
- **Web search.** When you or the model search the web, the search text goes to the search service set in Settings → Agent tools and permissions: DuckDuckGo
  by default (no key; the request names TALOS in its user agent), or Brave, Tavily, SearXNG or an address you choose. The icons of the
  result sites are fetched by TALOS from each site, once, and kept for 30 days.
- **Web pages** that you or the model open are fetched from those sites.
- **Local models.** Searching and downloading a model in the Model Lab uses Hugging Face.
- **GitHub features** use the `gh` program with your own GitHub account.
- **Remote control** is off by default. When you turn it on, your phone reaches the PC through a relay: the free relays of number0, the
  makers of iroh (`*.relay.n0.iroh.link`, with address discovery at `dns.iroh.link`), or a relay you run yourself. The PC's public key
  and network addresses are published for discovery; the traffic between phone and PC is end-to-end encrypted. Phone notifications go
  through the push service of the phone's browser. Turn it off in Settings → Connected devices.
- **Report a problem** and links in the chat open your own browser. TALOS itself sends nothing; you decide whether to submit.

## What stays on your computer

- Settings, sessions, chats, notes, memory, remote-control settings and downloaded models: `%APPDATA%\TALOS`.
- Browser data and temporary files of the app window: `%LOCALAPPDATA%\TALOS`.
- Provider keys, sign-in tokens and the remote-control identity: Windows Credential Manager, never in a file.
- The local service listens on `127.0.0.1` only. Local models run on your PC (llama.cpp included); Ollama and LM Studio are reached on
  `127.0.0.1`. The computer-use helper has no network access.
- When you uninstall, you can choose to delete the data and the keys.

## Contact

Questions about privacy: open an issue at <https://github.com/Ninozzz95/talos/issues>. Security problems: use the repository's private
security reporting (Security → Report a vulnerability on GitHub).

---

# Privacy (italiano)

Questa pagina descrive solo TALOS Desktop per Windows. Non copre ancora l'app a riga di comando (CLI) né l'app Android per il telefono.
È stata controllata sul codice della candidata desktop 0.2.2 l'11 novembre 2026, e quel giorno l'elenco pubblico dei modelli è stato
misurato anche sulla rete; il controllo e lo scaricamento degli aggiornamenti sono descritti dal codice e non ancora misurati sull'app
installata.

## In breve

- **Nessun account TALOS, nessuna telemetria.** TALOS non ha statistiche d'uso, né segnalazioni automatiche di errori, né un server suo
  che riceva i tuoi dati.
- **Il tuo lavoro resta sul tuo computer:** chat, sessioni, progetti, note, impostazioni e modelli scaricati.
- **TALOS va in rete da solo in due casi soltanto:** il controllo degli aggiornamenti e l'elenco pubblico dei modelli di OpenRouter.
  Sotto c'è cosa mandano e come si spengono. L'elenco pubblico dei modelli è **spento di serie**: parte solo dopo che scegli un
  modello di OpenRouter, aggiungi una sua chiave o lo accendi; solo l'impostazione dell'amministratore descritta sotto lo tiene
  spento anche allora.
- **Tutto il resto va in rete perché l'hai scelto tu:** un modello in cloud, una ricerca sul web, lo scaricamento di un modello, il
  controllo remoto, un link che apri.

Ogni richiesta su internet mostra il tuo indirizzo IP al servizio che la riceve. Vale l'informativa sulla privacy di quel servizio.

## Cosa manda TALOS da solo

| Che cosa | A chi | Quando | Cosa parte | Come si spegne |
|---|---|---|---|---|
| Controllo degli aggiornamenti | `api.github.com` (le versioni di TALOS su GitHub) | *Dal codice, non ancora misurato sull'app installata.* Solo nell'app installata: 30 secondi dopo l'avvio, poi ogni 4 ore | La richiesta dell'elenco delle versioni di TALOS, con `User-Agent: TALOS-Desktop` e la lingua del sistema. Niente su di te o sui tuoi file. | **Impostazioni → Aggiornamenti → Aggiornamenti automatici.** Spento, TALOS non controlla, non scarica e non installa da solo; **Controlla ora** funziona quando lo premi. Un amministratore può tenerlo spento per tutto il computer con la variabile d'ambiente `TALOS_DESKTOP_AGGIORNAMENTI=off`: l'interruttore allora resta spento. |
| Scaricamento dell'aggiornamento | `github.com` | *Dal codice, non ancora misurato sull'app installata.* Solo se esiste una versione più nuova e il controllo qui sopra è acceso | Il manifesto firmato, letto dal motore di navigazione della finestra dell'app (col suo user agent di browser); poi la descrizione dell'aggiornamento e l'installatore, scaricati da electron-updater con `User-Agent: electron-builder`. Niente su di te o sui tuoi file. L'installatore si controlla col manifesto firmato prima di installarlo. | Lo stesso interruttore. |
| Elenco pubblico dei modelli | `openrouter.ai` | **Spento di serie.** Dopo che scegli un modello di OpenRouter, aggiungi una sua chiave o lo accendi (mai con l'impostazione dell'amministratore nell'ultima colonna): all'apertura della finestra, poi al più una volta ogni 10 minuti quando una schermata ne ha bisogno; anche durante una chat, per sapere se il modello legge le immagini. Se la lettura non riesce, TALOS riprova una volta dopo 30 secondi, poi al più una volta ogni 10 minuti. | Una richiesta anonima del catalogo pubblico di OpenRouter (`GET /api/v1/models`, user agent `node`). Nessuna chiave, nessun contenuto della chat, nessun identificativo. | **Impostazioni → Sicurezza e privacy → Catalogo pubblico dei modelli**: finché è spento, il selettore dei modelli usa l'elenco incorporato in TALOS e lo dice. Con questo interruttore spento, scegliere un modello di OpenRouter o aggiungere una sua chiave è una tua scelta di usare OpenRouter, e TALOS torna a leggere l'elenco: una richiesta all'apertura della finestra, poi come detto in questa riga. Un amministratore può tenerlo spento per tutto il computer con la variabile d'ambiente `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off`: l'interruttore allora resta spento, e TALOS non manda nessuna richiesta per l'elenco, anche con una chiave di OpenRouter e un modello di OpenRouter scelto. |

## Cosa manda TALOS perché l'hai scelto tu

- **Modelli in cloud.** Quando usi un modello in cloud, la conversazione, i file che alleghi e i risultati degli attrezzi che il modello
  usa vanno al fornitore che hai scelto (per esempio OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Mistral), con la tua chiave o il
  tuo accesso a ChatGPT. Le automazioni che crei fanno lo stesso quando girano. I modelli locali non mandano niente. Durante una chat
  con un modello di OpenRouter, TALOS chiede anche a openrouter.ai quali fornitori servono quel modello e quanto può essere lunga la
  conversazione (`GET /api/v1/models/<autore>/<modello>/endpoints`, senza chiave né contenuto della chat), al più una volta ogni 10
  minuti per modello (una volta al minuto finché openrouter.ai non risponde); va al fornitore che hai già scelto e non dipende dall'interruttore dell'elenco pubblico.
- **Elenchi dei modelli dei fornitori diretti.** Dopo che hai messo la chiave di un fornitore diretto, il selettore dei modelli legge il
  catalogo pubblico di `models.dev`. La tua chiave non parte. La copia si tiene 4 ore.
- **Ricerca sul web.** Quando tu o il modello cercate sul web, il testo cercato va al servizio scelto in Impostazioni → Strumenti agente e permessi:
  DuckDuckGo di serie (senza chiave; la richiesta nomina TALOS nel suo user agent), oppure Brave, Tavily, SearXNG o un indirizzo tuo. Le
  icone dei siti dei risultati le prende TALOS da ciascun sito, una volta, e le tiene 30 giorni.
- **Le pagine web** che tu o il modello aprite si scaricano da quei siti.
- **Modelli locali.** Cercare e scaricare un modello nel Laboratorio modelli usa Hugging Face.
- **Le funzioni GitHub** usano il programma `gh` col tuo account GitHub.
- **Il controllo remoto** è spento di serie. Quando lo accendi, il telefono raggiunge il PC passando da un relay: quelli gratuiti di
  number0, chi fa iroh (`*.relay.n0.iroh.link`, con la ricerca degli indirizzi su `dns.iroh.link`), oppure un relay tuo. La chiave
  pubblica del PC e i suoi indirizzi di rete si pubblicano per farlo trovare; il traffico fra telefono e PC è cifrato da un capo
  all'altro. Le notifiche al telefono passano dal servizio push del suo browser. Si spegne in Impostazioni → Dispositivi collegati.
- **Segnala un problema** e i link della chat aprono il tuo browser. TALOS non manda niente da solo; decidi tu se inviare.

## Cosa resta sul tuo computer

- Impostazioni, sessioni, chat, note, memoria, impostazioni del controllo remoto e modelli scaricati: `%APPDATA%\TALOS`.
- Dati del browser e file temporanei della finestra dell'app: `%LOCALAPPDATA%\TALOS`.
- Chiavi dei fornitori, accessi e identità del controllo remoto: Gestione credenziali di Windows, mai in un file.
- Il servizio locale ascolta solo su `127.0.0.1`. I modelli locali girano sul tuo PC (llama.cpp è incluso); Ollama e LM Studio si
  raggiungono su `127.0.0.1`. L'aiutante del computer use non ha accesso alla rete.
- Quando disinstalli, puoi scegliere di cancellare i dati e le chiavi.

## Contatti

Domande sulla privacy: apri una segnalazione su <https://github.com/Ninozzz95/talos/issues>. Problemi di sicurezza: usa la segnalazione
privata del repository (Security → Report a vulnerability su GitHub).
