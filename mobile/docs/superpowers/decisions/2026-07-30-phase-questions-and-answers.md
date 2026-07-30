# Domande di fase e risposte dell'owner — 2026-07-30

L'owner: «voglio altre domande specifiche su tutte le fasi, tante, chiudiamo ogni
dubbio prima di andare avanti **e memorizzale fisicamente**».

Questo file è quel "fisicamente". Regole con cui è tenuto:

- Una riga per decisione, scritta **quando la risposta arriva**, mai ricostruita
  a memoria dopo.
- Le domande restano scritte **anche prima** della risposta, marcate `⏳`, così si
  vede cosa è ancora aperto invece di scoprirlo a metà implementazione.
- Se una risposta cambia, la vecchia **non si cancella**: si barra e si scrive
  perché è cambiata. Un registro che riscrive il passato non serve a niente.
- Ordine delle famiglie: quello bloccato in
  `plans/2026-07-30-master-backlog-and-locked-constraints.md`, Parte 3.

---

## Decisioni già prese (prima di questo file, recuperate e messe qui)

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-01 | Il libretto d'origine vive solo dentro TALOS o anche dentro il file? | **Dentro TALOS + nel file** all'export | 2026-07-30 |
| D-02 | Cosa viaggia dentro un file esportato? | **Solo modello e data.** Il prompt resta dentro TALOS | 2026-07-30 |
| D-03 | Il blocco B include anche la lettura dei sigilli dei file in arrivo? | **Sì, tutto insieme** — incluse impronta percettiva e verifica C2PA | 2026-07-30 |
| D-04 | Quale impianto per il libretto? | **A — libretto tipizzato** (tabella dedicata, non la borsa JSON) | 2026-07-30 |
| D-05 | K è il nome vero di I, o sono cose diverse? | **Uniscile: K = I** | 2026-07-30 |
| D-06 | Quali chiavi H sblocca l'owner? | **Solo la 2** (Rust + NDK). Firma app e P6 restano chiuse | 2026-07-30 |
| D-07 | Ordine delle famiglie | A · F · B · C · D · E · E2 · G · H · I=K · J | 2026-07-30 |
| D-08 | Vincolo su C | Analisi totale Android + Termux + Shizuku, tutte le operazioni, max potenziale, **terminale bash autorizzato** | 2026-07-30 |

### Famiglia A — i due difetti r11

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-09 | Nel filtro "Tutti", come stanno insieme file e link? | **Tutto mescolato per chat**: una sezione per chat, dentro file e link insieme nella stessa griglia. **+ la DATA accanto al nome della chat** nell'intestazione di sezione (aggiunta dall'owner, non era fra le opzioni) | 2026-07-30 |
| D-10 | Quanto ricche le righe del drawer del chip fonti? | **Favicon accanto al titolo**, il resto della riga invariato. L'anteprima della pagina resta non usata per ora | 2026-07-30 |

**Conseguenze di D-09 sul lavoro** (registrate perché non erano nella domanda):
- serve una tessera che sappia rendere sia un file sia un link, o due tessere
  dentro la stessa griglia — non due griglie;
- il raggruppamento per chat deve produrre **anche una data**, quindi
  `groupTalosLibraryByChat` deve restituire più del solo titolo;
- la data di una sezione va definita: è la data della chat, o la più recente fra
  i suoi elementi? → **domanda aperta A-Q3**, sotto.

### Famiglia F — le 15 richieste FE

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-11 | Come procedo con le 15? | **Verifico tutte e 15 e riferisco riga per riga con la prova nel codice**, poi si decide cosa costruire | 2026-07-30 |
| D-12 | F-6 (drawer stile Claude) e F-7 (composer immersivo ChatGPT) sono la stessa cosa? | **Due interruttori separati**, convivono in Aspetto come i temi | 2026-07-30 |
| D-13 | **NUOVA richiesta owner**, arrivata rispondendo ad A-Q3 | **Filtro di ordinamento nel menu a puntini** della Libreria: ordina per data (più recente, ecc.) | 2026-07-30 |

### Famiglia B — libretto d'origine

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-14 | Un file senza sigillo: cosa mostro? | **Niente.** L'esito compare solo quando un sigillo c'è: verificato, oppure rotto. Motivo dell'owner accolto: "non verificato" su ogni foto è rumore che si impara a ignorare | 2026-07-30 |
| D-15 | Ricostruire il modello dei file già esistenti? | **No, resta ignoto.** Nel libretto va solo ciò che è stato osservato nell'istante in cui è successo | 2026-07-30 |
| D-16 | Su quali tipi di file scrivo i marcatori all'export? | **Su tutto, come si riesce**: immagini con i marcatori standard, PDF e Office con i loro campi proprietà | 2026-07-30 |
| D-17 | Quale data accanto al nome della chat? | **L'elemento più recente** della sezione (era P-01, confermata) | 2026-07-30 |
| D-18 | Ordinamento e raggruppamento sono persistiti? | **Sì, entrambi** — chiude anche il debito P6 (era P-03, confermata) | 2026-07-30 |
| D-19 | Il libretto copia il prompt o lo referenzia? | **Punta al messaggio.** Nessuna seconda copia di testo personale; cancellare la chat lo toglie anche dal libretto (era P-05, confermata) | 2026-07-30 |
| D-20 | Il terminale bash e la regola "mai runShell" | **Coesistono**: il terminale esiste a potenza piena ma è la capability a rischio massimo — conferma per ogni invocazione, comando mostrato prima, registro, annullamento dove possibile (era P-10, confermata) | 2026-07-30 |

### Dichiarate come conseguenze (owner informato, obiezione possibile)

Non domande: discendono da decisioni già prese e sarebbe stato uno spreco farle
scegliere. Restano scritte perché una conseguenza non registrata è una decisione
presa di nascosto.

| # | Conseguenza | Discende da |
|---|---|---|
| C-01 | Menu a puntini: più recenti · meno recenti · nome chat A-Z | D-13 (l'ordinamento per tipo lo fanno già i chip) |
| C-02 | Nella griglia mista si riusa la tessera link esistente, nella stessa griglia dei file | D-09 (una tessera che serve due cose diventa `v-if`) |
| C-03 | La scheda d'origine è una sezione sempre visibile nel dettaglio del file | richiesta letterale dell'owner: "risalire a tutti i dati" |
| C-04 | La ricerca di C copre Android + Termux + Shizuku + **root** | D-08, "max potencial no compromise" |
| C-05 | Se la chiave BYOK manca quando tocca a F1, si parte da F2 | evita di fermare un turno aspettando l'owner |
| C-06 | La memoria di sé è marcata a parte dalla memoria personale dell'utente | cancellare la propria memoria non deve cancellare la conoscenza di sé del prodotto |
| C-07 | I/K non si apre finché C non ha consegnato dispositivo e terminale | D-05 + P-17: una piattaforma di coding che non legge, scrive ed esegue è una demo |

### Secondo giro di conferme

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-21 | Corrispondenza per impronta visiva: cosa fa TALOS? | **La scrive in silenzio**, visibile solo aprendo la scheda. La somiglianza è una soglia, non una prova: un avviso trasformerebbe un "probabilmente" in un'affermazione (era P-06) | 2026-07-30 |
| D-22 | Marcatori sui formati difficili: quando? | **Dopo** che immagini e parte in lettura funzionano. Lo scopo resta "su tutto" (D-16); questa è la sequenza (era P-09) | 2026-07-30 |
| D-23 | Primi tre debiti quando arriva G | **S4** (file in chiaro) · **T3** (adattatori provider senza test) · **A5** (codici `TALOS_*` all'utente) (era P-15) | 2026-07-30 |
| D-24 | Fonte della self-memory | **Generata dal codice**, con l'avvertenza dell'owner: «la doc del repo è molto vecchia e va aggiornata» | 2026-07-30 |

### D-25 — Come si tratta la documentazione vecchia (owner 2026-07-30)

L'owner ha sollevato il problema e chiesto come procedere. Approvato:

**La regola.** La mappa generata risponde a **COSA**. I documenti rispondono solo
a **PERCHÉ**, e sempre con la loro data attaccata.

Motivo: i ledger e i piani sono un **diario**. Registrano cosa è stato deciso e
fatto in una data: veri come storia, falsi come descrizione del presente. Un
ledger del 22 luglio che dice "i link stanno in un ramo separato" era vero allora
ed è falso ora. Dato in pasto a una self-memory produrrebbe il peggior tipo di
errore possibile — non "non lo so", ma un'affermazione precisa e falsa su sé
stesso. Il codice invece non può essere in ritardo su sé stesso.

**Le tre fonti, separate:**
1. **Fatti** — schermate, impostazioni, strumenti, provider, tabelle, permessi:
   generati dal codice a ogni build. Marciscono solo insieme al codice.
2. **Storia** — dai documenti, ma citata come «il 26 luglio è stato deciso X,
   perché Y». Vero per sempre, anche quando la decisione viene ribaltata.
3. **Racconto** — scritto a mano, corto: cos'è TALOS, chi l'ha fatto, perché così.
   Abbastanza corto da essere davvero mantenuto.

**Il one-up: TALOS trova da solo la propria documentazione scaduta.** Avendo la
mappa (vera per costruzione) e i documenti (fermi alla loro data), il confronto è
meccanico: un documento che contraddice la mappa è scaduto, e lo si sa senza che
nessuno se ne accorga per caso. Ne esce un elenco — *questi N documenti
contraddicono il codice, ecco dove* — e la doc si sistema **per valore**, non in
blocco. **Nessuna riscrittura preventiva**: invecchierebbe di nuovo, cioè sarebbe
lo stesso problema rimandato.

Effetto: la documentazione smette di degradarsi in silenzio e comincia a
lamentarsi.

### Terzo giro di conferme

| # | Domanda | Risposta | Data |
|---|---|---|---|
| D-26 | Quanto spazio possono prendersi i modelli locali? | **Chiede ogni volta**, nessun tetto complessivo — *scelta dell'owner CONTRO la mia raccomandazione, che era un tetto* | 2026-07-30 |
| D-27 | Scaricare modelli sotto rete mobile? | **Solo Wi-Fi**, con deroga esplicita e il peso mostrato prima | 2026-07-30 |
| D-28 | Quanto a fondo verifica Deep Research? | **Verifica tutto**, dichiarando il tempo previsto prima di partire | 2026-07-30 |
| D-29 | Cosa può fare il modello su un'installazione nuova? | **Solo osservare.** Scrittura, dispositivo e terminale spenti; ogni potere si accende a mano leggendo cosa comporta | 2026-07-30 |

**Mitigazione registrata su D-26.** L'obiezione alla scelta "chiede ogni volta"
era che dieci sì di fila riempiono il telefono lo stesso, e un telefono pieno non
dà un errore chiaro: si comporta male e nessuno collega la lentezza all'app che
ha riempito il disco tre settimane prima. L'owner ha scelto comunque, ed è sua
facoltà. Mitigazione accettata **dentro** la sua scelta, non contro:
a ogni scaricamento si mostra lo spazio libero residuo, e se l'operazione porta
il telefono sotto una soglia di sicurezza lo si dice **prima**, non dopo.
Nessun tetto: solo il numero sotto gli occhi nel momento in cui si decide.

---

## Proposte mie — CONSIGLIATE, in attesa del sì dell'owner

L'owner, 2026-07-30: «per le domande sopra in poi dammi quelle che consigli tu» →
poi, chiarendo: «cioè **marca le consigliate**». Quindi le domande continuano ad
arrivare, con l'opzione che consiglio marcata: la scelta resta sua, la fatica di
capire quale sia la strada giusta è mia.

Ogni riga qui sotto è la mia proposta con la motivazione, e dice **cosa cambia se
è sbagliata** — così l'obiezione è possibile senza rileggere il codice. Diventano
decisioni solo quando l'owner risponde, e allora salgono nelle tabelle sopra.

### Famiglia A

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-01 | La data accanto alla chat è quella dell'**elemento più recente** della sezione | È la data che si muove quando la sezione cambia, ed è la chiave naturale del filtro di ordinamento che l'owner ha appena chiesto (D-13): ordinare per "più recente" e mostrare una data di creazione sarebbe incoerente | Si cambia il campo mostrato; nessun impatto strutturale |
| P-02 | Il menu a puntini avrà: **più recenti · meno recenti · nome chat A-Z** | Tre voci coprono l'uso reale. Un ordinamento per tipo di file duplicherebbe i chip di filtro che già esistono | Si aggiunge una voce |
| P-03 | Ordinamento **e** raggruppamento vengono **persistiti** | Il registro debiti (P6) dice che il raggruppamento per chat oggi NON è persistito: si perde a ogni riapertura. Aggiungere un ordinamento non persistito raddoppierebbe il difetto invece di chiuderlo | Una scelta si dimentica a ogni apertura |
| P-04 | I link nella griglia "Tutti" usano la **tessera link esistente** dentro la stessa griglia dei file, non una tessera nuova unificata | Una tessera che serve due cose finisce piena di `v-if`; due tessere nella stessa griglia danno lo stesso risultato visivo con metà complessità. La griglia è il contenitore condiviso, non il componente | Se il risultato visivo stona, si unifica dopo |

### Famiglia B

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-05 | Il libretto **non copia il prompt**: punta al messaggio che lo contiene | Il prompt è già nel database dei messaggi. Copiarlo creerebbe una seconda copia di testo sensibile da cifrare, cancellare e dimenticare due volte. Un riferimento cancella insieme all'originale | Se un messaggio viene cancellato il prompt sparisce dal libretto — che è il comportamento corretto, non un difetto |
| P-06 | Una corrispondenza per impronta visiva si registra **in silenzio** e si vede solo aprendo la scheda | Un avviso a schermo su "questa somiglia a…" sarebbe una notifica basata su una soglia che è una regola di ricerca, non una prova. Dichiararla in silenzio e mostrarla dove si va a cercare è onesto senza essere invadente | Si alza a notifica |
| P-07 | La scheda d'origine è una **sezione sempre visibile** nel dettaglio del file, non dietro un tocco in più | È la richiesta letterale dell'owner: risalire a tutto. Nascosta dietro un tocco, esiste ma non si usa | Si collassa |
| P-08 | L'export **non ri-comprime mai** un'immagine per scriverci i marcatori | Ri-comprimere distruggerebbe il sigillo che OpenAI o Google hanno messo sulla loro immagine. Verificato: oggi TALOS non ri-comprime i generati; l'export non deve introdurlo | Un sigillo valido diventerebbe rotto per colpa nostra |
| P-09 | I marcatori sui formati "difficili" (WebP, Office, PDF) si aggiungono **dopo** che immagini e la parte in lettura funzionano | D-16 dice "su tutto, come si riesce" — questa è la sequenza, non una riduzione dello scopo: strade diverse per formato, aggiunte una alla volta con il loro test | Nessuno: è ordine interno |

### Famiglia C — tool, dispositivo, terminale

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-10 | Il terminale bash **non ribalta** la regola "tool tipizzati, mai `runShell`": la affianca come capability di **livello di rischio massimo**, con conferma per singola invocazione, anteprima del comando, registro e annullamento dove possibile | La regola esisteva per impedire che un modello persuaso eseguisse comandi arbitrari. L'owner ha autorizzato il terminale, non l'ha tolta di mezzo: la conciliazione è "esiste, ma è la cosa più sorvegliata del catalogo" | Se l'owner vuole una shell libera senza conferme, va detto esplicitamente: è un cambio di postura, non un dettaglio |
| P-11 | La ricerca preliminare di C copre **Android + Termux + Shizuku + root** e produce il catalogo di TUTTE le operazioni prima di scrivere una riga | È il vincolo testuale dell'owner: "max potencial no compromise". Termux non era mai stato nominato prima | — |
| P-12 | F1 (ricerca web) resta la prima di C, ma se la chiave BYOK non arriva **parto da F2** invece di fermarmi | Fermarsi ad aspettare una chiave sprecherebbe il turno; F2 non dipende da niente di esterno | Si inverte l'ordine di due fasi |

### Famiglia E2 — self-memory

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-13 | La fonte dell'ingest sono **i documenti del repo più una mappa dell'architettura generata**, non un testo scritto a mano | Un testo scritto a mano invecchia il giorno dopo e nessuno se ne accorge finché TALOS non racconta una cosa falsa di sé stesso. Generata dal codice, la mappa marcisce solo insieme al codice | Se generarla è troppo fragile, si scrive a mano con una data di scadenza visibile |
| P-14 | La memoria di sé è **marcata come tale** e non si mescola alla memoria dell'utente | Sono due cose diverse: una è chi sei tu, l'altra è cos'è il prodotto. Mescolarle significa che cancellare la propria memoria personale cancella anche la conoscenza di sé del prodotto | — |

### Famiglia G — debito, quali per primi

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-15 | Quando G arriverà, i primi tre sono **S4** (file in chiaro sul disco), **T3** (adattatori provider quasi senza test) e **A5** (codici `TALOS_*` che arrivano all'utente) | S4 perché TALOS sarà distribuito e l'asimmetria è nella direzione sbagliata; T3 perché è la superficie che si rompe più spesso sul telefono ed è indifesa; A5 perché è quello che l'utente VEDE quando qualcosa va storto | Si riordina; sono 27 voci e nessuna dipende dalle altre |

### Famiglia I=K — piattaforma agentica / coding locale

| # | Decisione | Perché | Se sbagliata |
|---|---|---|---|
| P-16 | La slice 0 (mappa di cosa esiste) è **obbligatoria** e assorbe l'analisi di Claude Code e ChatGPT chiesta dall'owner | Era già segnata come precondizione. L'analisi richiesta è esattamente il materiale della mappa: cosa fanno loro, cosa abbiamo noi, dove è il buco | — |
| P-17 | Non si apre I/K finché C non ha consegnato accesso al dispositivo e terminale | Una piattaforma di coding che non può leggere, scrivere ed eseguire è una demo | — |

---

## Aperte

*(Le domande vengono aggiunte qui a batch, famiglia per famiglia, nell'ordine
della scaletta. Ogni risposta si sposta nella tabella sopra con il suo numero.)*
