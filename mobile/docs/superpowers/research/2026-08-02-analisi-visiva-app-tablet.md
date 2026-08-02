# Analisi visiva dell'app sul dispositivo — materiale per il refactor UI

Screenshot presi sul **OnePlus Pad 3**, build `58bc6ad`, 2026-08-02. Ogni rilievo
qui sotto viene da una schermata vera, non da una lettura del codice.

Schermate coperte: Chat · Ricerca approfondita (con rapporto aperto) · Libreria ·
Diagnostica · Attività · Centro impostazioni · Modelli (Provider / Catalogo /
Locale) · centro download Hugging Face · selettore modello · elenco file di un
repository.

---

## 1. Il difetto strutturale: il pannello sinistro non cambia mai

Su **ogni** stazione — Diagnostica, Attività, Libreria, Impostazioni, Ricerca
approfondita — la colonna di sinistra resta **l'elenco delle chat**, con
«Cerca chat», «Nuova» e «Tieni premuta una chat per le azioni».

Su un tablet questo significa che **un terzo dello schermo mostra qualcosa che
non c'entra** con quello che stai facendo. E dice una cosa sull'architettura che
probabilmente non vogliamo dire: che TALOS è *una chat con dei pannelli laterali*
invece che uno spazio di lavoro con più superfici.

**Proposta.** La colonna sinistra diventa **contestuale**: elenco chat quando sei
in chat, elenco dei file quando sei in Libreria, elenco delle run quando sei in
Ricerca, indice delle sezioni quando sei in Impostazioni (dove già funziona
così). Dove non c'è un elenco sensato, la colonna **si ritrae** e la stazione
prende la larghezza piena.

È il cambio più grosso di questo elenco ed è quello che cambia di più la
sensazione dell'app.

## 2. Tre linguaggi diversi per la stessa cosa: le linguette

| Schermata | Come sono fatte |
|---|---|
| **Diagnostica** | Stato / Dati / Avanzate — controllo segmentato, riquadro **pieno** sulla scelta |
| **Modelli** | Provider / Catalogo / Locale — **sottolineatura** arancione, nessun riquadro |
| **Libreria** | Tutti / Immagini / File / Link — **pillole** con riempimento pieno |

Tre grammatiche per «scegli una vista fra queste». È esattamente la incoerenza
segnalata dall'owner. **Una sola** va scelta e applicata ovunque — e visto che il
riferimento visivo approvato è la schermata Locale, la sottolineatura è la
candidata naturale, con le pillole riservate ai **filtri** (che sono un'altra
cosa: si combinano, non si escludono).

## 3. Attività (e Note): il modulo di creazione occupa il posto del contenuto

La schermata si apre con **tre campi vuoti e un pulsante grande**, e sotto la
frase «Non ci sono ancora attività». Il modulo sta lì permanentemente anche
quando hai venti attività e vuoi solo leggerle.

Il riferimento visivo approvato dice l'opposto: **prima la lista, poi la
ricerca/creazione**. Qui è capovolto.

**Proposta.** La lista occupa la schermata; la creazione è un **pulsante `+`**
nell'intestazione che apre un foglio (Drawer). Lo stato vuoto diventa un vero
stato vuoto — icona, una riga che spiega a cosa serve, un pulsante — invece di un
modulo già aperto.

**E c'è un campo da togliere dalla vista dell'utente finale**: `run_id
(facoltativo)`. È un identificatore tecnico nostro, esposto in un campo di testo
libero in una schermata di prodotto. Nessuno lo digiterà mai a mano.

## 4. Diagnostica: la stessa frase due volte

«**7 controlli superati**» compare **due volte**, una sopra le linguette e una
sotto, a quattro centimetri di distanza. La prima è un riepilogo, la seconda è la
riga espandibile — ma il lettore vede una ripetizione, non due livelli.

E «Copia diagnostica» è un **pulsante pieno a piena larghezza**: peso visivo da
azione principale per un'azione che si usa una volta ogni sei mesi.

## 5. Il muro arancione del centro download

Nell'elenco dei file di un repository, ogni riga ha **due pulsanti pieni e
arancioni** della stessa identica forza: «Controlla questo telefono» e
«Scarica». Ripetuti quindici volte, diventano un muro.

Due problemi in uno:

1. **Nessuna gerarchia.** Controllare è gratis e reversibile; scaricare costa
   1,5 GB di rete e di disco. Hanno lo stesso peso visivo.
2. **Nessun ritmo.** Quindici righe identiche a tutta larghezza non si scorrono,
   si subiscono.

**Proposta.** «Controlla» diventa un'azione **discreta** (testo o icona);
«Scarica» resta piena ma **una sola per riga**, e la riga mostra l'esito del
controllo come una riga di stato — che è già quello che fa dopo il controllo, e
funziona bene («Gira comodo · circa 8.4 token al secondo»).

## 6. Libreria: manca il filtro che serve di più

I filtri sono **Tutti / Immagini / File / Link**. Ma la maggioranza di quello che
c'è dentro adesso sono **file generati** — rapporti, ricontrolli, risposte — e non
hanno un filtro. Ce l'hanno una **etichetta** («Generato»), che è la prova che la
distinzione conta.

E i **link non sono raggruppati né in griglia**, che è già una richiesta in
memoria: oggi sono righe piatte in mezzo ai file.

## 7. La schermata che funziona, ed è l'unica

La scheda del dispositivo — **OPD2415 · 5.4 GB memoria libera · 40 GB spazio
libero · 24 GB/s banda misurata**, con la barra e la riga monospaziata «Motore
locale a bordo · backend: CPU» — è **esattamente** il linguaggio del riferimento
visivo approvato: stato in cima, numeri tabulari in monospaziato, colore
semantico separato dall'accento.

**È l'unica schermata dell'app che lo usa.** Il refactor non deve inventare uno
stile: deve **estendere questo** a tutto il resto.

## 8. Rilievi minori, ma che si notano

- **Il modello predefinito** occupa un riquadro a piena larghezza sopra le
  linguette in Impostazioni › Modelli, e **duplica** il selettore del compositore.
  Delle due, quella nel compositore è la porta che si usa.
- **L'intestazione della chat è vuota**: solo un ⋮ a destra. Nessun titolo della
  conversazione, mentre l'elenco a sinistra ce l'ha.
- **Il conteggio «43 in tutte le chat»** in monospaziato accanto a un ⋮ senza
  etichetta: due elementi diversi appaiati senza relazione visiva.
- **Stati vuoti senza forma comune**: Attività ha una frase centrata, Ricerca ha
  un paragrafo, la Libreria non ne ha uno. Serve **un componente solo**.
- **Il messaggio dell'imatrix** conserva il prefisso «Non posso controllarlo:»
  che ora è sbagliato — non è che non possiamo, è che non c'è niente da
  controllare. (Già segnato nel ledger dei difetti.)

---

## Ordine proposto per il refactor

1. **Il censimento** (già richiesto): quali schermate usano il dropdown legacy,
   quali non hanno linguette, quali divergono dal riferimento. Senza l'elenco si
   rifà a caso.
2. **Una grammatica sola per linguette, filtri e stati vuoti** — tre componenti,
   applicati ovunque. È il cambio che rende l'app riconoscibile da sé stessa.
3. **La colonna sinistra contestuale.** Il più grosso, e quello che cambia di più
   la sensazione dell'app su tablet.
4. **Gerarchia dei pulsanti**: una azione piena per riga, il resto discreto.
5. **Lista prima del modulo** su Attività e Note.
6. Le richieste già in coda: Libreria dei modelli locali col benchmark, centro
   download nella barra laterale, widget con barra e pausa/riavvio, filtro
   «Generati», link in griglia.

---

# Parte 2 — Tablet in verticale e telefoni (2026-08-02)

## 9. In verticale la divisione in due colonne NON si scioglie

Ruotato il tablet in verticale (2400×3392), la schermata resta **spaccata in
due**: l'elenco delle chat tiene ancora ~42% della larghezza e la conversazione
vive nel 58% che resta. Su un tablet in verticale è la disposizione sbagliata:
il maestro-dettaglio ha senso quando la larghezza abbonda, non quando è la
dimensione corta.

**Proposta.** Sotto una soglia di larghezza — che in verticale il tablet incrocia
— la disposizione **collassa a colonna sola**, e l'elenco torna raggiungibile dal
menu a panino che **c'è già**. Nessun componente nuovo: la stessa navigazione che
il telefono usa per forza, usata anche qui per scelta.

## 10. Il contenuto scorre SOTTO la barra di stato

Sempre in verticale, in cima alla conversazione si vede una bolla **tagliata
dietro la barra di sistema**, con la sua riga di azioni e il «Tu · 16h» che
finiscono sotto l'orologio e le icone di rete.

Manca l'inserto di area sicura in cima allo scorrevole della chat. Non è un
dettaglio di gusto: è testo dell'utente reso illeggibile da un elemento di
sistema. Va sistemato **prima** di qualunque lavoro estetico, e va verificato su
tutte le schermate scorrevoli, non solo sulla chat.

## 11. Cosa dicono le due schermate del telefono dell'owner

Sono screenshot veri, 1080×2376, portrait, arrivati oggi dal campo.

**Ricerca approfondita** — i tre livelli di profondità (Rapida / Approfondita /
Esaustiva) **vanno a capo uno per riga**, tre righe quasi a piena larghezza per
una scelta a tre valori. In orizzontale stanno in una riga sola. Su telefono
mangiano un quinto dello schermo.
→ Su schermo stretto devono diventare un **controllo segmentato compatto** o una
riga scorrevole, non tre blocchi impilati.

**Il riquadro della run interrotta** — il testo è compresso a ~55% della
larghezza e va a capo **cinque volte**, con il pulsante «Riprendi» accanto che
tiene il resto. Su stretto testo e azione vanno **impilati**, non affiancati.

**Il centro download** — la scheda del dispositivo tiene i tre numeri
(3,9 GB / 395 GB / 39 GB/s) su una riga sola ed è **leggibile**: quel componente
regge il restringimento. Le righe dei file invece hanno **due pulsanti pieni
affiancati** con etichette lunghe («Controlla questo telefono» riempie quasi
tutta la sua metà): è il muro arancione del punto 5, peggiorato dalla larghezza.

## 12. Le tre larghezze su cui il refactor va provato

| | larghezza | cosa deve succedere |
|---|---|---|
| **Tablet orizzontale** | ~3392 px | due colonne, ma la sinistra **contestuale** (punto 1) |
| **Tablet verticale** | ~2400 px | **colonna sola** + elenco dal menu a panino |
| **Telefono** (OnePlus 13) | ~1080 px | colonna sola, controlli compatti, azioni impilate |

Il telefono dell'owner ha già l'app installata: la prova finale si fa lì, con le
dita, non con l'emulatore.

---

# Parte 3 — Impostazioni e sistema (2026-08-02)

Schermate: **Centro impostazioni** (indice completo) e **Predefiniti AI** in
dettaglio. Le altre sotto-pagine (Strumenti agente, Aspetto, Lingua, Sistema)
**non sono state catturate**: un primo tentativo ha inquadrato il drawer perché
il tablet era rimasto in verticale e le coordinate erano per l'orizzontale.
Restano da fare.

## Checkpoint di ricerca

| Query | Cosa dice |
|---|---|
| `settings screen UX best practices 2026 progressive disclosure grouping` | **(a)** «Instead of hiding permissions in long settings menus, modern apps explain data usage clearly and **contextually**». **(b)** La disclosure progressiva vale **solo per le opzioni secondarie o avanzate**: «essential features required for the primary user tasks should never be hidden». **(c)** Ogni schermata raggiungibile in **≤3 tocchi**. **(d)** Raggruppare per importanza, sezioni espandibili, gerarchia visiva chiara. |

## 13. Il difetto grave: i permessi dell'agente sono sepolti

In **Predefiniti AI**, in fondo alla pagina — sotto il tono dell'assistente,
sotto tre caselle di spunta — c'è la sezione **«Cosa può fare TALOS in
autonomia»**, con «Leggere i tuoi contenuti: Chiedi ogni volta» e «Creare o
modificare contenuti».

**È la cosa più importante dell'intera app**, in un prodotto che sta per prendere
il controllo del telefono via Shizuku. E sta in fondo a una pagina che si chiama
«predefiniti», sotto la scelta del tono.

Peggio: **esiste già una voce dedicata nel menu, «Strumenti agente»**. Due case
per la stessa materia — l'errore identico alla chiave Tavily nei Predefiniti AI
mentre esiste la stazione Ricerca ([[ia-misplaced-settings-audit]]).

La ricerca lo dice senza mezzi termini: i permessi non si nascondono nei menu, si
spiegano **nel punto in cui contano**. E la disclosure progressiva è per le
opzioni avanzate, **non per le funzioni essenziali**.

## 14. Tre nomi per la stessa cosa, sparsi in tre posti

**«Modello di ricerca»** compare in:
1. Predefiniti AI → «MODALITÀ MODELLO DI RICERCA: Come la chat»
2. la stazione Ricerca approfondita → «I due modelli — li scegli tu» (scrittore e
   verificatore), costruita oggi
3. e la chiave della sorgente di ricerca sta in **Predefiniti AI**, mentre esiste
   la voce **Ricerca** in CONNESSIONI

Tre superfici che parlano dello stesso concetto senza sapere l'una dell'altra.
Va scelta **una casa** e le altre diventano rimandi.

E c'è una collisione di nomi da risolvere: **«Ricerca»** è sia una voce di
impostazioni (la sorgente web) sia una stazione nel drawer (Ricerca
approfondita). Due cose diverse, stesso nome, due menu.

## 15. Tre voci su undici sono morte

**Integrazioni · Email · Promemoria** dicono «Non installato in questa build» e
occupano il **primo livello** della navigazione, mescolate a quelle vere.

In una build interna passa. In un'app **distribuita** — che TALOS sarà — un utente
su tre voci trova il nulla. O vanno in una sezione «in arrivo» dichiarata, o non
vanno mostrate: è la regola «nessun controllo finto» applicata alla navigazione
invece che ai pulsanti.

## 16. Due grammatiche di titolo nella stessa pagina

Predefiniti AI mescola intestazioni **TUTTE MAIUSCOLE** (TONO ASSISTENTE,
MODALITÀ MODELLO DI UTILITÀ) e titoli in caso normale in grassetto («Preferenza
instradamento visivo», «Cosa può fare TALOS in autonomia»). Sono lo stesso
livello gerarchico scritto in due modi.

E i controlli on/off sono **caselle di spunta quadrate** a destra. Su mobile lo
standard per una preferenza che ha effetto immediato è l'**interruttore**: la
casella suggerisce «seleziona, poi conferma», che qui non succede.

## 17. Una cosa che invece è giusta, e va estesa

«Consenti alle chat di usare la Libreria» aggiunge, sotto: *«Questo aggiunge
token a ogni messaggio.»*

È esattamente ciò che la ricerca raccomanda — spiegare la conseguenza **nel punto
della scelta**, non in una pagina di aiuto. È il modello da estendere a tutte le
impostazioni che costano soldi, batteria o privacy: la sorgente di ricerca, i due
modelli, i permessi dell'agente, il salvataggio automatico.

## 18. Proposte, in ordine di valore

1. **«Cosa può fare TALOS in autonomia» esce da Predefiniti AI** e diventa il
   contenuto di **Strumenti agente**, promosso in cima al gruppo INTELLIGENZA.
   In un'app che punta al controllo del dispositivo, è la prima voce, non
   l'ultima riga.
2. **Una casa per il modello di ricerca**, con rimandi dalle altre due.
3. **Le voci non installate** in una sezione dichiarata, o assenti.
4. **Una grammatica di titolo sola** e **interruttori** al posto delle caselle.
5. **La conseguenza accanto alla scelta**, ovunque costi qualcosa — estendendo la
   riga che già esiste sulla Libreria.
6. **Ricerca (impostazione) e Ricerca approfondita (stazione)** vanno rinominate:
   due cose diverse non possono chiamarsi uguale in due menu.

## 19. Cosa manca ancora a questa analisi

Strumenti agente · Aspetto · Lingua · Sistema · Account · Browser. Da catturare
in orizzontale, e da leggere con la stessa domanda: **quante case ha questa
impostazione, e quale è quella vera?**

---

# Parte 4 — TUTTE le pagine di impostazioni (2026-08-02)

Catturate: Predefiniti AI · Strumenti agente · Ricerca · Browser · Aspetto ·
Lingua · Account. Le tre voci «Non installato in questa build» non hanno pagina.

## 20. CORREZIONE a quanto scritto sopra

Avevo scritto che «la chiave Tavily sta nei Predefiniti AI mentre esiste la
stazione Ricerca». **È falso**, e la schermata lo dimostra: la chiave sta in
**Impostazioni → Ricerca**, insieme alla scelta della sorgente e al permesso di
uscita. La memoria [[ia-misplaced-settings-audit]] descrive uno stato superato.

Quello che resta vero è la **collisione di nomi**: «Ricerca» è una voce di
impostazioni (la sorgente web) *e* una stazione nel drawer (Ricerca
approfondita), e in Predefiniti AI c'è «MODALITÀ MODELLO DI RICERCA» che è una
terza cosa ancora (quale modello lavora). Tre significati, una parola.

## 21. La pagina Ricerca è la migliore dell'app, e va presa a modello

Ogni sorgente ha **la sua conseguenza scritta accanto**: Tavily «1.000 ricerche
al mese senza costi e senza carta»; Brave «è richiesta una carta di credito… non
consente a TALOS di salvare i risultati senza un accordo separato, quindi TALOS
apre le fonti con web_read prima di salvarle»; SearXNG «nessuna terza parte vede
la query… l'output JSON è disattivato inizialmente».

E in cima: *«TALOS non possiede un indice del web… Le pagine vengono scaricate e
lette su questo dispositivo: soltanto la query lo lascia.»*

Questo è **esattamente** ciò che la ricerca UX raccomanda — spiegare i dati nel
punto della scelta — ed è già scritto meglio di quanto lo scriva la concorrenza.
**È il modello da estendere**, non da rifare.

## 22. La QUARTA grammatica di linguette

**Aspetto** ha Design / Movimento / Voce come **riquadro con bordo arrotondato**
sulla scelta. Quindi il conto sale a quattro:

| | |
|---|---|
| Diagnostica | riquadro **pieno** |
| Modelli | **sottolineatura** |
| Libreria | **pillole** riempite |
| **Aspetto** | **riquadro con bordo** |

Quattro modi di dire la stessa cosa in quattro schermate.

## 23. Interruttori qui, caselle di spunta là

**Strumenti agente** e **Aspetto** usano **interruttori**. **Predefiniti AI** usa
**caselle di spunta quadrate**. Stessa semantica — una preferenza on/off con
effetto immediato — due componenti diversi. È il caso più netto di componente
duplicato che l'analisi ha trovato.

## 24. Strumenti agente è fatto bene, e proprio per questo la duplicazione pesa

La pagina è ottima: **«17 di 18 attivi»**, la riga che dice *«uno strumento
disattivato non viene inviato al modello e non può essere eseguito»*, gruppi per
area (LIBRERIA, PERSONALI…), e ogni strumento con la sua **etichetta di rischio**
— LETTURA, SCRITTURA — accanto al nome.

Ed è per questo che «Cosa può fare TALOS in autonomia», in fondo a Predefiniti
AI, è un problema serio: **la casa buona esiste già**. Quella sezione va spostata
qui, in cima, come cornice delle 18 capacità: prima *quanto ti fidi*, poi *di
cosa*.

## 25. Aspetto: dodici impostazioni tutte allo stesso livello

Tema · Modalità colore · Stile messaggi · Intestazione immersiva · Cassetto del
compositore · Compositore immersivo · Menu a discesa "+" · Icona app coordinata ·
Animazione risposta · Dimensione caratteri · Dimensione messaggi chat · Finestre
strumenti su mobile.

Nessuna gerarchia fra «Modalità colore», che cambiano tutti, e «Menu a discesa
"+"», che è una preferenza di nicchia. La ricerca dice: disclosure progressiva
**per le avanzate**, mai per le essenziali. Qui non c'è disclosure affatto.

E tre interruttori — cassetto del compositore, compositore immersivo, menu "+" —
descrivono **la stessa area** e si influenzano a vicenda, ma sono tre righe
indipendenti: si possono accendere combinazioni che non hanno senso. Vanno
raccolti in **una scelta sola** («com'è fatto il compositore»).

Buono invece: «l'icona segue il tema — **per applicare il cambio viene chiesto un
riavvio**». Una conseguenza dichiarata prima, non scoperta dopo.

## 26. Il quadro completo delle case doppie

| Concetto | Dove vive | Dove dovrebbe |
|---|---|---|
| Permessi dell'agente | Predefiniti AI (in fondo) **e** Strumenti agente | **Strumenti agente**, in cima |
| Modello predefinito | Impostazioni › Modelli (riquadro grande) **e** pill del compositore | **Compositore**, con rimando |
| Modello per la ricerca | Predefiniti AI **e** stazione Ricerca approfondita | **Stazione**, con rimando |
| Dimensione testo | Aspetto (due voci: interfaccia e chat) | Va bene, ma **una spiegazione sola** |

## 27. Riepilogo delle proposte sulle impostazioni

1. **«Cosa può fare TALOS in autonomia» → Strumenti agente**, in cima. È la
   prima cosa da capire in un'app che punta al controllo del dispositivo.
2. **Una grammatica di linguette** (oggi quattro) e **interruttori ovunque**
   (oggi due componenti).
3. **Gerarchia in Aspetto**: essenziali sopra, avanzate dietro una disclosure; e
   i tre interruttori del compositore diventano una scelta sola.
4. **Le tre voci non installate** in una sezione dichiarata, o assenti.
5. **Disambiguare «Ricerca»**: tre significati, una parola.
6. **Estendere il modello della pagina Ricerca** — la conseguenza accanto alla
   scelta — a tutte le impostazioni che costano soldi, batteria o privacy.
