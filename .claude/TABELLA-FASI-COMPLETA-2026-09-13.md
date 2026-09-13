# TABELLA DELLE FASI, SPIEGATA — tutto il lavoro aperto (13/09/2026)

> Owner, 13/09: «espandi la tabella e spiega i singoli punti per fase. Devo sapere cosa fanno le
> singole fasi. Non posso andare a cercarmi tutto».
>
> ⇒ Qui ogni punto e' raccontato per intero: **cosa succede oggi**, **perche'**, **cosa cambia dopo**.
> Nessun rimando a un altro documento, nessun codice da andare a cercare. I nomi tipo BC-07 restano
> solo come etichetta per ritrovarli nelle code, ma non servono per capire.
>
> **Come e' fatta una fase:** cinque lavorazioni al massimo, che girano insieme senza pestarsi i
> piedi. Ogni lavorazione dice quali file tocca e cosa la dichiara finita.
>
> ⛔ **Il vincolo che regge tutta la divisione.** Il file `frontend/src/legacy/app.js` e' 20.638
> righe, 602 funzioni, nessuna divisione interna. Quasi ogni lavoro sull'interfaccia lo tocca. In
> ogni fase lo puo' avere **un agente solo** — la corsia marcata 🔒 — e gli altri quattro devono
> lavorare altrove. Non e' una preferenza: due agenti sullo stesso file qui hanno gia' fatto perdere
> lavoro.

---

# ✅ FASE 0 · Chiudere il rilascio

## ✅ CHIUSA IL 13/09/2026 — il rilascio e' USCITO

| | |
|---|---|
| release | `desktop-v0.1.5`, pubblicata alle 12:27:49Z, non bozza, non prerelease |
| allegati | tre: installatore 152.043.007 byte, archivio 255.850.965, file delle impronte |
| provenienza | due attestazioni per ciascuno dei due binari, interrogando il registro con l'impronta esatta |
| commit pubblico | `c2a8a98` |

⛔ Verificato sull'**artefatto**, non sul semaforo verde: oggi la differenza fra le due cose e' gia'
costata due volte. Alla sesta il tag ha pubblicato; le cinque volte precedenti non e' mai caduto il
prodotto, cadeva sempre un test o uno script che descriveva la macchina di sviluppo.

**Cosa resta di questa fase, e non e' nostro:** il ramo principale pubblico e' rosso per **due prove
end-to-end della meta' mobile**, dichiarate dalla loro lane e curate da loro. La loro 0.1.31 e'
uscita lo stesso, perche' il controllo sul ramo e il lavoro del tag sono due flussi separati.


**A cosa serve:** mettere in mano alle persone l'installatore `.exe` della versione desktop. Finche'
non e' pubblicato, ogni altra fase e' lavoro che nessuno vede.

**La faccio io, senza agenti.** Commit, build, tag e pubblicazione non si delegano.

### 0.1 · Il tag `desktop-v0.1.5`
Tutto e' pronto e provato. I cancelli sono verdi, l'installatore e l'archivio sono costruiti, e il
prodotto ha superato la prova vera: installato in 81,6 secondi, avviato, chiuso, disinstallato, senza
lasciare processi, collegamenti o file di troppo, e coi dati dell'utente conservati.

**Cosa manca:** niente di tecnico. La copia pubblica del repository e' in mano alla lane mobile per
il loro rilascio. Appena la restituiscono, pubblico.

### 0.2 · I cancelli pubblici ancora rossi
Sul ramo principale pubblico restano due prove rosse del motore di contesto su Linux, piu' la suite
mobile. La cura che avevo applicato a una libreria di validazione ha funzionato. Resta da separare
cosa e' nostro e cosa e' della lane mobile, perche' oggi si guardano nello stesso posto e ci si
accusa a vicenda.

### 0.3 · La catena di pubblicazione della lane mobile
Il loro cancello «zero file cancellati sull'albero intero» e' stato provato nel verso in cui deve
fallire, e ha rifiutato correttamente. Resta un dettaglio: i file che differiscono solo per il modo
in cui finiscono le righe vengono contati come diversi.

⛔ **Nessuna fase si apre prima che 0.1 sia pubblicata.**

---

# ✅ FASE 1 · Il prodotto smette di mentire

## ✅ CHIUSA IL 13/09/2026 — cinque corsie, con la prova di ciascuna

⛔ Ci sono voluti **tre giri**, non uno. Al primo, quattro corsie su cinque sono state **bocciate**
dai revisori avversariali. Al secondo ne sono passate tre. La documentazione ha chiesto un terzo giro.
⇒ Il controllore dietro ogni corsia non e' un lusso: senza, tutto questo sarebbe entrato.

| corsia | esito | commit |
|---|---|---|
| 1 · il saluto che sfoglia la Libreria | ✅ chiusa | `e5d67533` |
| 2 · le rotte che falliscono in silenzio | ✅ chiusa, con residui dichiarati | `bfed1dfd` |
| 3 · le prove che cancellano male | ✅ chiusa | `f9e5972c` |
| 4 · il terminale in basso | ⛔ **premessa falsa**: non c'era niente da riparare. Resta il cancello di consegna | `412b36d7` |
| 5 · la documentazione dell'assistenza | ✅ chiusa al **terzo** giro | `1aa816de` |

**Cancelli rifatti da me, non letti dai loro rapporti:** frontend 1028 prove, kernel 573, suite
principale 2906, tutte verdi, coi codici d'uscita catturati senza pipe e i conteggi veri. ⛔ La prima
volta avevo stampato un codice d'uscita che era quello di `tail`, non dei test.

### ⛔ Cosa resta APERTO di questa fase, dichiarato e non nascosto

- **Il tetto sullo sfogliamento copre due attrezzi su tre.** `research_list` pagina e non e'
  agganciato. Registrato come **BC-10, quarta parte**.
- **Un numero copiato a mano**: il fondo del kernel duplica la taglia di pagina dello store, che non
  e' esportato, e nessun cancello li tiene allineati.
- **BC-07** lascia scoperti il cancello del token, una copia irraggiungibile e l'interfaccia che non
  usa ancora i campi nuovi.
- **La documentazione**: dodici pagine senza un controllo dedicato, la prosa descrittiva non coperta,
  una riga marcata NON VERIFICATA. ⛔ E il limite piu' grande: **nessuno ha aperto la app**. Sappiamo
  che il codice dice quelle cose, non che a schermo si vedano.

### ⭐ Le due lezioni che questa fase ha pagato

1. **Prima di aprire una riga, lo stato si riaccerta NEL CODICE — e anche i NUMERI.** Due corsie sono
   nate su premesse false: due righe erano chiuse da un commit, e una diceva «compare zero volte» su
   una parola che c'era gia'. «Zero» e' il numero piu' pericoloso: somiglia a «non l'ho trovato».
2. **Un revisore senza il permesso di scrivere e' un lettore.** Al primo giro sono entrato in
   modalita' piano mentre i revisori lavoravano, e tre verdetti su quattro sono stati raggiunti
   leggendo invece che rompendo il codice.


**A cosa serve:** oggi TALOS fa due cose che erodono la fiducia. Spreca soldi e tempo senza che
nessuno lo veda, e mostra a schermo numeri che il server non gli ha mai dato. Questa fase chiude
i cinque casi in cui il prodotto dice una cosa e ne fa un'altra.

**Perche' prima:** sono difetti che la persona incontra al primo messaggio, non dopo un'ora d'uso.

### Corsia 1 · Gli dici «ciao» e sfoglia tutta la Libreria
**Oggi:** scrivi un saluto e il modello sfoglia 11 pagine di Libreria, una richiesta dopo l'altra.
L'hai visto tu stesso dall'app installata. Ogni messaggio banale costa come una ricerca.

**Perche' succede, letto nel codice:** due cause che si sommano. La prima e' l'attrezzo stesso, che
dice al modello «continua a seguire il segnalibro finche' non e' vuoto» — cioe' gli ordina di
sfogliare tutto. La seconda e' la guardia che dovrebbe fermare le valanghe: confronta gli argomenti
di una chiamata con la precedente e blocca se sono uguali. Ma nella paginazione il segnalibro cambia
a ogni pagina, quindi gli argomenti sono sempre diversi. **La guardia e' cieca per costruzione**, non
per un errore: non poteva accorgersene nemmeno in teoria.

**Dopo:** un saluto non sfoglia niente, e la guardia scatta su una paginazione anche quando il
segnalibro cambia.

*File: `src/kernel/talosHarness.mjs` · Finita quando: un «ciao» non produce nessuna sfogliata, e la guardia respinge una paginazione fabbricata apposta.*

### Corsia 2 · Tre rotte rispondono errore a ogni giro, e a schermo non si vede niente
**Oggi:** a ogni giro tre richieste al server falliscono, e l'interfaccia non lo dice. Peggio: il
pannello del Contesto mostra dei numeri, e quei numeri il server non li ha mai mandati. Sono
riempimenti di cortesia.

**Perche' e' grave:** un pannello che inventa quando non sa e' peggio di un pannello vuoto. Chi legge
non ha modo di distinguere un dato vero da uno fabbricato, quindi smette di fidarsi anche del resto.

**Dopo:** zero errori silenziosi in un giro vero, e quando un dato non c'e' il pannello scrive «non
disponibile» invece di riempire.

*File: `src/http-app.mjs`, `context-engine/` · Finita quando: un giro vero non produce nessuno di quei tre errori, e il pannello dichiara il vuoto.*

### Corsia 3 · Le prove che cancellano male e quelle che sporcano il repository
**Oggi:** 48 file di prova creano una cartella temporanea e la cancellano alla fine. Su Windows la
cancellazione fallisce se un file e' stato chiuso qualche millesimo di secondo prima — ed e' proprio
quello che succede sotto carico. Una prova cade, la corsa cade, il rilascio si perde. **Oggi questo
e' costato un tag.** Altri quattro file scrivono le fotografie dentro il repository invece che nella
cartella delle prove, quindi dopo ogni suite il repository risulta sporco.

**Come NON si fa:** con una sostituzione di massa che aggiunge ritentativi ovunque. Un ritentativo
messo dappertutto nasconderebbe anche i casi in cui un file e' rimasto aperto per un difetto vero.

**Dopo:** tre suite di fila senza nessun errore di cancellazione, e il repository pulito alla fine.

*File: `tests/**` · Finita quando: tre corse consecutive pulite e `git status` vuoto dopo la suite.*

### Corsia 4 · ⛔ PREMESSA FALSA — il terminale in basso ERA gia' consegnato

⛔ **PREMESSA FALSA, accertata il 13/09/2026, dopo aver messo un agente a ripararla.**

Avevo scritto che la parola chiave del pannello «compare zero volte nel pacchetto servito».
Misurato: **e' falso**. La parola c'e' nel pacchetto **committato**, c'e' nel **sorgente**
committato (tre file, fra cui un foglio di stile suo con dieci occorrenze), e il pacchetto sul
disco e' stato costruito **alle 05:14 di stamattina**, cioe' ore prima che gli agenti partissero.
Nessun file tracciato e' stato modificato per questa corsia, perche' non c'era niente da modificare.

⇒ Ho messo un agente a riparare un difetto **che non esiste**, e il suo revisore ha approvato la
cura di una malattia che non c'era. E' costato due lavorazioni intere.

⭐ Il revisore ha anche trovato, nello scratchpad dell'autore, una **fotografia dell'11/09** con
una shell connessa dentro il pannello in basso, due schede, sessione vera aperta dalla barra. ⇒ Il
pannello **funzionava gia' due giorni fa**.

**Cosa resta aperto davvero, e va riaccertato prima di riaprirlo:** se il pannello si vede e
funziona nella app **installata** (non solo sul server di sviluppo), e se fa tutto cio' che la
richiesta originale chiedeva. Questa e' una domanda diversa da quella che avevo scritto, e non ha
ancora una risposta misurata.

*Finita quando: qualcuno la riaccerta nella app installata e scrive cosa ha visto.*

### Corsia 5 · Scrivere cosa fa TALOS, funzione per funzione
**Oggi:** molte funzioni del prodotto **esistono solo nel codice**. Non c'e' un testo che spieghi
cosa fa «accesso completo», cosa cambia fra un motore e l'altro, cosa succede quando si delega.

**Perche' e' qui e non piu' avanti:** e' la fondamenta di TALOS come centro assistenza di se' stesso,
la riga che hai chiamato importantissima. Un prodotto non puo' spiegarsi se non e' scritto da
nessuna parte. E serve anche all'installatore e alla finestra nuova, che devono usare le stesse parole.

**Dopo:** ogni sezione dell'app ha la sua pagina, e nessuna pagina descrive codice che non esiste.

*File: `docs/assistenza/**` · Finita quando: ogni sezione ha la sua pagina e nessuna cita funzioni inesistenti.*

---

# FASE 2 · Scrivere mentre il modello lavora

**A cosa serve:** e' il momento in cui la persona e TALOS si parlano sopra. Tu scrivi mentre lui sta
gia' lavorando, e devi poter scegliere: **accodare** (lo leggera' dopo) o **reindirizzare** (fermalo e
cambia direzione). Oggi questa scelta funziona male, e tu l'hai segnalata **due volte** — l'11
settembre «funziona malissimo» e il 13 «adesso quasi inutilizzabile» — e in mezzo non e' stato fatto
niente.

**Perche' e' la fase piu' delicata:** tocca il file da 20.638 righe, e lo tocca una corsia sola.

### Corsia 1 🔒 · Il bivio accoda/reindirizza, e la freccia su
**Oggi:** quando scrivi durante un giro, il pulsante di reindirizzamento **compare da solo** appena
c'e' del testo, accanto al punto in cui si sceglie «Accoda». Tu volevi accodare e parte un
reindirizzamento. Il registro lo dimostra: nessun evento di coda, un reindirizzamento chiesto e
applicato col tuo testo.

**Cosa si fa prima:** si estrae dal file gigante il gruppo di funzioni che governano questo momento —
il bivio, la coda, il reindirizzo, la cronologia, i tasti del campo di scrittura. Sono **495 righe, il
2,4% del file**, sparse in tre zone, con pochi collegamenti in entrata e solo tre campi di stato
condiviso. E' l'unico taglio che regge: **ho misurato e ho corretto una mia raccomandazione
precedente** — spezzare tutto il file non e' fattibile, non ci sono cuciture e 602 funzioni non si
rifanno in una fase.

**Cosa si fa dopo l'estrazione:** su quella cucitura si sistemano il bivio e la freccia su. La
cronologia col tasto ↑ **esiste gia'**, ma registra solo i comandi che iniziano con il punto
esclamativo. Va estesa ai messaggi normali, tenendo la guardia che prende la freccia solo a campo
vuoto. Tre scelte restano tue: una lista sola o due separate, globale o per sessione, e se il tetto
di 50 voci vada bene.

*File: `legacy/app.js` · Finita quando: si accoda un messaggio dal vivo e NON parte un reindirizzamento; la freccia su ripesca i messaggi.*

#### ⭐ IL METRO DELLA REVIEW — dalla ricerca del 13/09, 22 fonti e otto basi di codice

La ricerca e' rientrata **dopo** che le corsie erano partite, e le corsie di un flusso non si
possono raggiungere mentre lavorano. ⇒ Questi risultati non cambiano il loro lavoro: cambiano il
modo in cui lo giudico. Scritti **prima** di leggere le consegne, cosi' il metro non si adatta a
cio' che e' arrivato. Documento completo: `RICERCA-FASE-2-REINDIRIZZAMENTO-2026-09-13.md`.

⛔ **La prima cosa e' una smentita di una MIA premessa.** Avevo scritto nel brief che il nostro
vantaggio sarebbe stata la ricevuta di consegna, dando per scontato che nessuno la dia. **Meta' e'
gia' nostra**, verificata nel codice con file e riga: la coda emette gia' un evento **dentro**
l’estrazione riuscita, il reindirizzamento ne emette uno all’applicazione vera, e il ciclo
`Richiesto/Applicato/Annullato/Fallito` e' gia' correlato da un identificativo. ⇒ Sull’agente
principale **siamo avanti a Hermes**, che al modello risponde soltanto «accodato».

**Il vantaggio vero si sposta piu' in la', in tre pezzi.** ① La ricevuta dice **in quale giro** il
testo e' stato letto — nessuno dei nove prodotti lo fa. ② Lo stesso contratto vale per i **figli**,
ed e' li' che Hermes e' scoperto. ③ «Non consegnato» diventa un esito **dichiarato con un motivo**,
non un silenzio.

⛔ **Il confine dell’interruzione, e su questo i sette prodotti sono unanimi:** non si uccide mai un
attrezzo a meta' per recapitare un messaggio. Il confine sicuro e' **fra un giro e l’altro** o alla
**fine di un gruppo di attrezzi**; durante la generazione si puo', ma solo buttando il ragionamento
parziale.

⛔ **Due mine gia' pagate da altri, da non ripetere.** Rigiocare nella trascrizione un ragionamento
interrotto a meta' ha reso **quattro sessioni inservibili in modo permanente**, e il difetto si
rigioca a ogni chiamata perche' il punto di ripresa e' avvelenato. E scrivere «sei stato
interrotto» dentro una riga dell’assistente fa si' che il modello la ripeta come sua, replicando
righe fantasma.

⭐ **Una cosa piccola che pero' decide se la funzione serve a qualcosa:** senza un marcatore che si
**autodescrive**, il modello scambia il testo inserito per un’iniezione e **lo rifiuta**. Misurato
da loro, non ipotizzato. Se una consegna non ce l’ha, la funzione sembra fatta e non funziona.

⛔ **Cosa non accetto in una consegna**, perche' la ricerca dimostra che fa danno: una coda
ottimistica del solo lato interfaccia che mostra una promessa come fatto; due messaggi della
persona fusi in uno; un piano di controllo appeso a un riferimento in memoria invece che
all’identificativo durevole della sessione — e' esattamente cosi' che a loro i figli sono diventati
invisibili.

⛔ **Quello che NON sappiamo, e non va riempito:** nessuna delle 22 fonti pubblica una misura in
millisecondi fra il clic e il segno a schermo. Qualunque numero sulla «fluidita'» sarebbe
inventato finche' non lo misuriamo noi.

#### ⭐ TRE PISTE IN PIU', VERIFICATE APRENDO LE PAGINE (13/09, sera)

⛔ **Provenienza, dichiarata perche' cambia quanto ci si puo' fidare.** Le piste vengono
dall'altra sessione, che ha ancora il motore di ricerca. Loro hanno dichiarato di **non aver
aperto le pagine**: erano titoli, indirizzi ed estratti. Le ho aperte io una per una. ⇒ Due
reggono alla lettera, **una va corretta** — ed e' la correzione a valere di piu'.

**① ✅ Il concorrente piu' vicino, quando reindirizza, BUTTA IL LAVORO FATTO.** Verificato:
una richiesta del 26/04/2026, chiusa, dice testualmente che quella modalita' *«immediately aborts
the run, losing partial progress»*, e che i messaggi in coda **non si possono ne' modificare ne'
annullare**.

⇒ **Questo cambia il nostro vantaggio, e in meglio.** Non e' «noi reindirizziamo»: e' **«noi
reindirizziamo senza buttare il giro, e lo diciamo»**. ⭐ E cambia anche la forma della tabella:
la colonna da confrontare non e' «accoda contro reindirizza», e' **«che cosa perdi quando parli
mentre lavora»**.

**② ✅ Chiedono di poter SCEGLIERE, e i modi sono tre, non due.** Una richiesta ancora aperta
del 13/06/2026 chiede accoda, reindirizza **e interrompi** come scelta configurabile. ⛔ E porta
un argomento che ci riguarda in pieno, perche' **noi compattiamo**: se la compattazione tratta un
testo di correzione come **un turno a se'**, il riassunto perde il legame fra la correzione e cio'
che correggeva. ⇒ Un testo inserito a giro vivo non e' un turno nuovo: appartiene al compito in
corso, e la compattazione deve saperlo.

**③ ⛔ LA CORREZIONE: il precedente sulla ricevuta di lettura NON viene da un agente.** La pista
lo dava come «riguarda proprio un agente». La pagina dice un'altra cosa: e' la correzione di un
**canale di messaggistica** dentro quel prodotto. Le spunte di lettura partivano **solo a giro
completo** — modello piu' attrezzi piu' risposta — e sono state spostate al momento in cui il
messaggio viene **ricevuto**.

⇒ Si usa come **precedente per analogia, dichiarato come tale**, non come prova che un agente di
codice lo faccia: «preso in carico» e «usato» sono due istanti diversi, e chi li fonde mente a chi
scrive per tutta la durata del giro. ⭐ E porta il criterio di accettazione che ci mancava: la
ricevuta deve arrivare **nello stesso tempo che impiegherebbe un lettore umano**, indipendentemente
da quanto ci mette l'agente.

⭐ Un dettaglio che l'estratto non dava e che ho visto solo aprendo: quella modifica risulta
**chiusa perche' l'autore aveva raggiunto il tetto di richieste aperte, non perche' sia stata
respinta**. Citarla come idea bocciata sarebbe stato falso.

**④ Sulla latenza, la formulazione giusta e' «NON PUBBLICATA», non «non trovata»:** sono due cose
diverse e la seconda sembra pigrizia. ⭐ E la cosa piu' utile e' che il vocabolario per misurare
un'interruzione **esiste gia', ma e' nato nel mondo della voce**, dove il trattamento
dell'interruzione e' una metrica **separata** dal primo suono e dall'attesa degli attrezzi.
Nessuno l'ha portato negli agenti di codice: e' una lacuna del campo, e un argomento a nostro
favore.

### Corsia 2 · Reindirizzare produce una carta rossa che da' la colpa a te
**Oggi:** reindirizzi e ricevi «si e' interrotto per un errore… apri Doctor». Non e' successo niente
di male: hai solo cambiato direzione.

**Tre difetti distinti, tutti letti nel codice:** primo, un reindirizzamento non e' un guasto e non
va trattato come tale. Secondo, il riconoscitore degli errori cerca parole **inglesi**, mentre il
motore scrive «interrotto su richiesta» **in italiano**: non si riconoscono, quindi tutto finisce nel
sacco degli errori. Terzo, e il piu' importante, **l'evento non porta la propria provenienza**: dal
registro non si puo' sapere quale comando l'ha scatenato, e questo ci ha fatto perdere tempo oggi.

**Dopo:** reindirizzare non produce nessuna carta rossa, e ogni evento dice da dove viene.

*File: `components/errori.js` ed eventi del motore · Finita quando: reindirizzare e' pulito, e dal registro si legge quale comando ha generato l'evento.*

### Corsia 3 · La delega ai sotto-agenti non funziona
**Oggi:** deleghi un lavoro a un sotto-agente e la scheda «Agenti» resta vuota. Peggio: il percorso
che gli viene passato e' scritto nella forma di un altro sistema operativo, quindi la shell del
figlio prova a entrare in una cartella che su Windows non esiste. Tre deleghe su tre fallite.

**Dopo:** tre deleghe su tre riescono, e la scheda mostra la conversazione del figlio.

*File: `agent-service.mjs` e la catena di delega · Finita quando: tre deleghe su tre riescono e la scheda si popola.*

### Corsia 4 · Le guardie svuotate dal rifacimento dell'interfaccia
**Oggi:** ci sono prove il cui nome e il cui commento promettono di verificare una cosa, ma la loro
asserzione non morde piu': l'interfaccia e' cambiata sotto e la prova e' stata adattata perdendo il
senso. **Sono verdi mentre il difetto passa.** Ne abbiamo trovata una oggi, e la lane mobile ne ha
trovate altre.

**Il metodo, che e' la parte che conta:** ogni guardia sospetta si prova **nel verso in cui deve
fallire**. Non basta vedere che passa: bisogna romperle apposta la premessa e verificare che protesti.

**Dopo:** ogni guardia sospetta e' stata provata al contrario, e ognuna dichiara su quante cose ha
guardato — perche' un cancello che misura un insieme vuoto dice «tutto bene», non «non lo so».

*File: `tests/**` · Finita quando: ogni guardia sospetta e' stata provata nel verso che deve fallire.*

### Corsia 5 · Il modello non puo' modificare un file
**Oggi:** la funzione di modifica esiste nel prodotto, ma il modello non ha l'attrezzo per usarla.
Quindi puo' creare e leggere, non correggere. Per cambiare una riga deve riscrivere tutto il file.

**Dopo:** il modello modifica un file esistente in un giro vero.

*File: `src/kernel/` · Finita quando: un giro vero modifica un file esistente senza riscriverlo.*

---

# FASE 3 · Fare le cose in blocco, dal server fino al pulsante

**A cosa serve:** oggi per cancellare 214 file servono **214 richieste**, una per file. L'hai visto
dall'app: il modello le ha fatte davvero, una dopo l'altra. Questa fase chiude il buco dalle
fondamenta fino al pulsante.

⛔ **L'ordine dentro la fase conta piu' del solito.** Prima la meta' server, poi la selezione che la
usa. Invertirle produrrebbe un pulsante che fa esattamente cio' che oggi fa l'agente: 214 chiamate,
solo lanciate da te invece che da lui.

### Corsia 1 🔒 · Selezionare tante cose insieme, in tutte le sezioni
**Oggi:** nelle sezioni con un elenco — Libreria, Note, Attivita', Memoria, Ricerca, Progetti, Board
— si agisce su una voce alla volta.

**Come va fatto:** **una volta sola**, come comportamento condiviso di tutte le liste, non copiato
sette volte. Se si copia, fra un mese le sette copie si saranno gia' separate e ognuna avra' il suo
difetto.

**Dopo:** selezioni 214 file e li cancelli con **una** richiesta.

*File: `legacy/app.js` e i componenti delle liste · Finita quando: 214 file si cancellano con una richiesta sola.*

### Corsia 2 · Il server accetta una lista, non un file per volta
**Oggi:** le rotte accettano un identificativo alla volta. Sono **sette famiglie** di rotte con la
stessa forma.

**Cosa serve, e non e' banale:** accettare una lista con un **tetto dichiarato** (non infinita), e
rispondere con un **esito per ogni voce**, non un successo o un fallimento globale. Se cancelli 214
file e tre non esistono piu', devi sapere quali tre — non ricevere un errore che butta via tutto.

**Dopo:** una lista mista di identificativi validi e non validi torna un esito per ciascuno.

*File: `src/http-app.mjs` · Finita quando: una lista mista torna un esito per voce.*

### Corsia 3 · I quindici attrezzi che sfogliano, tutti con lo stesso contratto
**Oggi:** ho censito **15 attrezzi** e **7 famiglie di rotte** che hanno la stessa forma di quella
della Libreria. Cioe' il difetto del «ciao che sfoglia 11 pagine» non e' della Libreria: e' della
forma di tutto il prodotto. Curarne uno solo lascia in piedi gli altri quattordici.

**Dopo:** nessun attrezzo dice piu' al modello «segui il segnalibro finche' non e' vuoto».

*File: `src/kernel/` · Finita quando: i quindici attrezzi condividono un contratto solo.*

### Corsia 4 · Rimettere in sesto i cancelli che oggi non guardano niente
Tre cose diverse, tutte della stessa famiglia — **un controllo piu' debole del proprio nome**:

- **Quattro prove rosse** nello script che prepara la copia pubblica. Provano il riordino iniziale
  su una copia gia' riordinata, cioe' una condizione che non tornera' mai. Vanno **rifatte**, non
  indebolite: sono le prove che proteggono la pubblicazione.
- **Il cancello che misura un insieme vuoto.** Trovato dalla lane mobile: due suoi controlli erano
  verdi perche' non avevano niente da guardare. Dopo aver scritto un cancello la domanda non e'
  «passa?», e' «su quante cose ha guardato?».
- **Le misure che decidono se pubblicare** vanno prese sull'**albero intero**, con le cancellazioni
  fuori dal proprio perimetro a zero come cancello che si pianta, non come numero da leggere. Oggi
  290.000 righe cancellate sono passate sotto tre controlli che dicevano «sano».

*File: `scripts/tests/**` · Finita quando: le quattro prove sono rifatte e ogni cancello dichiara quante cose ha guardato.*

### Corsia 5 · Il corpo del centro assistenza
**Oggi:** se chiedi a TALOS «cosa fa accesso completo?» ti risponde a braccio, come farebbe con
qualunque argomento.

**Dopo:** risponde con la documentazione vera, **citando la fonte**, e sa dire cosa e' TALOS: il
repository, la licenza, la versione. E quando la domanda esce dalla copertura risponde «non lo so»
invece di inventare — che e' la meta' piu' importante.

*File: `docs/**` e la rotta dell'assistenza · Finita quando: una domanda vera riceve una risposta con citazione, e una fuori copertura riceve «non lo so».*

---

# FASE 3-bis · MODALITA' WORKFLOW — i «Piani di lavoro»

**A cosa serve:** oggi TALOS sa delegare **un** compito a **una** figlia, e il padre si ferma ad
aspettarla. Non sa dividere un lavoro in cinque lavorazioni parallele, non sa impedire che due figlie
scrivano lo stesso file, e se chiudi la app il lavoro in corso e' perso. ⇒ Questa fase mette nel
prodotto **il mestiere che oggi fa una persona**: dividere le corsie, controllare che i file non si
sovrappongano, leggere le consegne.

**Da dove viene il disegno.** Ricerca del 13/09 su quattro sistemi: la documentazione ufficiale dei
sotto-agenti di Claude Code, recuperata per indirizzo diretto; Hermes e Codex **letti nel codice** a
commit fissato nel dossier concorrenti del 03/09; e soprattutto **Paperclip**, che l'owner aveva
gia' chiesto il 31/07 e che era stato riletto col repository clonato il 29/08.

⛔ **Onesta' sulla fonte:** il budget di ricerca web della sessione era esaurito (200 su 200), quindi
non c'e' stata una ricerca nuova sul motore di ricerca. Le fonti sono quelle sopra: una documentazione
ufficiale presa per indirizzo, due letture di codice a commit fissato, e un repository clonato. Sono
piu' solide di una ricerca, non meno — ma vanno rinfrescate quando la fase si apre, perche' in questo
settore due settimane sono lunghe.

**Che cosa si prende da Paperclip:** i **contratti di esecuzione**, non il prodotto. Checkout atomico
a due lucchetti, contratto di liveness, decomposizione esatta-una-volta, recupero a tre livelli, e i
due guardiani distinti — «un sottoalbero fermo» non e' «un processo vivo ma silenzioso», ed e' la
stessa confusione che in questo progetto ha gia' quasi ucciso una sessione viva dell'owner.

**Le quattro decisioni dell'owner, 13/09:**

| domanda | decisione |
|---|---|
| chi scrive il piano | il **modello lo propone**, l'owner approva prima che parta |
| il freno alla spesa | **budget opzionale, spento di serie** |
| collisioni fra agenti | **prenotazione dei file dentro il piano**, intersezioni vuote |
| sopravvive alla chiusura | **si'**, riprende dal punto in cui era |

⭐ **Cosa esiste gia', verificato nel codice e non ricordato:** la delega a una figlia e' matura, la
verifica che una figlia non menta sul proprio successo pure, la scheda «Agenti» funziona ed e' usata,
e la Ricerca approfondita ha **gia'** approvazione del piano, giornale a sola aggiunta e ripresa
automatica dopo un riavvio. Mancano tre cose sole: aprire piu' figlie in un colpo, la coda quando la
concorrenza e' satura, e la prenotazione dei file. ⇒ Il workflow e' il **terzo specchio** dichiarato
di un impianto che esiste, non un sistema nuovo.

| corsia | riga | cosa fa | file | finita quando |
|---|---|---|---|---|
| 1 | **WF-1** | il piano e' un oggetto: fasi in sequenza, dentro ogni fase lavorazioni in parallelo, ognuna dichiara **i file che tocca**. ⛔ Due lavorazioni della stessa fase sullo stesso file ⇒ **piano respinto prima di partire**, non fermato a meta' | `src/piano-di-lavoro.mjs` (nuovo) | un piano con file sovrapposti e' respinto **prima** di aprire una figlia, e uno con file disgiunti passa |
| 2 | **WF-3** | il motore: apre tutte le lavorazioni della fase **senza aspettarle una a una**, e quando il tetto di dieci figli e' pieno la undicesima **si accoda** invece di essere respinta (oggi rifiuta e basta) | `src/workflow-orchestrator.mjs` (nuovo) | undici lavorazioni con tetto dieci: la undicesima parte quando si libera un posto |
| 3 | **WF-2 + WF-5** | l'attrezzo con cui il modello **propone** un piano senza eseguirlo, e il budget **opzionale** che, se acceso, vale sull'albero intero (padre piu' figlie) | `src/kernel/talosHarness.mjs` | il modello propone e non esegue; col budget acceso un piano troppo grande e' respinto prima di partire, con quello spento lo stesso piano parte |
| 4 | **WF-4** | la ripresa dopo la chiusura, col **doppio lucchetto**: chi ha il **diritto** di eseguire una lavorazione e quale esecuzione e' **viva adesso** sono due campi distinti, perche' due riprese non prendano la stessa lavorazione | `src/session-registry.mjs`, `src/agent-service.mjs`, rotte in `src/http-app.mjs` | piano interrotto a meta', server riavviato, riprende dalla lavorazione non conclusa e non rifa' quelle finite; due riprese insieme, una sola prende |
| 5 | **WF-6 + WF-7** | a schermo dentro la scheda **Agenti che esiste gia'**, mai una sezione nuova; e nessuna lavorazione ferma in silenzio: per ognuna non conclusa il sistema deve saper dire **che cosa la fa avanzare adesso** | `frontend/src/components/inspector.js` | un piano a due fasi si vede partire, avanzare e concludersi nei due temi; una figlia che smette di rispondere compare come **ferma con un motivo**, non «in corso» per sempre |

⛔ **Perche' proprio qui e non prima:** un piano che apre cinque figlie sopra attrezzi che sfogliano
da soli moltiplicherebbe **per cinque** il difetto della Fase 1. Prima il contratto degli attrezzi,
poi l'orchestrazione.

⛔ **Cosa NON si copia:** l'organigramma aziendale di Paperclip (multi-azienda, permessi,
fatturazione: qui c'e' una persona sola); le stanze dove gli agenti di Hermes si parlano fra loro
(e' un social di robot, non un banco di lavoro); e il **programma che il modello scrive ed esegue da
solo** (la forma di Codex e OpenClaw), che e' la piu' potente e quella dove gli altri hanno avuto
cicli di creazione aperti. ⇒ Qui il piano e' **dati approvabili**, non codice eseguibile.

⛔ **Il nome a schermo e' «Piani di lavoro», mai «workflow»:** niente nomi tecnici nella interfaccia.

---

## ⭐ Cosa arriva SUBITO DOPO, e che questa fase esiste per rendere possibile

**PO-25 — il pulsante «+» come pannello delle azioni, e le procedure guidate** (owner 13/09,
con quattro schermate del mobile; lui la chiama «piu' un end game che altro»).

Sul mobile il «+» apre un foglio **«Cosa vuoi fare?»** con una ricerca e quattro categorie:
Allega, Crea, Strumenti, Agente. ⛔ Il difetto e' scritto nelle schermate stesse: tre voci di
**Crea** hanno come sottotitolo, testualmente, **«Precompila il messaggio»**. Cioe' oggi quel
pulsante **scrive testo nel composer** e si ferma li'.

L'owner lo vuole **versatile**: «Crea una presentazione» deve far partire **una procedura
guidata a passi**, come la modalita' piano — e lo stesso per **creare un sito web**, chiedendo
linguaggio, framework, obiettivo e stack.

⇒ **E' esattamente questa fase, con un modulo davanti.** Una procedura guidata e' un piano di
lavoro che parte da un modello invece che dal foglio bianco: stesso motore, stessa approvazione,
stessa ripresa. ⛔ Per questo la riga **non si apre prima**: senza il motore, «guidata»
diventerebbe una finestrella che alla fine incolla un testo nel composer — il difetto di oggi
con piu' passaggi.

⛔ **Non ho ancora misurato cosa esiste sul desktop dietro al «+»**, e non lo deduco dalle foto
del mobile. Va accertato nel codice quando la riga si apre. Scheda completa: **PO-25**.

---

# FASE 4 · Il motore locale piu' rapido dei concorrenti

**A cosa serve:** e' la riga che hai messo a priorita' 1 il 12 settembre — «rendere il motore di
modelli locali estremamente rapido e meglio dei competitor». **Il codice e' atterrato**, la verifica
dal vivo e il confronto no, ed erano il cuore della richiesta.

**Il numero da battere, gia' misurato:** PocketPal risponde in **351 millisecondi** con 25 token di
sistema; noi stiamo a **33,9 secondi** con un modello e **3,1 secondi** con un altro, ma con **2.877**
token di sistema. In generazione siamo **2,2 volte piu' veloci di loro**. ⛔ Il confronto vale solo a
parita' di richiesta: eguagliarli spegnendo l'agente non e' vincere, e' cambiare prodotto.

### Corsia 1 · Verificare dal vivo cio' che e' stato scritto
Il codice atterrato decide la dimensione della memoria di lavoro leggendo i parametri del modello, e
usa una tecnica che indovina in anticipo le parole ripetute. **Nessuno dei due e' stato misurato su
un dispositivo vero.**

*Finita quando: i numeri vengono da una misura sul dispositivo, non da una stima.*

### Corsia 2 · Il confronto vero coi concorrenti
Misurare noi e loro **sulla stessa richiesta**, non sulla richiesta che ci conviene.

*Finita quando: il primo token arriva sotto il secondo con l'agente acceso, oppure il numero vero e' dichiarato per quello che e'.*

### Corsia 3 · Col modello piu' piccolo il secondo turno si interrompe
**Oggi:** usi un modello molto piccolo, lui chiama un attrezzo, e al turno successivo si ferma. La
causa e' nota: il motore **non legge il campo che dice perche' la risposta e' finita**, quindi non
distingue «ho finito» da «mi hanno troncato».

*File: `src/kernel/` · Finita quando: il secondo turno completa anche col modello piu' piccolo.*

### Corsia 4 · Codici di errore sbagliati
**Oggi:** il server risponde «servizio non disponibile» o «errore interno» in casi che sono
semplicemente richieste malformate. Chi legge il registro cerca un guasto che non c'e'.

*File: `src/http-app.mjs` · Finita quando: ogni codice e' provato nel verso che lo genera.*

### Corsia 5 🔒 · Tre difetti dell'interfaccia che si contraddicono a vicenda
- **Un errore vero perde per strada il suo motivo e la sua azione**: ti dice che qualcosa e' andato
  storto, non cosa ne' come rimediare.
- **Il server cade e per un minuto l'app dice due cose opposte**: la barra di stato dichiara la
  caduta, la chat continua come se niente fosse.
- **Il suggerimento del campo di scrittura sopravvive alla sessione che l'ha generato**: cambi
  sessione e ti ritrovi il suggerimento di quella prima.

*File: `legacy/app.js` · Finita quando: i tre sono riprodotti e chiusi, ognuno con la sua fotografia.*

---

# FASE 5 · La lingua, le etichette e i numeri

**A cosa serve:** oggi l'app e' bilingue per sbaglio. Hai un README in inglese che mostra una
fotografia di un'interfaccia in italiano, e dentro l'app hai pulsanti inglesi in mezzo a testo
italiano.

**Il fatto misurato, da due osservazioni indipendenti:** nella pagina costruita **sei sole etichette**
sono traducibili. Tutto il resto — barra laterale e pannello destro — e' testo italiano scritto a
mano dentro il codice. ⇒ Finche' e' cosi', **una schermata inglese non esiste**, e non e' che qualcuno
si e' dimenticato di tradurre: non c'e' proprio il meccanismo.

### Corsia 1 🔒 · La traduzione copre tutta l'app
Oggi copre la sola barra laterale. Vanno inclusi anche i sei pulsanti che oggi restano in inglese
dentro un'interfaccia italiana: Agents, Hooks, Skills, Plugins, MCP.

*File: `legacy/app.js` · Finita quando: cambiando lingua cambia tutta la pagina, provato nei due versi.*

#### E nello stesso giro: **togliere i temi Paper, Claudius e Basicus** (owner 13/09)

Parole sue: «rimuovere temi basicus claudius e paper definitivamente dalla app, motivo: non mi
piacciono». Non c'e' niente da discutere: e' il suo prodotto e il gusto e' una ragione sufficiente.
Sta qui e non in una corsia sua perche' tocca **lo stesso file grande** della traduzione, e su quel
file lavora un agente solo per volta.

**Misurato il 13/09, non ricordato.** I temi oggi sono **quattordici**, e il loro elenco e'
scritto in **due posti** che devono restare allineati. Ogni tema vive in **otto posti**: i due
elenchi, il blocco dei colori, le regole in piu' del foglio finale, l'etichetta che si legge a
schermo, una scena animata dentro un elenco **parallelo per posizione** (verificato, non supposto: quattordici temi e quattordici scene, stesso ordine esatto), e la descrizione lunga
con le sue voci tradotte. Chi ne dimentica uno lascia un tema a meta'.

⛔ **Due conseguenze che vanno messe davanti all'owner prima di eseguire, non dopo.** La prima: i
temi **chiari** oggi sono quattro, e tre dei quattro sono proprio questi ⇒ dopo la rimozione ne
resta **uno solo**, e chi usa la app in chiaro non ha piu' scelta. La seconda: chi ha gia'
salvato uno dei tre se lo ritrova nelle preferenze, e senza una migrazione resterebbe con un tema
**che non esiste piu'** — la stessa famiglia del difetto gia' visto qui, un valore salvato che
nessun percorso puo' piu' produrre.

*File: i sette posti dei temi, in testa `legacy/app.js` e `avvio.js` · Finita quando: i tre nomi
non compaiono piu' in nessuno dei sette, le scene sono undici e la app non protesta all'avvio, e
un profilo che aveva uno dei tre viene portato su un tema vivo. Provato anche al contrario.*

Scheda completa: **PO-22** nella coda delle proposte.

### Corsia 2 · Un solo posto per i nomi umani
**Oggi:** a schermo compaiono nomi tecnici. ⛔ **Vincolo assoluto:** i nomi che riceve il **modello**
non si toccano mai — sono il contratto col motore. Si traduce solo cio' che legge la persona, e la
mappa fra i due sta in **un posto solo**.

*Finita quando: zero nomi tecnici a schermo e contratto del motore invariato.*

### Corsia 3 · Numeri che non tornano
**Oggi:** nella stessa schermata compaiono **tre numerazioni diverse dello stesso giro**, e il cursore
del ragionamento promette **sei livelli** mentre il modello ne ha **tre**. Cioe' l'interfaccia offre
scelte che non esistono.

*Finita quando: un solo numero di giro, e il cursore mostra i livelli veri.*

### Corsia 4 · Frasi del mockup e identificativi grezzi rimasti a schermo
**Oggi:** in alcuni punti si leggono identificativi tecnici e frasi rimaste dal disegno preparatorio.
E una ricerca senza risultati mostra una lista vuota con il contatore fermo, senza dire che non ha
trovato niente.

*Finita quando: nessuna stringa del mockup sopravvive, e il vuoto e' dichiarato a parole.*

### Corsia 5 · Le fotografie del README
Le foto della nuova interfaccia, **in inglese**, ognuna col tuo si' esplicito, una per una — come hai
chiesto e come e' gia' successo tre volte che io dicessi «eccellente» e tu la bocciassi a colpo
d'occhio.

*File: `README.md`, `docs/immagini/` · Finita quando: ogni foto e' approvata per nome nel manifesto.*

---

# FASE 6 · Le sezioni con un elenco

**A cosa serve:** sono i difetti trovati provando l'app sezione per sezione l'11 settembre, verificati
e mai ripresi. Nessuno e' drammatico da solo; insieme fanno sembrare il prodotto sciatto.

⛔ **Prima di aprire questa fase, ogni riga va riaccertata nel codice.** Sono dichiarazioni di due
giorni fa: la coda dice cosa qualcuno credeva, il codice dice cosa c'e'.

### Corsia 1 🔒 · Libreria, Memoria e Attivita'
- **Libreria:** scrive sempre «0 file · Token non disponibili», anche quando i file ci sono.
- **Memoria:** e' divisa per **genere** invece che per **strato**, cioe' per una classificazione che
  non corrisponde a come la memoria funziona davvero.
- **Attivita':** ha i filtri, ma nessuna riga dice **chi** ha fatto la cosa.

*File: `legacy/app.js` e le sezioni · Finita quando: ogni sezione mostra il numero vero e l'autore vero.*

### Corsia 2 · Sul tuo messaggio non puoi fare niente
Non c'e' nessuna azione sul proprio messaggio, e non lo si puo' modificare. In ogni altro prodotto
della categoria si puo'.

*Finita quando: si modifica un proprio messaggio e la sessione lo conserva.*

### Corsia 3 · Il rapporto e le fonti della ricerca non si aprono
La ricerca approfondita produce un rapporto e un elenco di fonti, e dall'interfaccia non si
consultano.

*Finita quando: rapporto e fonti si aprono da una ricerca vera.*

### Corsia 4 · La prima sessione di chi apre l'app per la prima volta
Modale a due colonne invece che una, progetti senza conteggio, una voce «Planner opzionale» rimasta
li' da un'altra epoca, e manca la riga col totale degli attrezzi e il costo per giro.

⛔ **Si prova da profilo vergine.** Le tue preferenze salvate nascondono esattamente cio' che vede
una persona nuova — ci e' gia' successo.

*Finita quando: provata da profilo vergine, non dalle preferenze salvate.*


#### ⛔ E soprattutto: **rifare la modale del primo avvio** (owner 13/09)

Parole sue: «ora come ora fa cagare al cazzo… deve seguire le linee guida delle modali intro
moderne 2026, ui super smooth e setup veloce e rapido». ⛔ E' la prima cosa che vede chiunque
apra TALOS, e da oggi l'installatore e' pubblico: quella schermata la incontrano persone che
non siamo noi.

**Cosa c'e' oggi, misurato:** un componente di **296 righe** con **quattro passi** (cartella,
modello, permessi, pronto). Non e' uno scheletro: legge le cartelle vere, i fornitori, i modelli,
e quando un elenco non arriva lo **dice** invece di inventare. ⭐ E porta gia' dentro una ricerca
del 06/09 — portare al primo valore nel minor numero di passi, e poter **saltare** — che va usata,
non rifatta.

⛔ **Due cose morte attaccate alla stessa superficie:** la vecchia modale, **176 righe** che
nessuno chiama, e un commento che rimanda a una funzione **che non esiste**. Vanno via nello
stesso giro, o chi rifa' trova due versioni e non sa quale sia viva.

⛔ **Prima di disegnare serve la ricerca** sulle linee guida 2026, e oggi **non si puo' fare**:
il budget di ricerca web della sessione e' esaurito. Non va spacciata per fatta: e' il primo
passo di chi apre questa riga, con fonte e data.

*File: `frontend/src/components/intro.js` e la pulizia in `legacy/app.js` · Finita quando: provata
da **profilo vergine**, con contati i passi e i secondi che servono a una persona nuova per
arrivare al primo messaggio utile; provata anche saltando tutto; foto nei due temi e alle due
larghezze; e nessun commento che rimandi a funzioni inesistenti.*

Scheda completa: **PO-24** nella coda delle proposte.
### Corsia 5 · I permessi mostrano 5 attrezzi su 43
**Oggi:** il foglio dei permessi elenca **cinque** attrezzi. Gli attrezzi sono **43**. Cioe' per 38 di
essi non esiste un permesso per attrezzo: sono governati solo dalle regole generali. Chi guarda quel
foglio crede di avere il controllo e non ce l'ha.

Nella stessa corsia: il percorso sbagliato che fa fallire le deleghe, se non e' gia' chiuso in Fase 2.

*File: `config.mjs` e la catena di delega · Finita quando: il foglio elenca 43 attrezzi.*

---

# FASE 7 · L'installatore con una vera interfaccia

**A cosa serve:** oggi l'installatore e' un colpo solo — doppio clic e finisce, senza dire niente e
senza chiedere niente. Tu vuoi quello che fa Hermes: un'installazione con le sue schermate e il passo
del **consenso**.

⛔ **Vincolo gia' misurato, e cambia il piano:** il tipo di installatore che usiamo oggi **non puo'
ospitare pagine**. Non e' questione di scriverle: va sostituito con quello assistito. Per questo e'
una fase sua e non una corsia dentro un'altra.

⛔ **I lavori di disegno non si fanno in parallelo**: installatore, finestra e centro assistenza
condividono superfici e parole. Uno per fase. Le altre quattro corsie di questa fase sono quindi
lavoro di pulizia, che non si pesta i piedi col disegno.

### Corsia 1 · L'installatore assistito col consenso
*File: `desktop/` · Finita quando: un'installazione vera dal vivo, col consenso che blocca davvero se rifiutato.*

#### E nello stesso giro: **l’icona del desktop su un fondo pieno** (owner 13/09, con foto)

Parole sue: «mettere icona dietro un bg, direi di prendere tale e quale icona della app mobile».
Sta qui perche' l’icona la **spedisce l’installatore**, ed e' la stessa cartella.

⛔ **La causa vera di cio' che si vede nella foto, misurata.** Nella foto l’icona e' un contorno
sottile che sparisce sullo sfondo rosso. Non e' solo gusto: **il file contiene due sole misure**,
256 e 32 pixel. Windows per il collegamento sul Desktop usa la **48**, che li' dentro **non c'e'**,
quindi se la fabbrica rimpicciolendo quella grande — e un disegno a filo, ridotto cosi', si sfarina.

⇒ Sono **due meta'**, e farne una sola non basta: il **fondo pieno**, che e' quello che l’owner ha
chiesto, e **le misure mancanti**, senza cui anche un’icona col fondo resterebbe sgranata a 48.

⭐ **La proposta dell’owner regge, e l’ho verificata nel codice del mobile.** Quell’icona e' a **due
strati** dichiarati separatamente — un fondo pieno e un disegno — cioe' ha gia' esattamente cio' che
manca qui; e il disegno e' **vettoriale**, quindi si ridisegna pulito a qualunque misura. ⛔ Ma non
si copia il file: quella di Android e' fatta per essere **ritagliata dal telefono** dentro un cerchio
e ha margini di sicurezza suoi, che su Windows darebbero un’icona sbilanciata. Si prendono i due
strati e si ridisegna. ⭐ E un generatore esiste gia', produce quindici icone una per tema.

**Due scelte restano all’owner:** una icona sola o una per tema (su Windows un collegamento gia'
creato non si aggiorna da solo, quindi la via semplice e' una sola); e quale fondo, da guardare su
sfondo chiaro **e** scuro prima di dire che va bene.

*File: `harness-ui/desktop/assets/` e il generatore in `mobile/tools/android-assets/` · Finita
quando: il file contiene **tutte** le misure di Windows, contate aprendolo e non fidandosi del
programma che l'ha scritto; e la foto del collegamento sul Desktop vero regge su sfondo chiaro e
scuro, e a 16 pixel.*

Scheda completa: **PO-23** nella coda delle proposte.

### Corsia 2 · Un cancello che esiste e non gira mai
Il comando che dovrebbe lanciare **tutte** le verifiche non invoca quella dell'interfaccia. Esiste,
e' scritta, e non e' mai stata eseguita da quel comando.

*Finita quando: il comando la invoca, provato nel verso che deve fallire.*

### Corsia 3 · Codice morto, misurato
Una funzione di circa **180 righe senza nessun chiamante**, uno **schermo intero** di disegno
irraggiungibile, **12 veli** che nessun codice apre, due coppie di funzioni che fanno lo stesso
lavoro, cartelle di librerie esterne che nessuno carica.

*Finita quando: rimosso o ricollegato, dicendo quante righe.*

### Corsia 4 · La costruzione copia nel posto sbagliato
Lo script copia la cartella pubblica dentro una cartella che il repository ignora. O la copia serve e
va altrove, o non serve e va tolta.

### Corsia 5 · Accessibilita': in tutta l'app non c'e' una trappola del fuoco
Apri una finestra modale e con il tasto di tabulazione esci dalla modale e finisci sotto, nella
pagina che sta dietro. Non c'e' nessun meccanismo che tenga il fuoco dentro, in nessun punto
dell'app.

*Finita quando: il fuoco resta dentro una modale aperta, provato da tastiera.*

---

# FASE 8 · La finestra dell'app come interfaccia

**A cosa serve:** rifare la finestra desktop perche' sia un'applicazione vera e non un browser
travestito, col riferimento visivo di Hermes che hai mandato.

⛔ **La regola che vale su tutta la fase:** una interfaccia nuova **non nasconde funzioni che oggi
esistono**. E' gia' successo: la barra laterale rifatta aveva perso l'officina degli attrezzi. Prima
di rifare una vista si scrive l'elenco di cosa fa oggi, e ogni voce si ritrova nella nuova o si segna
come scelta tua.

### Corsia 1 🔒 · La finestra
*File: guscio e `legacy/app.js` · Finita quando: c'e' l'inventario prima e dopo, e nessuna funzione e' sparita.*

### Corsia 2 · I segreti che viaggiano dove non dovrebbero
**Oggi:** il gettone di accesso al servizio e la chiave privata di firma finiscono **nell'ambiente
del processo** che esegue i comandi. Cioe' qualunque comando lanciato puo' leggerli. La chiave delle
ricevute arriva li' da un file di configurazione, e da li' a ogni processo figlio.

*Finita quando: nessun segreto nell'ambiente di un figlio, provato leggendolo davvero.*

### Corsia 3 · Il terminale
Tre difetti dello stesso pezzo: l'uscita di un comando arriva **tutta insieme alla fine** invece che
mentre scorre; i due flussi di uscita sono **fusi e riordinati**, quindi l'ordine che leggi non e'
quello vero; e il comando diretto col punto esclamativo **non funziona mentre il modello lavora**,
che e' proprio quando serve.

### Corsia 4 · Dove gira davvero un tuo comando, e la copia del motore
I tuoi comandi girano dentro il sottosistema Linux, non su Windows — e questo non e' dichiarato da
nessuna parte, quindi i percorsi si comportano in modo sorprendente. Nella stessa area, il motore li'
presente e' una **copia**, e ha difetti suoi.

### Corsia 5 · Il segnavia che non si muove sul tuo Chrome
Il difetto che hai chiamato «rompicoglioni». ⛔ Va misurato **nel tuo browser con l'accelerazione
accesa**, non in quello senza finestra: abbiamo gia' scoperto che li' i numeri non dicono niente sul
tuo schermo.

---

# FASE 9 · Le righe che erano date per chiuse e non lo sono

**A cosa serve:** sono cinque cose che qualcuno — me compreso — ha dichiarato fatte. Riaccertandole
sono risultate a meta'. Questa fase le porta a termine davvero.

### Corsia 1 · Gli accessi ai fornitori
Un fornitore e' collegato **a meta'**: manca il giro vero che dimostri che funziona. **ChatGPT e
Claude sono a zero** — non c'e' proprio il codice, la ricerca nel repository non trova niente.

*Finita quando: un giro vero per ciascuno, coi limiti dimostrati.*

### Corsia 2 · La compattazione del contesto — ⛔ serve una tua decisione
Il codice e' fatto e provato. Ma sul server di prova la funzione e' **vietata per costruzione**: la
configurazione proibisce il motore del contesto su quella porta. ⛔ Togliere quel divieto significa
togliere una guardia scritta apposta, quindi **non lo faccio senza che tu lo dica**. E' l'unica riga
della tabella che aspetta te e non un agente.

### Corsia 3 · Le misure che la compattazione doveva portare
Il motore c'e', le **misure no**, ed erano il requisito: confronto acceso/spento, latenza (misurata
una sola volta: **61,2 secondi** al primo token, fuori bersaglio), quanto la cache viene davvero
riusata (il 40% che gira oggi e' un valore finto messo per la prova), costi prima e dopo, un ritorno
indietro **eseguito** e non solo previsto, e l'annullamento mentre la risposta scorre.

### Corsia 4 · I fornitori aggiuntivi, l'agente esterno, GitHub
Tre righe arrivate il 12 settembre: altri fornitori di modelli, la delega a un agente esterno da riga
di comando, e il collegamento a GitHub.

### Corsia 5 · Il registro dei numeri
I numeri delle proposte si assegnano in **due documenti diversi senza un registro unico**. Oggi questo
ha prodotto una collisione: tre proposte nuove avevano numeri gia' usati, e ho dovuto rinumerarle.
Finche' resta cosi', succedera' ancora.

---

# FASE 10 · Le grandi mai iniziate

**A cosa serve:** metterle in fila onestamente. Nessuna di queste e' cominciata, e dichiararlo vale
piu' che tenerle in una lista che sembra in corso.

- **Il controllo del computer dentro TALOS.** Ricognizione di quello che c'e' davanti e dietro,
  confronto coi concorrenti, prove sul sistema vero e possibilita' di tornare indietro. Mai iniziata.
- **I comandi dell'agente dentro il Terminale.** Decisione tua gia' presa l'11 settembre, mai aperta.
- **La voce a due vie nell'API.** L'hai definita «non urgente ma interessantissima».
- **Lo spazio su disco:** la cartella dei progetti e uno scratchpad da diversi giga. Non urgente.
- **Le intestazioni di licenza nei sorgenti.** Assegnata ad Astra dal 19 settembre, quando tornano
  i crediti.

---

# FASE 11 · Portare nel mobile cio' che il desktop ha gia'

**A cosa serve:** l'hai chiesto il 12 settembre — analisi **in sola lettura** dell'harness desktop e
porting nel mobile di tutto cio' che manca, «estremamente dettagliata e delicata». Il piano esiste gia'
in un documento dedicato.

⛔ **Non parte prima del rilascio**, e il metodo va confermato da te prima di aprirla.

---

# ⛔ COME SI ESEGUONO — la regola che hai dato il 13 settembre

- **Cinque agenti per FASE**, non per sessione. Solo Opus 5, solo sforzo alto. Chiusa una fase —
  consegne riviste, fuse e provate — la successiva ha di nuovo cinque.
- **Il cinque e' un vincolo di progettazione, non un tetto da riempire.** Se ne servono sei, la fase
  e' tagliata male e va rifatta; se ne bastano due, se ne avviano due.
- **Le intersezioni di file devono essere vuote.** La corsia 🔒 e' l'unica che tocca il file grande.
- **Io resto orchestratore, coordinatore e revisore.** Nessuna consegna entra senza la mia lettura, i
  cancelli rifatti da me e la prova dal vivo nei due temi. Commit, fusioni, costruzione, giri veri,
  fotografie e richiesta di push restano miei.
- ⛔ **Prima di aprire una fase, lo stato di ogni riga si riaccerta nel codice.** Oggi e' costato
  crediti veri: due righe erano marcate «in lavorazione» ed erano chiuse da un commit.

---

# ✅ REGISTRO DEGLI OBSOLETI

Questa e' la meta' della tua richiesta che non sta nelle fasi: **fissare cio' che e' chiuso**, perche'
un documento che dichiara aperto un lavoro gia' fatto costa crediti veri. Oggi e' successo.

## Chiuse, con la prova

| cosa | chiusa da | nota |
|---|---|---|
| Il modello locale va in loop | commit `a468e6ed`, 11/09 | la coda diceva «in lavorazione»: **corretto oggi** |
| Lo stop non e' immediato | stesso commit `a468e6ed` | stesso caso, **corretto oggi** |
| Regressione di stile nel selettore dei modelli locali | gia' marcata chiusa | — |
| Suite di generazione dei documenti | `6f720607`, 10/09 | riverificata l'11 |
| Download immediato dalla chat | `6f720607`, 10/09 | riverificata l'11 |
| Comandi diretti col punto esclamativo | fra il 9 e il 10/09 | — |
| Conversazione del sotto-agente nel pannello destro | consegnata | — |
| Il confronto del file modificato dentro la chat | 10/09 | — |
| Barra laterale viva | `873b2bba`, 10/09 | — |
| L'indice dei giri saltava i numeri | 10/09 sera | — |
| I due flussi di uscita fusi | 10/09 sera | ⛔ **ma** la parte «riordinati» resta aperta, ed e' in Fase 8 |
| «Chiudere la scrittura non impediva di scrivere dalla shell» | dal 06/09 | ⛔ il documento **si contraddice da solo**: aperta in una tabella, chiusa nella propria intestazione. Ho letto la voce intera: **e' chiusa** |

## Chiuso senza difetto — «abbiamo guardato e non c'e'»

La lane mobile ha trovato un difetto in cui l'attesa di una prova vive in una fase del ciclo interno
diversa da quella in cui il componente lavora. **Da noi non c'e':** i componenti che trattano le
frecce sono sincroni e non hanno un solo temporizzatore. Condividiamo solo la meta' innocua. Lo
registro perche' «abbiamo guardato e non c'e'» risparmia la caccia a chi verra' dopo.

## ⛔ Documenti e memorie da marcare obsoleti — pronto, NON applicato

Hai chiesto la marcatura; poi mi hai detto di fermarmi alla tabella. Ecco cosa va toccato appena lo dici:

| file | cosa dice di sbagliato |
|---|---|
| La coda delle proposte | l'intestazione dichiara uno stato dell'11/09: non riporta le chiusure del 12 e del 13 |
| La tabella di marcia precedente | **superata da questo file**: va marcata come sostituita, non cancellata |
| Il documento sullo stato vero delle righe | contiene righe dichiarate aperte l'11/09 e mai riverificate |
| Memoria sullo stato del rilascio desktop | descrive cinque blocchi del 07/09, tutti superati |
| Memoria «niente piu' deleghe» | superata lo stesso giorno in cui e' nata; la nota va in testa, non in coda |
| Memoria sulla delega esclusiva ad Astra | sostituita dalla regola dei cinque agenti |
| Memoria «un agente alla volta» | sostituita dalla stessa regola |
| Gli indici della memoria | i puntatori alle tre memorie qui sopra vanno riscritti come superate |

---

# Cosa resta fuori da ogni fase, e perche'

| cosa | perche' |
|---|---|
| La cartella `C:/c` sul tuo disco | nata da un percorso scritto in forma Unix e passato a PowerShell. Contiene anche file non miei: non la tocco |
| Un processo da **1.979 MB**, vivo dal 10 settembre | e' il singolo processo piu' grosso della macchina. Ho risalito la catena come da regola: **non e' orfano**, e' appeso a un albero vivo. Non lo uccido: decidi tu |
| La pulizia di fine lavoro | due cartelle sul Desktop, una cartella di appunti, worktree vecchi, le cartelle di costruzione. Solo al tuo si', misurando prima |
| Un rapporto di prova vecchio sul disco di sviluppo | dichiara «completato» per una versione precedente. Sul server di costruzione viene riscritto a ogni corsa, e la guardia sull'impronta lo **respinge** (provato nel verso che deve fallire). Resta da decidere se il rapporto debba portare anche versione e tag, cosi' che il rifiuto spieghi **quale** costruzione stava dichiarando |
