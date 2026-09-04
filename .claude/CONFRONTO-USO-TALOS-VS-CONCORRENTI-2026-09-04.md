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

## §5 — Taccuino: difetti nostri visti mentre confrontavo

1. La sidebar mostra due elementi che non fanno niente finché non servono (suggerimento azioni,
   barra di selezione vuota).
2. «SESSIONI REALI»: vocabolario interno a schermo.
3. Le righe sessione hanno quattro dati allo stesso contrasto: nessuna gerarchia di lettura.
4. Nessun blocco di navigazione: le destinazioni sono icone senza nome.
5. Nessun modo di fissare una sessione, con 73 sessioni nello store.

## §6 — Stato del giro

- ✅ TALOS: 11 schermate (intro a quattro passi, chat, foglio capability, terminale, palette, nuova
  sessione). ⛔ Board e impostazioni: selettori sbagliati al primo giro, da rifare.
- ✅ Hermes desktop: 8 schermate (stato iniziale, capabilities, messaging, artifacts, impostazioni,
  scorciatoie, nuova sessione).
- 🔜 Codex TUI, Agent Canvas, e le quattro prove con i numeri (compito vero, trappola, rottura,
  permesso negato) — con la spesa dichiarata prima.
