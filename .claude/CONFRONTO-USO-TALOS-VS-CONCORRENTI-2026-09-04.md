# Confronto d'uso: TALOS faccia a faccia con Hermes Agent desktop (04/09/2026)

> Owner: «fatti un giro su una istanza isolata su TALOS e ispeziona ogni singola funzione, e faccia
> a faccia apri Hermes e Codex e comparali assieme, annotando su un taccuino e screenshottando ogni
> pagina». E poi: «vedo che Hermes ha una sidebar molto più organizzata e bella della nostra, questo
> non l'hai scovato: UI, funzionalità, UX, backend e frontend».
>
> ⛔ Questo documento è un confronto **d'uso**, non di codice: il dossier per codice esiste già
> (`DOSSIER-COMPETITOR-FUNZIONI-DISTINTIVE-2026-09-03.md`). Qui si apre l'app, si preme, si
> fotografa, e si dice dove perdiamo.

## §0 — Ambiente, e cosa è vero

| | |
|---|---|
| TALOS | istanza **isolata** sulla porta **4195**, copia dello store (73 sessioni). ⛔ Il 4174 dell'owner non è mai stato toccato |
| Hermes Agent desktop | **esiste**, ed è Electron 40 + React + Vite (`apps/desktop`, versione 0.17.0 nel checkout). Non era mai stato costruito su questa macchina: l'ho copiato in una cartella isolata, installato (1.186 pacchetti) e compilato. Gira con le **sessioni vere dell'owner** |
| Codex | CLI 0.152.0, TUI nel terminale: **nessuna app desktop per Windows** |
| Agent Canvas (OpenHands) | installato come pacchetto npm 1.12.0 |

Strumento del giro: `censimento.mjs` (scratch), che registra **due canali** per ogni schermata —
i pixel (screenshot) e la struttura (DOM: titoli, elementi premibili, testo principale). È la forma
che i lavori 2026 sui GUI agent raccomandano: un canale solo mente, la struttura è rumorosa e i
pixel non sanno cosa è cliccabile. Le schermate stanno in `.qa-runs/confronto-2026-09-04/`.

## §1 — La sidebar: hanno ragione, la loro è più organizzata

**Hermes** (`hermes/01-stato-iniziale.png`) mette in cima **quattro destinazioni** sempre visibili,
con icona ed etichetta: *New session* (con la scorciatoia `Ctrl N` disegnata come tasti),
*Capabilities*, *Messaging*, *Artifacts*. Sotto, una ricerca senza bordo, poi due sezioni con
etichetta strutturale in maiuscoletto — *PINNED* e *SESSIONS* — e le sessioni come righe di solo
titolo, con le azioni che compaiono al passaggio del mouse.

**TALOS** (`talos/05-chat-vuota.png`) mette in cima ricerca e il pulsante «Nuova», poi un suggerimento
sempre acceso («Tieni premuta una chat per le azioni»), poi una barra di selezione sempre presente
(«Seleziona sessioni · Nessuna selezionata»), poi «SESSIONI REALI» e righe con **quattro dati
ciascuna**: titolo, stato con pallino colorato, modello, ora e numero di giri.

Cosa perdiamo, in concreto:

1. **Non abbiamo un blocco di navigazione.** Le nostre destinazioni (terminale, board, capability,
   impostazioni) stanno in icone nella barra in alto e nella colonna di destra. La loro sidebar
   dice *dove puoi andare*; la nostra dice *cosa hai fatto*. È esattamente la cosa che l'owner ha
   notato a colpo d'occhio — e combacia con la sua decisione di oggi: un pulsante **«Capability»**
   con la parola scritta. In Hermes quella voce sta nella sidebar, non nel composer.
2. **Densità sbilanciata.** Le nostre righe portano quattro informazioni con contrasto simile: a
   colpo d'occhio non si legge il titolo, si legge un blocco. La loro riga ha un'informazione sola e
   le altre appaiono quando servono. ⛔ La cura non è togliere i dati — sono nostri e sono veri: è
   **degradarli** (titolo primario, metadati a contrasto più basso o al passaggio del mouse).
3. **Due elementi occupano spazio senza fare niente**: il suggerimento sulle azioni (è una
   spiegazione travestita da contenuto) e la barra di selezione quando non c'è niente di selezionato.
4. **«SESSIONI REALI»** è vocabolario di sistema che esce a schermo: la parola «reali» esiste perché
   una volta c'erano quelle finte. Una persona non ha sessioni irreali.
5. **Manca il fissaggio.** Loro hanno *PINNED* con un'istruzione al posto del vuoto («Shift-click a
   chat to pin»). Con 73 sessioni nello store, per noi è una mancanza funzionale, non estetica.
6. **Non insegniamo le scorciatoie.** Loro disegnano `Ctrl N` accanto alla voce; noi abbiamo una
   palette comandi e nessun punto in cui la si impara.

Cosa NON copiare: il loro tema chiaro e il logo a tutta pagina come stato vuoto. Il nostro hero
scuro con il glifo è più nostro, e il vuoto per noi è il posto dove dire cosa può fare l'app.

## §2 — Impostazioni: la loro architettura ha diciassette porte, la nostra tre

`hermes/01-impostazioni.png` e `hermes/04-scorciatoie-tastiera.png`.

Sezioni loro, in due gruppi separati da un filo: *Model · Chat · Appearance · Workspace · Safety ·
Memory & Context · Voice · Advanced · Notifications · Billing* poi *Providers · Gateway · Keyboard
Shortcuts · Tools & Keys · Plugins · Archived Chats · About*. In basso a sinistra tre icone:
esporta, importa, ripristina le impostazioni.

Tre cose che ci mancano e che si vedono da lì:

- **Modelli ausiliari, uno per MESTIERE.** Non «un modello planner» come noi: sette lavori nominati —
  *Vision* (analisi immagini), *Web extract* (riassunto pagina), *Compression* (compattazione del
  contesto), *Skills hub* (ricerca skill), *Approval* (auto-approvazione intelligente), *MCP*
  (instradamento attrezzi), *Title gen* (titoli sessione). Ogni riga dice il valore corrente in
  monospazio (`auto · use main model`) e offre *Set to main | Change*, con *Reset all to main* in
  testa. ⇒ È anche un **modello di riga** da rubare per il nostro Capability hub: nome, pastiglia
  del ruolo, valore in monospazio, due azioni a destra.
- **Scorciatoie ricomponibili**: pannello con ricerca, raggruppate per area, ogni scorciatoia si
  riassegna cliccandola, «Reset all», e `Ctrl+/` riapre il pannello. Noi non abbiamo un pannello
  scorciatoie (è la riga W1-09, ancora da fare).
- **Profili** (`Ctrl 1…5`) e **chat archiviate**: due concetti che non abbiamo proprio.

## §3 — Funzioni che scopri solo leggendo le loro scorciatoie

Il pannello scorciatoie è il censimento più onesto delle funzioni di un'app. Dal loro:

| Scorciatoia | Cosa fa | Noi |
|---|---|---|
| `⏎` durante un giro | **Steer the running turn** — indirizzi l'agente mentre lavora | è la nostra riga O-04, non fatta |
| `Ctrl ⏎` | **Queue message** — accodi il prossimo messaggio | la coda esiste (`codaMessaggi`) ma non ha un gesto |
| `Ctrl Shift K` | manda subito il prossimo messaggio in coda | assente |
| `@` | riferimenti a file, cartelle, URL | l'abbiamo appena collegata nel foglio del «+» (O-01) |
| `/` | palette dei comandi slash | abbiamo la palette, non i comandi slash |
| `Esc` | chiude il popover **e annulla il giro** | il nostro Esc non annulla |
| `Ctrl Shift M` | apre il selettore modello | noi: solo col mouse sulla pillola |

## §4 — Dove siamo davanti (verificato oggi, non dichiarato)

- **Inventario degli attrezzi con il costo**: il nostro Capability hub elenca i **43 attrezzi veri**
  letti dal kernel e dichiara **~7.454 token di schema a ogni giro**, per attrezzo. Ricontato oggi
  direttamente dal kernel. Nessuno dei concorrenti esaminati mostra il costo dell'intero set.
- **Diagnosi dei giri esauriti**: diciamo *quali* attrezzi hanno consumato i giri e *quante* chiamate
  erano identiche. Hermes ha entrambe le cose come **issue aperte** (#414 avviso prima del tetto,
  #18076 deduplica); Claude Code allo stesso limite dice solo «reached its tool-use limit».
- **Confine del workspace separato dal permesso** (chiuso oggi, W0-08): limitare i percorsi per
  profilo è una richiesta **ancora aperta** in Hermes (#92424) e OpenCode (#5529).

## §4-bis — ⛔⛔⛔ PUNTO CRITICO (owner, 04/09): al desktop mancano le sezioni che il mobile ha già

> «nel desktop mancano tutte le sezioni della sidebar come sul mobile — memoria, libreria, ricerca,
> attività eccetera. Le funzionalità dovrebbero già esserci ma dobbiamo essere sicuri: mettilo nel
> taccuino, da inserire immancabilmente, dato che la sidebar verrà rifatta stile Hermes.»

**Verificato, non dedotto.** Il mobile ha **dieci destinazioni di primo livello** (rotte in
`mobile/src/router/index.ts`): `/chats`, `/context`, `/doctor`, `/harness`, `/memory`, `/notes`,
`/research`, `/settings`, `/tasks`, `/toolforge`. Il desktop ha **le stesse cose lato server** —
ognuna con la sua rotta in `src/http-app.mjs` (`/sessions/:id/` + `library`, `notes`, `tasks`,
`memory`, `research`, `tool-forge`, `skills`, `mcp`, `plugins`, più `/diagnosi` per il Doctor) — ma
**nessuna è una destinazione**: vivono tutte dentro UN foglio, il Capability hub, raggiungibile da
un pulsante senza nome.

⇒ Non è un lavoro di backend: **è già tutto lì**. È un lavoro di navigazione, e va fatto insieme
alla sidebar nuova. Le voci che devono comparire, con il nome che una persona riconosce:

| Sezione | Cosa c'è già lato desktop | Oggi si raggiunge da |
|---|---|---|
| Chat / Sessioni | elenco sessioni | sidebar (unica cosa che è già lì) |
| Libreria | `GET /sessions/:id/library` | foglio capability, in fondo |
| Memoria | `GET /sessions/:id/memory` | foglio capability |
| Note | `GET /sessions/:id/notes` | foglio capability |
| Attività | `GET /sessions/:id/tasks` | foglio capability |
| Ricerca approfondita | `GET /sessions/:id/research` | foglio capability |
| Officina attrezzi | `GET /sessions/:id/tool-forge` | foglio capability |
| Skill | `GET /sessions/:id/skills` | foglio capability |
| Connettori (MCP) e Plugin | `GET /sessions/:id/mcp`, `/plugins` | foglio capability |
| Doctor | `GET /api/v1/diagnosi` | foglio «Control plane» |
| Contesto | context rail | colonna di destra |

⛔ Da fare insieme alla riga O-08 (i due pulsanti) e alla sidebar nuova: **una sezione per ognuna,
con il nome scritto**, come fa Hermes con *Capabilities · Messaging · Artifacts*. Sono già
funzionanti: nasconderle dietro un pulsante senza nome è l'unico motivo per cui sembrano assenti.

## §4-ter — Sicurezza faccia a faccia: la loro «Safety», la nostra «Safety lens»

`hermes/09-impostazioni-safety.png` contro `talos-v2/20-foglio-permessi.png`.

**Loro** hanno nove controlli in una lista piatta: *Approval Mode* (a tendina, oggi «Smart» — cioè
l'auto-approvazione decisa da un modello ausiliario), *Approval Timeout* (300 secondi: quanto una
richiesta di approvazione aspetta prima di scadere), *Confirm MCP Reloads*, *Command Allowlist*
(valori separati da virgola), *Redact Secrets* («nascondi i segreti trovati dal contenuto visibile
al modello»), *Allow Private URLs*, *Browser Private URLs*, *Local Browser For Private URLs*, e
*File Checkpoints* («crea istantanee di ripristino prima delle modifiche ai file», spento).

**Noi** abbiamo due blocchi: la *policy di sessione* come quattro carte con l'etichetta del rischio
a destra — Read only «Minimo rischio», Workspace write «Consigliato», On request «Controllato»,
Full access «Alto rischio» — e sotto il *permesso per attrezzo*, che **precede** la policy, con
cinque righe e una tendina ciascuna.

- ✅ **Dove siamo meglio**: l'etichetta di rischio accanto a ogni livello (loro non dicono quale sia
  il livello consigliato), e il permesso per attrezzo che vince sulla policy, spiegato sulla riga.
- ⛔ **Quello che hanno e noi no**: il **timeout dell'approvazione** (e oggi ho scoperto e curato
  proprio il caso in cui la nostra richiesta non si risolveva mai — loro lo trattano da anni come
  un'impostazione), la **redazione dei segreti** prima che il modello li veda, l'**allowlist dei
  comandi** come campo, i tre interruttori sugli **URL privati**, e i **checkpoint dei file** prima
  di ogni modifica (per noi è la proposta P-11, per loro è una spunta).
- ⛔ **Difetto visivo nostro, visto nello screenshot**: nelle righe del permesso per attrezzo il nome
  e la spiegazione sono **incollati** («scrittura di un fileScrive un file — passa dal cancello
  semantico»): `<strong>` e `<small>` sono due elementi in linea senza separazione. Va messo su due
  righe, come fa Hermes con nome sopra e descrizione sotto in grigio.

## §4-quater — Il nostro Capability hub dichiara esattamente ciò che loro hanno

`talos-v2/06-capability-fondo-2.png`. In fondo al foglio, la sezione **«NON ANCORA IMPLEMENTATO»**
elenca con onestà: *Toolsets*, *Computer use*, *Immagini in ingresso* («nessun canale immagine verso
il modello: il kernel non manda nessun `image_url`»), *Gateways · Telegram, Discord, Slack,
WhatsApp*, *Profiles*.

⇒ Tre di quelle cinque voci sono **esattamente** ciò che Hermes ha già: *Messaging* è la loro voce di
sidebar per i gateway, *Profiles* è il loro `Ctrl 1…5`, e la visione la instradano con un modello
ausiliario dedicato. Il nostro elenco delle cose mancanti non è una lista di desideri: è la lista
della spesa scritta guardando il concorrente.

## §5 — Taccuino: difetti nostri visti mentre confrontavo

1. La sidebar mostra due elementi che non fanno niente finché non servono (suggerimento azioni,
   barra di selezione vuota).
2. «SESSIONI REALI»: vocabolario interno a schermo.
3. Le righe sessione hanno quattro dati allo stesso contrasto: nessuna gerarchia di lettura.
4. Nessun blocco di navigazione: le destinazioni sono icone senza nome.
5. Nessun modo di fissare una sessione, con 73 sessioni nello store.

## §5-bis — Quante schermate, e quante VERE

⛔ Owner: «ogni passata che fai alla cieca è un errore che poi paghiamo dopo». Le schermate non si
contano: si contano quelle **diverse**. Verificato confrontando l'impronta dei pixel, non i nomi dei
passi.

| | scatti | schermate DIVERSE | gesti senza effetto |
|---|---:|---:|---:|
| TALOS | 79 | **50** | 29 |
| Hermes desktop | 50 | **45** | 5 |

⛔ Il primo controllo che avevo scritto guardava il TESTO e diceva 32 doppioni su 57: sbagliato,
perché scorrere un pannello non cambia il testo della pagina. Un controllo che misura la cosa sbagliata è
peggio di nessun controllo — dice «alla cieca» proprio quando non lo sei. Rifatto sui pixel.

Cose imparate dai gesti a vuoto: **Escape chiude i fogli** (verificato: la schermata torna identica
a quella di partenza), il fondale non li chiude, e il Capability hub finisce di scorrere prima di
quanto pensassi — cioè tutto quel contenuto sta in due schermate scarse di scorrimento.

## §6 — Stato del giro (aggiornato)

- ✅ **TALOS: 50 schermate diverse** — intro a quattro passi, chat, Capability hub dall'alto in
  fondo, selettore modello, Safety lens, Environment proof, Control plane, albero sessione, palette
  comandi, terminale, board, otto schede delle impostazioni, notifiche, coda download, ricerca,
  selezione multipla, tre schede del context rail, modale Nuova sessione, sidebar compressa.
- ✅ **Hermes desktop: 45 schermate diverse** — home, tutte e diciassette le sezioni delle
  impostazioni (con gli scorrimenti), scorciatoie, Capabilities, Messaging, Artifacts, una
  conversazione vera dell'owner, nuova sessione, composer.
- 🔜 Codex TUI (terminale, va catturato come testo e non a pixel), Agent Canvas, e le quattro prove
  con i numeri — con la spesa dichiarata prima.

### Storico del primo giro (superato)

- ✅ TALOS: 11 schermate (intro a quattro passi, chat, foglio capability, terminale, palette, nuova
  sessione). ⛔ Board e impostazioni: selettori sbagliati al primo giro, da rifare.
- ✅ Hermes desktop: 8 schermate (stato iniziale, capabilities, messaging, artifacts, impostazioni,
  scorciatoie, nuova sessione).
- 🔜 Codex TUI, Agent Canvas, e le quattro prove con i numeri (compito vero, trappola, rottura,
  permesso negato) — con la spesa dichiarata prima.
