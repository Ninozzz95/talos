# TALOS mobile — inventario completo, vincoli bloccati, scaletta

Data: 2026-07-30 · Stato: **inventario per la priorizzazione dell'owner**

Questo documento esiste perché l'owner ha chiesto di fermarsi e vedere TUTTO
insieme prima di continuare: «dammi tutti i piani futuri di cui ti ho parlato e
riordiniamo la scaletta in base alle mie priorità, e blocchiamo il disegno e i
vincoli principali così abbiamo le idee chiare e non ci andiamo di nuovo».

Le fonti sono i piani già nel repo (`2026-07-24-talos-mobile-remaining-program-roadmap.md`,
`2026-07-26-talos-tool-catalogue-and-roadmap.md`, `DEBT-REGISTER.md`) più le
richieste dell'owner registrate in memoria. Nessuna voce è inventata qui.

---

## PARTE 1 — I vincoli, bloccati

Questi non si rinegoziano a ogni blocco. Valgono su tutto.

### I cinque della REGOLA ZERO
1. **Ricerca web PRIMA** di ogni implementazione e di ogni fix — best practice,
   competitor, librerie affermate. Checkpoint loggato nel ledger (query + fonti +
   impatto). Leggere il sorgente di una libreria NON sostituisce la ricerca.
2. **Skill ufficiali sempre**: systematic-debugging per il debug, TDD +
   brainstorming per le implementazioni, skill frontend per ogni lavoro UI.
3. **Vincoli ingegneristici TALOS**: ricerca + one-up + parità + massimo
   potenziale + ambizione. L'anti-pattern da bloccare è proporre opzioni PRIMA
   della ricerca.
4. **Review SF avversariale a chiusura**, poi i gate.
5. **Riprodurre prima di dire "risolto"**. Lavoro coeso, mai frammentato.

### Il vincolo nuovo (owner 2026-07-30, iper-bloccante)
6. **Analizzare TUTTA la pipeline del componente** a ogni fix e a ogni feature.
   Ogni ramo di rendering, ogni superficie che mostra lo stesso dato, ogni
   chiamante. Nato da due difetti in r11 che erano lo stesso errore: raggruppamento
   e griglia sistemati nel ramo `links` e non nel ramo `all`; favicon messe nel
   chip e nella Libreria e non nel drawer che il chip apre. Se una superficie
   viene lasciata fuori di proposito, va **detto all'owner**, non sepolto in un
   commento.

### Gli altri vincoli permanenti
- **D0 — TALOS sarà distribuito ad altre persone.** Nessuna chiave API
  nell'APK. Play limita Accessibility e VPN.
- **Niente elenchi statici**: modelli, provider, sorgenti e capability non si
  cablano nell'APK — remoto, firmato, in cache, con ripiego onesto.
- **Due porte per ogni funzione**: stazione + tool chiamabile dal modello in chat.
  L'esito atterra in entrambe. Una porta sola = progettata a metà.
- **Mobile identico al desktop**: parità piena, mai chiedere scope o profondità.
- **Local-first**: il mobile gira in locale e standalone; il sync col desktop
  viene dopo ed è opzionale.
- **Censura obliterata**: mai reintrodurre i blocchi neri sui contenuti sensibili.
- **APK solo per blocchi grossi**: niente rebuild per fix piccoli, si accorpano.
- **Commit**: solo l'owner autorizza; in questa lane l'autorizzazione è permanente.

---

## PARTE 2 — L'inventario completo

### A. Difetti aperti in r11 (owner 2026-07-30)
| # | Difetto | Origine |
|---|---|---|
| A1 | Filtro **"Tutti"**: i link non sono raggruppati per chat e non vanno in griglia (nel filtro "Link" funzionano) | mio, `781be8f` |
| A2 | **Favicon assenti nel drawer** che si apre dal chip fonti (ci sono nel chip e in Libreria) | mio, `781be8f` |

### B. Blocco in corso — libretto d'origine dei file
Disegno approvato fino alla parte 1 di 2. Decisioni già prese dall'owner:
dentro TALOS **e** dentro il file all'export; nel file escono solo *è AI + modello
+ data*, il prompt resta dentro; blocco **intero** (include la lettura dei sigilli
dei file in arrivo e l'impronta percettiva); impianto **A — libretto tipizzato**.

### C. Tool chiamabili dal modello (catalogo F0–F8)
| Fase | Contenuto | Stato |
|---|---|---|
| F0 | fondamenta + 6 tool di osservazione | ✅ spedito |
| **F1** | **ricerca web con fonti** | 🔜 prossima — serve chiave BYOK |
| F2 | generazione documenti | 🔜 |
| F3 | scrittura locale + 7 livelli di rischio | 🔜 |
| F4 | registro visibile + undo (chiude il debito T8) | 🔜 |
| F5 | analisi documenti e dati | 🔜 |
| F6 | MCP / verso l'esterno | ⏸ decisione owner |
| F7–F8 | dispositivo in lettura/scrittura (Shizuku) | 🟢 **GO DATO 2026-07-30** |

**Vincolo owner 2026-07-30 su tutta la famiglia C:** «va analizzato super
attentamente, bisogna analizzare tutta la documentazione android termux shizuku
tutte le operazioni max potencial no compromise, dobbiamo anche autorizzare
terminale bash da shizuku».

Conseguenze registrate:
- La ricerca preliminare deve coprire **Android + Termux + Shizuku**, non solo
  Shizuku. Termux non era mai stato nominato in nessun documento precedente.
- Il catalogo deve elencare **tutte** le operazioni possibili, non un
  sottoinsieme prudente.
- **Terminale bash via Shizuku è autorizzato.** Questo cambia il documento di
  visione Shizuku da "archiviato, non aprire senza GO" a materiale di lavoro
  della fase F7–F8, e va conciliato con la regola D0 (Play limita Accessibility
  e VPN) e con i 7 livelli di rischio già progettati in F3.
- Un terminale è la capability con il livello di rischio più alto dell'intero
  catalogo: la progettazione deve dire come si concilia con «tool tipizzati, mai
  `runShell`», che era una decisione presa. Se la si ribalta, va ribaltata
  esplicitamente e non per omissione.

### D. Modelli locali (M1–M8b)
Centro modelli: repository HuggingFace per scaricare modelli in locale, ispezione
hardware **viva** (termica con callback) per i consigliati, motore nativo
llama.cpp + WebGPU arbitrati dal benchmark, catalogo remoto firmato.
M8b (condivisione anonima dei benchmark) è una giuntura prevista e non costruita.
⚠️ Parzialmente bloccato: toolchain Rust/NDK assente sull'host.

### E. Deep Research (R1–R12)
One-up dichiarato: verifica delle citazioni a tre livelli con il passaggio
conservato (il settore allucina tra l'11% e il 57%) + ri-verifica dei dossier
vecchi. **R-1, lo stato serializzabile, va fatta per prima.**
⚠️ Il contenuto pieno dipende dalla ricerca web (F1).

### F. Richieste FE / UX dell'owner in coda
| # | Richiesta | Note |
|---|---|---|
| F-1 | Icona **Brain** nella pill modello in portrait, testo su tablet | non urgente |
| F-2 | **Font XS** in chat | |
| F-3 | **Drawer reasoning** stile Claude (riga muta che apre un drawer) | |
| F-4 | **Galleria media per-chat** come pannello di contesto | |
| F-5 | **Fluidità dell'animazione** di streaming (metro: Claude) | non urgente |
| F-6 | **Composer + drawer stile Claude** (Fotocamera/Foto/File→Libreria, Ricerca web/Research, Progetto, Strumenti, Connettori) | integrare Model Lab/enhancer senza regressioni |
| F-7 | **Composer immersivo ChatGPT-style** — 2 toggle in Appearance | 3 screenshot owner |
| F-8 | **Refactor rendering messaggi** — assistant full-width a sezioni, user bolla+collapse, toggle in Aspetto | mockup da approvare |
| F-9 | **Icona launcher per tema preset** — activity-alias × 14 + dialog riavvio | approccio approvato |
| F-10 | **Font per tema preset** + font sistema separato dal font chat | non urgente |
| F-11 | **Libreria: accesso globale del modello** — ogni chat accede alla libreria GLOBALE, provenienza nota, generati salvati auto o su richiesta, galleria grid/list | RAG on-device già fatto |
| F-12 | **Blocchi di ragionamento espandibili** (N4.5) — catturare il reasoning dall'output dei 4 provider | oggi solo lato input |
| F-13 | **Dropdown modelli-per-provider** nel Model Lab e quick-select composer (FV2-06.0) | contratto congelato |
| F-14 | **Chat temporanea** non persistita + libreria di prompt di benvenuto (N2) | |

*(La voce «#27 TALOS self-knowledge» che stava qui è stata spostata: è la stessa
cosa che l'owner ha chiesto come **E2**, e tenerla in due posti l'avrebbe fatta
costruire due volte.)*

### E2. Self-memory — TALOS conosce sé stesso (owner 2026-07-30)
Ingest di **tutta** la documentazione di architettura e di **tutte** le funzioni
di TALOS dentro la funzione memoria che già esiste, così che dalla chat si possa
chiedere qualunque cosa sul prodotto e sull'architettura. Requisito dell'owner:
«deve essere super completa tecnica e dettagliata».
Include il #27 originale: TALOS sa di essere stato creato da un uomo solo,
l'ing. Antonio Rizzo (Ninozz95); la memoria canonica di prodotto è AVM desktop
main, mai reinventata.
L'owner osserva che potrebbe essere relativamente semplice, perché il motore di
memoria è già costruito: il lavoro è l'ingest e la copertura, non il meccanismo.

### G. Debito tecnico registrato (25 voci)
**Sicurezza** — S4 i file della Libreria sono in chiaro sul disco mentre il DB è
cifrato · S5 l'override endpoint spedisce la chiave a qualunque host senza
conferma · S6 il modello scrive file senza consenso per-scrittura · S8 il confine
del contesto non fidato è falsificabile · S9 la redazione dei segreti è solo
esatta · S10 l'export scrive in chiaro nella cache e corre col destinatario ·
S11 FileProvider concede tutta la radice esterna.

**Architettura** — A2 `chatController.ts` è un oggetto-dio (1412 righe) · A3
nessun teardown, la ri-serratura lascia tutto vivo in memoria · A4 Memoria e
Libreria sono due pipeline di iniezione quasi identiche · A5 tre protocolli
d'errore e codici `TALOS_*` che arrivano all'utente · A6 repository a 38 metodi
× 3 implementazioni · A7 inversione dei livelli.

**Test** — T1 la revoca dei grant non gira in nessun test · T2 Stop/abort senza
test · T3 gli adattatori provider hanno un solo test 401 in tutto · T4 il motore
di dettatura nativo non è testato · T6 i blocchi `thinking` firmati di Anthropic
non sono catturati · T7 i giri tool non sono persistiti · T8 l'audit si scrive e
non si mostra · T9 le miniature rileggono ogni immagine per intero.

**Prestazioni/UI** — P3 il riscaldamento a vuoto è una raffica non ceduta di
284KB · P5 il foglio composer si mangia un Back durante la chiusura · P6 la
griglia Libreria non ha azioni per elemento e il raggruppamento non è persistito ·
P8 `feature-parity.json` dichiara ancora `planned` roba spedita.

**Miei, aggiunti oggi** — cancellare un link non cancella la sua scheda dal disco ·
la presenza delle schede è uno `stat` per estensione invece di una sola lettura
di cartella.

### H. Le chiavi che tiene l'owner (non sono fasi, sono permessi e strumenti)
| # | Chiave | Cosa sblocca | Stato 2026-07-30 |
|---|---|---|---|
| 1 | **SDK Android + chiave di firma** | APK distribuibile e verifica su telefono FISICO (oggi ADB non parte, `0xC0000135`) | ⛔ **non sbloccata** |
| 2 | **Catena Rust + NDK** | Tutta la famiglia D, modelli locali | ✅ **SBLOCCATA dall'owner** — da installare |
| 3 | **Autorizzazione P6** | Connettori (Gmail, calendario, email) + sync desktop↔mobile | ⛔ **non sbloccata** |
| 4 | Servizio cloud opzionale *(spostato qui da J)* | Carichi lunghi migrati fuori dal telefono, in abbonamento | ⛔ decisione con la distribuzione |
| — | Affidabilità browsing | PROD-CRITICAL, ma è lane di **Codex** | non è dell'owner |
| — | Allineamento stile desktop | congelato dal freeze `5dd0c0be` | finestra desktop chiusa |

**Conseguenza della chiave 1 non sbloccata, da ripetere a ogni consegna:** ogni
APK è di debug e non è distribuibile, e **ogni verifica è in simulazione, mai su
un telefono fisico**. Va detto all'owner ogni volta, non dato per sottinteso.

### I. Piattaforma agentica = **la piattaforma di coding locale (K)**
**Decisione owner 2026-07-30: I e K sono la stessa cosa, unite.** L'owner aveva
chiesto K come famiglia nuova («piattaforma di coding in locale, analisi Claude
Code e ChatGPT, completissima»); le slice 1–5 del programma di parità SONO Claude
Code — incarico osservabile, registro strumenti, permessi prima di scrivere,
esecuzione isolata, intelligenza sul repository. Tenerle separate significava
progettare due volte lo stesso motore.

Le 11 slice, in una riga ciascuna: *0* mappa di cosa esiste (precondizione
obbligatoria, nessuna migrazione ampia prima) · *1* gli incarichi diventano
oggetti osservabili, fermabili e riprendibili · *2* registro strumenti con schemi
versionati e validati · *3* permessi, approvazioni, scrittura su disco con
annullamento · *4* isolamento dell'esecuzione · *5* intelligenza sul codice
(ricerca, struttura, modifiche a tre vie) · *6* ricerca con citazioni verificate ·
*7* generazione file · *8* artefatti interattivi · *9* connettori · *10* più
agenti insieme.

**Dipendenza reale, scoperta riordinando:** una piattaforma di coding locale deve
leggere e scrivere file veri ed eseguire comandi, cioè ha bisogno del terminale
bash via Shizuku — che l'owner ha appena messo in **C**. La catena è
**C → I/K**, e la scaletta dell'owner già la rispetta.

Il lavoro di analisi richiesto («analisi Claude Code e ChatGPT, completissima»)
diventa la ricerca preliminare della slice 0.

### Decisioni bloccate sulla chat temporanea (2026-07-30/31)

Dalla ricognizione competitor richiesta dall'owner. Dettaglio in
`decisions/2026-07-30-temporary-chat-competitors.md`.

**D-30 — Il timer di auto-cancellazione sarà CONFIGURABILE e OPT-IN.**
Spento di partenza, durata scelta dall'utente, mai avviato da noi. È una regola
e non un'impostazione perché il precedente esiste: Claude Code cancellava i
transcript dopo 30 giorni al riavvio senza averlo detto, ed è finito sulla
stampa come problema di privacy — non per la scelta tecnica, ma perché era
silenziosa.
⇒ vive in **F** quando si aprirà (parità con ChatGPT, l'unica riga dove ci batte).

**D-31 — La giuntura L3: chat temporanea + modello locale.**
Da tenere presente quando si apre **D**, NON un cantiere a sé.
Oggi l'avviso dice «il tuo fornitore la riceve comunque»; con un modello che
gira dentro il telefono quella riga **sparisce**. È l'unica configurazione al
mondo in cui «questa non la vede nessuno» è vera fino in fondo, e ChatGPT e
Claude non potranno mai offrirla perché **loro sono il server**.
Non è lavoro nuovo: la chat temporanea è fatta, i modelli locali sono in
scaletta. Una giuntura, non un cantiere.
⇒ **quando si progetta D, questa riga va letta prima**, perché cambia quanto
vale quel lavoro.

### J. Congelati per decisione esplicita dell'owner
- **"TALOS automatic"** — router che cambia modello secondo la complessità del
  task. «Memorizzalo ma non lo facciamo adesso»: potrebbe rompere tutto e va
  analizzato alla perfezione.
- **Supermemory self-host** — dopo la v7.

*(Shizuku è uscito da qui: il GO è arrivato, vive in **C**. Il servizio cloud è
uscito da qui: è una chiave dell'owner, vive in **H**.)*

---

## PARTE 3 — Scaletta, **bloccata dall'owner 2026-07-30**

| Ordine | Famiglia | Nota dell'owner |
|---|---|---|
| **1** | **A** — i due difetti r11 | fuori scaletta di fatto: sono miei, si chiudono comunque |
| **2** | **F** — le richieste FE | «molti di questi sono già stati fatti ma tu verifica per correttezza» |
| **3** | **B** — libretto d'origine dei file | disegno già approvato fino alla parte 1 di 2 |
| **4** | **C** — tool + dispositivo | «super attentamente… android termux shizuku… max potencial no compromise… autorizzare terminale bash» |
| **5** | **D** — modelli locali | chiave 2 (Rust+NDK) sbloccata dall'owner |
| **6** | **E** — Deep Research | R-1 (stato serializzabile) va per prima |
| **7** | **E2** — self-memory | nuova, assorbe il vecchio #27 |
| **8** | **G** — debito tecnico | 27 voci |
| **9** | **H** — le chiavi dell'owner | non è una fase: è ciò che sblocca lui |
| **10** | **I = K** — piattaforma agentica / coding locale | unite per decisione dell'owner |
| **11** | **J** — congelati | 2 voci, ferme per sua scelta |
| **12** | **L** — allineamento desktop + architettura cloud di sincronizzazione | «ultimissimi passi… ma questo è lontano, non blocchiamo per adesso» |

### L — gli ultimissimi passi (owner 2026-07-30)

**L1 — Allineare la versione desktop.** L'owner: «penso che lo farai tu, in
maniera perfetta».
⚠️ Nota di realtà da portare avanti: oggi il desktop è **congelato**
(`5dd0c0be`) e la parità viaggia come ticket-mirror verso Codex, non come lavoro
mio diretto. Se l'owner vuole che lo faccia io, è un **cambio di lane** e va
comunicato a Codex. Segnalato, non bloccante.

**L2 — Architettura cloud per sincronizzare desktop e mobile**, incluse tutte le
sessioni attive, tramite login.
Non parte da zero: il wizard account esiste già local-first con OAuth
predisposto (N1, fatto), e il servizio cloud opzionale è già una chiave in H.
Il pezzo mancante vero è **il login e la sessione condivisa**, che dipende da
**P6** — non autorizzato. Da riprendere quando P6 si sblocca.

**Le uniche dipendenze tecniche** (tutto il resto è preferenza, e la preferenza
è espressa qui una volta invece che a ogni blocco):
- F1 (ricerca web) sblocca F2, F5 e il contenuto pieno di Deep Research.
- F3 e F4 vanno insieme: la scrittura locale senza registro visibile è la cosa
  che l'owner ha sempre rifiutato.
- C → I/K: la piattaforma di coding ha bisogno del terminale e dell'accesso al
  dispositivo che vivono in C.
- D richiede la chiave 2 installata.

---

## PARTE 4 — Dubbi da chiudere

L'owner (2026-07-30): «voglio altre domande specifiche su tutte le fasi, tante,
chiudiamo ogni dubbio prima di andare avanti e memorizzale fisicamente».

Le domande e le risposte vivono in
`docs/superpowers/decisions/2026-07-30-phase-questions-and-answers.md`, una riga
per decisione, scritta **quando la risposta arriva** e mai riassunta a memoria.

---

## MODIFICA D'ORDINE — owner 2026-07-31 (vincolante, sostituisce la scaletta sopra)

L'owner, testuale: «il blocco C va rimandato a quando faremo la piattaforma
agentica cioè sostanzialmente la nostra versione di Codex o Claude Code; invece
la fase subito successiva alla fase B che stai facendo adesso sarà lo
scaricamento dei modelli in locale da Hugging Face — questa deve essere
un'altra priorità assoluta».

Quindi:

1. **B — libretto d'origine dei file** ← in corso
2. **MODELLI LOCALI — scaricamento da Hugging Face** ← priorità assoluta, subito dopo B
3. …il resto della scaletta invariato
4. **C — tool, Termux, Shizuku, terminale bash** → NON è più una fase a sé:
   viaggia con **I = K**, la piattaforma agentica (la nostra versione di Codex /
   Claude Code). Ha senso: il terminale e l'accesso al dispositivo sono ciò che
   quella piattaforma usa, e costruirli prima significherebbe costruirli senza
   il consumatore che ne definisce la forma.

Il centro modelli locali ha già la sua specifica congelata (M1-M8b,
`talos-model-catalogue-spec` in memoria): motore nativo llama.cpp + WebGPU
arbitrati dal benchmark, scoperta hardware viva, catalogo remoto firmato. Lo
scaricamento da Hugging Face è la porta d'ingresso di quel centro, non un pezzo
nuovo.
