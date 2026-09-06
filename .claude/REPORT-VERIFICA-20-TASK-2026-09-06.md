# Verifica d'uso T05–T20 — la app guidata come farebbe una persona

> **Base del codice:** `c1984d79`, worktree `AVM-harness-prove`, ramo `lane/harness-desktop-prove`.
> **Istanza:** la mia, sulla porta **4188** (la 4174 dell'owner non è stata toccata; la 4178 indicata
> nel compito era già occupata da un'altra sessione, quindi ho preso la prima libera).
> **Come:** Playwright su Chrome vero, headless, `channel: 'chrome'`, italiano, foto scattate
> **durante** e poi guardate una per una.
> **Modello per i giri veri:** `z-ai/glm-5.3-flash`. Nove giri in tutto (T05, T06, T07, T08 ×2, T09,
> semina di memoria/nota/attività), gli altri undici task provati **senza** avviare nessuna sessione.
> **Taccuini:** `.claude/taccuini/T05-*.md … T20-*.md` (+ `T08b-lettura-pagina.md`).
> **Foto:** `scratchpad/prove/foto/<taccuino>/` nel worktree.

> ⚠️ **Le prove T11–T15 (i «luoghi») valgono per il codice a questa base.** Un altro agente sta
> riscrivendo quelle superfici in parallelo: quello che segue è com'erano il 06/09 fra le 16:15 e le
> 16:30, non un giudizio sul lavoro in corso.

---

## ⛔⛔⛔ LA COSA PIÙ GRAVE CHE HO TROVATO

> ## LA DELEGA A UN SOTTO-AGENTE È ROTTA, COSTA, E NESSUNA SUPERFICIE LO DICE
>
> Un solo giro che chiedeva **una** delega ha prodotto **quattro sessioni figlie**, **8 giri**,
> **76,8k token**, e **tutte e tre le deleghe sono fallite**. I figli girano con
> **`z-ai/glm-4.7-flash`** mentre la sessione aveva scelto **`z-ai/glm-5.3-flash`**: un modello che la
> persona non ha scelto, pagato sul suo credito, **senza una riga che lo dichiari**. La scheda
> **«Agenti»** della colonna di destra scrive **«Nessun sotto-agente in questa sessione»** mentre
> l'API `/children` ne dichiara **tre** e un altro foglio della stessa app li elenca come
> **«Delega · fallito»**. E le figlie compaiono nella barra laterale come sessioni normali chiamate
> `delega:667b9d42-4b10-4e…`: l'elenco è passato da **5 a 10** in un giro, e riaprendo la app si
> entra **dentro la sessione di un sotto-agente**.
>
> **La causa è nel kernel** (fuori dalla mia lane, **da segnalare**): `talosHarness.mjs:5915` rifiuta
> una delega la cui cartella sia uguale a quella del padre, così il modello riscrive lo stesso
> percorso in forma **WSL** (`/mnt/c/Users/…`, la forma che produce `convertiPercorsoWsl`,
> `talosHarness.mjs:1928`, usata a `:2085`) per far passare il controllo — e il figlio parte con una
> `cwd` che su Windows non esiste. Una guardia contro la ricorsione **insegna al modello a mentire
> sul percorso**.

---

## Il quadro

**85 difetti** dopo aver ritirato i sei che erano miei e non della app:

| gravità | quanti |
|---|---|
| blocco | **0** |
| grave | **28** |
| medio | **33** |
| minore | **24** |

I sedici task chiudono così: **PASSA** nessuno · **PASSA CON RISERVA** tredici (T05, T06, T07, T08,
T11, T12, T13, T15, T16, T17, T18, T19, T20) · **FALLISCE** tre (T09, T10, T14).

**Sei difetti ritirati perché erano della mia sonda, non della app** — nominati uno per uno nei
taccuini: `T06-D1` (il terminale esegue eccome), `T07-D1` (la Review elenca i file, come pastiglie),
`T10-D1` (l'albero si apre, non è un `<dialog>`), `T15-D3` (l'Officina non mostra nessun dettaglio
finto: era markup nascosto), `T18-D1` (il pannello notifiche si apre), `T20-D1` (la densità funziona,
la mia spazzata la cambiava a schermo chiuso).

---

## La tabella dei difetti, dalla più grave alla più leggera

### GRAVE (28)

| id | superficie | cosa vede una persona · come si riproduce | prova |
|---|---|---|---|
| T09-D1 | Colonna destra · Agenti | La scheda dice «Nessun sotto-agente in questa sessione» mentre l'API `/api/v1/sessions/<id>/children` risponde `figli: 3`, la barra laterale ne elenca quattro e il modello racconta in chat tre tentativi di delega. È la segnalazione **O-10**, data per ✅ chiusa | `foto/T09-colonna-destra/12-agenti.png` vs `13-processi.png` |
| T09-D2 | Delega · modello | La sessione sceglie `glm-5.3-flash`; le quattro sessioni delegate girano con `glm-4.7-flash`. Nessuna riga lo dichiara | `/api/v1/sessions`, colonna modello |
| T09-D3 | Barra laterale | Le sessioni delegate stanno **allo stesso livello** delle tue e si chiamano `delega:667b9d42-4b10-4e…`. Da 5 a 10 sessioni in un giro (H22) | `foto/T09-colonna-destra/12-agenti.png` |
| T09-D4 | Kernel · delega | Tre deleghe su tre fallite: la shell del figlio prova a entrare in `/mnt/c/Users/…`, che su Windows non esiste | chat del giro; `talosHarness.mjs:5915`, `:1928`, `:2085` |
| T14-D4 | Barra laterale · Note | «Note» ha un contatore vivo (**Note 1**, la nota c'è sul disco) e **nessuna pagina**: cliccandola si finisce nella chat. Fra i sedici `id="schermo…"` del template non esiste `schermoNote` | `foto/T14-attivita-e-note/03-note-clic-mouse.png`; `frontend/index.template.html:72`; `frontend/src/components/nav-item.js:44` |
| T14-D2 | Note | La nota scritta dall'agente («Appunti su lista.mjs», sul disco in `.notes-store/`) non compare da nessuna parte — stessa radice di T14-D4 | `.notes-store/ee395ffe….json` |
| T14-D1 | Note / Attività | I due luoghi che C24 vuole **separati** non lo sono: il clic su «Note» apre lo schermo delle Attività (o la chat) | `T14b-note.mjs` |
| T14-D3 | Attività | Le Attività hanno i filtri «Mie / Dell'agente» ma **nessuna riga dichiara l'autore**: la riga scrive «Autore non registrato», e sul disco il record non ha il campo | `foto/T14-attivita-e-note/02-note.png`; `.tasks-store/2697b59b….json` |
| T10-D2 | Chat · bolla utente | Passando col mouse sul proprio messaggio **non compare nessuna azione**: né copia, né modifica. L'`outerHTML` della bolla non ha un solo `<button>` | `T10b-bolla.mjs`, `DOPO HOVER {"bottoni":[]}` |
| T10-D3 | Chat · B25 | Non esiste nessun modo di **modificare** un proprio messaggio ⇒ il ramo di B25 è irraggiungibile. Nei dati: **0 sessioni con `forkDa`** su 10 | idem |
| T10-D5 | Albero dei rami | **Due fogli diversi** per la stessa cosa: quello della colonna dice «Nessun ramo ancora», quello del titolo elenca **tre deleghe** | `01-albero.png` vs `06-menu-sessione.png` |
| T10-D6 | Albero dei rami | Il secondo foglio ha l'occhiello **«CONVERSATION GRAPH»** e marca il nodo padre **«Main»**: inglese a schermo | `06-menu-sessione.png` |
| T10-D9 | Albero / Agenti | Lo stesso foglio dichiara le tre deleghe come **«Delega · fallito»**: il dato **c'è**, ed è la scheda Agenti a negarlo | `06-menu-sessione.png` |
| T05-D2 | Chat · stop | Uno stop **chiesto da te** diventa una carta rossa `Errore · TALOS · errore` con `[internal-error] This operation was aborted` — codice tecnico, in inglese, senza cosa fare. L'API registra `ultimoEsito: 'errore'` | `foto/T05-fermare/04-dopo-lo-stop.png` |
| T05-D3 | Barra laterale | Dopo la fine del giro la sessione continua a dire **«in corso»** col pallino acceso (API: `conclusa=true`), misurato su due foto a 15 s di distanza | `04-dopo-lo-stop.png`, `05-fine.png` |
| T06-D3 | Terminale | La dichiarazione **«Stessa macchina, senza isolamento»** (G9) **sparisce quando le schede diventano tre**: resta solo `progetto-5/` | `01-terminale-aperto.png` vs `03-comando.png` |
| T07-D2 | Colonna destra · Ambiente | La riga **«Non salvate»** dice **«–»** mentre nel repo c'è la modifica appena scritta dall'agente (`git status --short` → ` M src/lista.mjs`, stesso minuto) | `foto/T07-review/10-review-aperta.png` |
| T08-D2 | Browser · letture | Un rifiuto del cancello web arriva a schermo come **`blocked: TALOS_WEB_URL_BLOCKED:port`**, messo al posto del **titolo** e del **testo** della pagina | `foto/T08-browser/03-annotazione.png` |
| T08-D4 / T08b-D1 | Browser · letture (**O-28**) | «Letture della sessione» mostra il **sorgente HTML** della pagina, blocchi `<style>` compresi: è ciò che `naviga` consegna al modello | `foto/T08b-lettura-pagina/01-lettura.png` |
| T11-D4 | Capability | I 43 attrezzi mostrano **solo** la descrizione inglese del kernel («Lists the files of the workspace…»), senza quella italiana e senza la marca «testo inviato al modello» (C10) | `foto/T11-capability/02-dettaglio.png` |
| T11-D9 | Capability | La descrizione di «comando nel terminale» è un paragrafo inglese di otto righe che parla di **telefono Android** su un'app desktop, ed è **tagliata** dal bordo del riquadro | idem |
| T11-D10 | Avvio della app | Aprendo TALOS si entra nell'**ultima sessione creata**, che è una **delega**: il piede dichiara come cartella `sottotask-conta-righe-2` | `foto/T11-capability/03-skill.png` |
| T15-D1 | Ricerca approfondita | La sezione dichiara «La consultazione del rapporto e delle fonti **non è ancora disponibile qui**»: C26 vuole i rapporti **riapribili**, ed è la funzione stessa della sezione | `foto/T15-ricerca-e-officina/01-ricerca.png` |
| T15-D2 | Officina attrezzi | «La lettura della **definizione completa** non è ancora disponibile qui»: C27 vuole il codice dell'attrezzo in sola lettura, cioè ciò che permette di fidarsi prima di abilitare | `02-officina.png` |
| T16-D2 | Board | La colonna **Costo** è vuota su **tutte** le righe | `01-board.png` |
| T16-D4 | Board | …ed è `display:none`, larga **0 px**: a schermo le colonne sono nove, non dieci. Il costo per sessione (G6, B26) non si vede da nessuna parte | `T16b-board.mjs` |
| T16-D3 | Board | Tre righe si chiamano `delega:667b9d42-4b10-4e63-926e-942…`, troncate allo stesso punto: **indistinguibili** (H22) | `01-board.png` |
| T20-D4 | Primo avvio | **«Ripeti il primo avvio» non riapre l'intro**: sette tentativi in cinque sessioni di browser, si è aperta **una volta sola** | `intro-p1.png` (niente) vs `intro-1.png` (l'unica volta) |

### MEDIO (33)

| id | superficie | cosa vede una persona | prova |
|---|---|---|---|
| T05-D1 | Chat | Nessuna riga dice che il giro è stato fermato da te: resta un messaggio troncato senza spiegazione | T05 |
| T06-D4 | Terminale | Su una sessione **appena creata** ci sono già **due shell** che nessuno ha chiesto (il tetto dichiarato è 8) | `01-terminale-aperto.png` |
| T06-D5 | Terminale | Il piede — dove gira e chi l'ha aperta — è **tagliato in due punti su tre** a 1440 px | idem |
| T07-D3 | Review | La testata del diff dice «+1 · **giro 1**», l'Indice dei giri attribuisce la scrittura al **giro 3** | `10-review-aperta.png` |
| T07-D4 | Colonna destra | L'**Indice dei giri** (B23) comincia da **2**: il giro 1 non c'è | idem |
| T08-D1 | Browser | Non esiste l'interruttore **«Leggibile / Sorgente»** (la metà interfaccia della cura di O-28) | T08 |
| T08-D3 | Browser / kernel | Il cancello blocca il **dev server della persona stessa** (`127.0.0.1:4197`) mentre la cornice viva, dieci centimetri sotto, apre la stessa pagina | `03-annotazione.png` |
| T08-D5 | Browser | Il titolo della lettura è lo **stato HTTP** (`HTTP 200 · https://example.com/`), non il titolo della pagina, che pure è nel sorgente acquisito | `T08b/01-lettura.png` |
| T10-D7 | Albero dei rami | Numeri all'inglese (`76.8k token`, `cache 53.3k`) accanto a una barra di stato che scrive `76,8k`; e «cache» vale **53,3k** qui e **72%** là | `06-menu-sessione.png` |
| T10-D8 | Albero dei rami | Percorsi grezzi `/mnt/c/Users/…` troncati, e un **pallino orfano** appiccicato al numero | idem |
| T11-D1 | Capability | Solo **una** scheda su quattro porta il numero (C3 le vuole tutte) | `01-capability.png` |
| T11-D2 | Capability | Il totale (`~7454 token di schema per giro`) non è espresso come **percentuale della finestra** (C6) | idem |
| T11-D3 | Capability | «Uso nella sessione **non registrato**» ⇒ l'ordine per «più usati» (C8) non è possibile | idem |
| T11-D5 | Capability | Nomi tecnici a schermo: `web_search`, `library_list`, `tasks_list`, `notes_list` (H22) | idem |
| T11-D6 | Capability | Il dettaglio di un attrezzo non mostra le **ultime chiamate** (C9, E8) | `02-dettaglio.png` |
| T12-D1 | Libreria | Testata «0 file · **Token non disponibili**»: il costo in token per file (C21, B9) non c'è | `01-libreria.png` |
| T12-D2 | Libreria | Ci sono i filtri «Sempre nel contesto / A richiesta» e in fondo la frase «L'elenco **non indica** quali file sono nel contesto» | idem |
| T12-D3 | Libreria | «Token non disponibili» è scritto **sempre**, anche a libreria vuota | idem |
| T13-D1 | Memoria | Divisa per **genere** (Preferenze · Fatti · Procedure · Regole), non per **strato** come chiede C22 (di lavoro · episodica · semantica). Sul disco il campo si chiama `genere` | `01-memoria.png`; `.memory-store/*.json` |
| T13-D2 | Memoria | Nessun ricordo dichiara **quando è stato usato** l'ultima volta (C23) | idem |
| T16-D1 | Board | La colonna Costo non dichiara di essere una **stima** (G6, H25) | `01-board.png` |
| T16-D5 | Board | Il piede promette «**il tasto destro mostra le sue azioni**»: il tasto destro non apre niente | `03-tasto-destro.png` |
| T16-D6 | Board | L'intestazione di colonna è un `<th>` senza `aria-sort` e cliccarla non riordina (G5, H27) | `T16b-board.mjs` |
| T17-D2 | Impostazioni | **Esporta / Importa / Ripristina** (D5): c'è solo un «Ripristina movimento» | `01-impostazioni.png` |
| T17-D3 | Impostazioni | Nessuna impostazione dichiara **quando morde** (D6) | idem |
| T17-D4 | Impostazioni | Nessun **modello ausiliario per mestiere** (D7) | idem |
| T17-D5 | Impostazioni | **Quattordici decisioni su venti** del capitolo D non hanno superficie: D14 timeout approvazione · D15 redazione dei segreti · D16 comandi permessi per progetto · D17 indirizzi privati · D18 checkpoint · D19 salute del provider · D21-D22 Costi · D26 ripartizione della finestra · D27 archiviare le chat · D30 Informazioni | otto foto `sez-*.png` |
| T17-D7 | Impostazioni · Account | Sei pulsanti, **cinque inglesi**: Agents · Hooks · Skills · Plugins · MCP · Doctor | `sez-AccountD.png` |
| T17-D8 | Impostazioni · Account | **D30 assente**: né versione, né cartelle, né licenze, né «apri la cartella dei dati» | idem |
| T19-D1 | Doctor | I due **avvisi** non dicono **cosa fare**, e nessuna delle undici carte ha un rimedio eseguibile (H1-H5) | `01-doctor.png` |
| T20-D2 | Board (a tutte le viewport) | In **12 combinazioni su 48** c'è testo **tagliato in silenzio** (`overflow-x: hidden`), 11 elementi per volta: le celle «Sessione» coi titoli lunghi | spazzata T20 |
| T20-D5 | Primo avvio | L'intro parte dal **passo 2**, non dal primo: «Primo avvio · 2 di 4», e il passo «Cartella» viene saltato (F29) | `avvio-4.png` |
| T20-D6 | Primo avvio | **«Avanti» non è disabilitato quando non può andare avanti**: quattro clic sul passo 2 e tre sul passo 3 non spostano niente; il motivo compare **solo dopo** il clic | `avvio-4.png`, `wiz-3.png` |

### MINORE (24)

| id | superficie | cosa vede una persona |
|---|---|---|
| T05-D4 | Colonna destra | Il pannello si intitola «File **toccati**» e da vuoto scrive «Nessun file **scritto** finora» |
| T05-D5 | Colonna destra | L'albero mostra **`.git`** fra le cartelle di primo livello |
| T05-D6 | Composer | Il segnaposto promette «Invio indirizza il giro in corso» anche quando **nessun giro è in corso** |
| T05-D7 | Toast | «Avvio in corso» e «Stop richiesto» restano **sopra** la colonna di destra e ne coprono l'elenco |
| T06-D2 | Terminale | **Canc non chiude** la scheda (il componente lo dichiara come parità con Hermes) |
| T06-D6 | Terminale | La scheda **rinominata** perde la dichiarazione di chi l'ha aperta |
| T07-D5 | Review | Il toast ripete due volte la stessa frase: «Diff di 1 file copiato / Diff di 1 file copiato» |
| T07-D6 | Colonna destra | Titolo della sessione troncato **a metà parola**, senza puntini |
| T10-D4 | Chat | «Copia il giro intero» e «esporta la sessione» (B24) non esistono: c'è solo «Copia la risposta» |
| T10-D10 | Barra laterale | Col tasto destro su una sessione **non compare nessun menu** (A5: si fissa dal menu della riga) |
| T10-D11 | Foglio dei rami | Un **filo chiaro verticale** lungo il bordo destro, fuori dall'angolo arrotondato |
| T11-D7 | Capability | Nessuna riga dichiara gli attrezzi che il modello scelto **non supporta** (C11) |
| T11-D8 | Capability | Non esiste **«Trasforma questo lavoro in una skill»** (C13) |
| T13-D3 | Memoria | La testata scrive **«1 ricordi»**, due volte (le Attività declinano bene: «1 aperta») |
| T13-D4 | Memoria | Il record non ha nessun campo per «quando è stato usato»: C23 tocca la **forma del dato** |
| T17-D1 | Impostazioni | Otto sezioni, non dieci, e **senza i due gruppi** comportamento/infrastruttura (D2) |
| T17-D6 | Scorciatoie | Il pannello di Ctrl+/ **non ha la ricerca** (D10) |
| T17-D9 | Impostazioni | «Chat e composer» ha **una sola** impostazione e per il resto rimbalza a un'altra sezione |
| T17-D10 | Impostazioni | I temi sono **quattordici** in fila: D23 chiedeva di **riordinarli**, «meno confusionario» |
| T18-D2 | Notifiche | Il fumetto si apre **sopra il pulsante «Nuova»** e lo copre per intero |
| T19-D2 | Doctor | I controlli **non sono raggruppati** (H1-H5): undici carte in fila |
| T20-D7 | Primo avvio | **«Apri Model Lab»**: nome inglese a schermo, disegnato come testo grassetto centrato, senza aspetto di pulsante |
| T20-D8 | Primo avvio | Manca la riga di H20: «Nessuna telemetria, niente esce da questa macchina» |
| T20-D9 | DOM | Convivono **due intro**: quella viva (`#veloIntro`) e un `#introDialog` legacy coi comandi duplicati |

---

## Ondata per ondata — cosa vede una persona

### Ondata 1 — fermare un giro (T05)

Il **meccanismo** dello stop è a posto: il pulsante di invio diventa «ferma» con l'etichetta giusta,
`Esc` apre una conferma scritta bene («Fermo il giro? … Si ferma al prossimo punto sicuro: il lavoro
già fatto resta, i file già scritti restano»), «Continua» lascia proseguire, «Ferma il giro» ferma
davvero, e subito dopo si può riscrivere. Quello che non funziona è il **racconto**: la app ti dice
che il tuo stop è un **guasto** — carta rossa, `[internal-error] This operation was aborted`, esito
`errore` che poi si porta dietro nella Board e nella barra laterale — e la barra laterale continua a
dire «in corso» a giro finito.

### Ondata 2 — le viste della sessione (T06–T10)

Qui la app dà il meglio e il peggio nella stessa schermata.

**Il meglio.** Il **Terminale** è maturo: schede con pallino di stato, apertura, rinomina con F2,
frecce, menu del tasto destro con «Chiudi · Chiudi le altre · Chiudi tutte», contatore sulla linguetta,
e un comando vero che gira (`echo` → output). La **Review** ha il diff con i numeri di riga, la riga
aggiunta in verde, la pastiglia `src/lista.mjs +1`, «Copia i diff» che funziona — e, cosa rara,
**nasconde** i controlli che non esistono ancora (`Accetta`, `Scarta`, `Apri nell'editor` sono nel
markup ma invisibili: la regola «mai un pulsante che non fa niente» è rispettata). La metà **viva** del
**Browser** è la funzione meglio riuscita di tutta la campagna: il dev server locale si apre dentro
TALOS passando dal proxy, l'annotazione mette uno **spillo numerato sopra l'elemento vero**, cattura
il selettore stabile, e «Porta i commenti nella chat» scrive il pacchetto nel composer **senza
inviarlo**. La scheda **Processi** elenca i comandi con chi li ha lanciati, la durata e il codice
d'uscita.

**Il peggio.** La scheda **Agenti** nega tre sotto-agenti che l'app stessa conosce; la **delega** è
rotta e paga un modello che non hai scelto; **non esiste** il gesto centrale di T10 (modificare un
proprio messaggio per aprire un ramo), e i due fogli che dovrebbero mostrarne il risultato si
contraddicono, uno dei due in inglese. E la segnalazione **O-28** dell'owner è **confermata e
misurata**: `naviga` consegna al modello il sorgente HTML — su `example.com` sono 591 caratteri di
markup e CSS per quattro righe di testo; su una pagina vera è il rapporto che lui ha visto.

### Ondata 3 — i luoghi (T11–T15) · *verdetto alla base `c1984d79`*

L'impianto deciso in C1-C30 si vede tutto: pagine intere, schede col numero, costo in token per
attrezzo, pannello di dettaglio, «dove vivono i file» scritto in piccolo sotto ogni elenco, elenco
piatto dei **«non ancora implementati»**. La **Memoria** funziona per davvero: il ricordo scritto da un
giro vero compare, si cerca, si filtra, si corregge.

Ma tre cose non reggono. **«Note» è una voce di menu con un contatore vivo e nessuna pagina** — nel
template non esiste uno `schermoNote`, e il clic finisce nella chat: la nota che l'agente ha scritto
non è raggiungibile da nessuna parte. Le **descrizioni dei 43 attrezzi** sono in inglese, e quella
della shell spiega a un utente desktop italiano come si comporta su un **telefono Android**.
**Ricerca** e **Officina** dichiarano, una riga sotto il loro stesso elenco, di non saper fare la cosa
per cui esistono (riaprire un rapporto, leggere il codice di un attrezzo).

### Ondata 4 — le globali (T16–T20)

La **Board** e il **Doctor** sono le due pagine che rispettano meglio le decisioni. La Board ha una
riga per sessione, le tre misure nuove di G3-G4 (**cache**, **tempo al primo token**, **motivo di
chiusura**) e un piede che **spiega le unità**. Il Doctor ha il conteggio per severità in pastiglie
(«11 controlli · 2 da rivedere · 3 ok · 6 note · 2 avvisi · 0 guasti»), l'esportazione in JSON, e —
la cosa più difficile — **ogni controllo dichiara cosa NON ha guardato** («questo controllo non attesta
l'isolamento WSL2», «non apre una pagina e non verifica la connessione»). Ha anche trovato per davvero
l'unico guasto reale della mia istanza.

Le **Impostazioni** sono scritte bene dove esistono, e sono oneste sui limiti («una chiave presente non
prova la connessione»), ma **quattordici decisioni su venti** del capitolo D non hanno ancora una
superficie, e la sezione dell'account parla inglese.

La **spazzata di coerenza** è la buona notizia: a 3 viewport × 2 temi × 8 luoghi la testata è sempre
**60 px**, il padding sempre **0/18/0/18**, le azioni sempre a **28 px** dal bordo, le schede non
cambiano numero, e **la pagina non scorre mai in orizzontale**, nemmeno a 1024 px. L'unico difetto
geometrico è la Board, che taglia i titoli in silenzio.

Il **primo avvio**, invece, no: l'intro esiste, è a quattro passi ed è disegnata bene, ma **parte dal
secondo passo** saltando la scelta della cartella, **non si può ripetere** dalle impostazioni (una
volta su sette), e il pulsante «Avanti» ha l'aspetto pieno anche quando non può portarti avanti.

---

## ⛔ NON VERIFICATO, per nome

Cose che non ho potuto misurare, e che quindi **nessuno ha ancora provato**:

1. **C12 — le skill coi tre stati** sempre / chiedi / mai: nel progetto non c'è nessuna skill.
2. **C15-C17 — i connettori MCP**: origine, timeout, elenco permesso, spegnimento per sessione.
   Nessun connettore configurato.
3. **C18-C19 — i plugin**: cosa portano dentro, fiducia legata all'impronta. Nessun plugin installato.
4. **C21 su file veri — la Libreria**: è vuota e l'unica via per riempirla («Aggiungi documento») apre
   un selettore di file di sistema, fuori dalla portata di una prova automatica.
5. **C26/C27 con dati veri**: una ricerca approfondita avviata fino in fondo, e un attrezzo creato dal
   modello con `tool_create` da giudicare nell'Officina.
6. **G22/G29 col caso pieno**: il contrassegno sulla sessione, il pannello notifiche con più di una
   voce e la **notifica di sistema**. Non ho avuto una sessione in attesa di approvazione **mentre**
   guardavo.
7. **La densità applicata alle PAGINE**: l'ho provata solo sulla barra laterale, dove funziona
   (66 → 54 px). La spazzata su Board, Capability e gli altri luoghi va **rifatta con la tendina vera**.
8. **I veli (fogli modali) alle tre viewport**: la spazzata ha coperto le schermate, non i fogli
   («Nuova sessione», permessi, albero dei rami, scorciatoie), guardati solo a 1440×900.
9. **Il passo 4 «Fine» dell'intro** e l'apertura della sessione d'esempio (H19).
10. **Il secondo modo di O-28** (la vista «Leggibile») su una pagina grande: ho misurato solo
    `example.com`, quattro righe. Il caso dell'owner («438747 caratteri tolti nel mezzo») non l'ho
    riprodotto.
11. **La dettatura vocale** (B29: «resta solo se funziona davvero»): il microfono è a schermo nel
    composer e non l'ho provato.
12. **Il tema chiaro guardato con l'occhio**: la spazzata l'ha misurato (geometria identica), ma le
    foto che ho ispezionato una per una sono quasi tutte in tema scuro.

---

## Due note di ingegneria, fuori dai difetti

**1) La copia pubblica non corrispondeva ai sorgenti.** Alla base `c1984d79`, ricostruendo il frontend
(`npm run build` + `cp -r dist/. ../public/`) i file `public/app.js` e `public/styles.css` **cambiano**:
il `public/` committato è **indietro di 544 byte** rispetto ai sorgenti dello stesso commit, e fra le
righe mancanti c'è proprio la cura di **O-29** (la bolla della domanda: `max-width: min(72%, 44rem)`,
`border-radius: 16px 16px 4px 16px`, `align-items: flex-end`). Chi avvia il server dal repo **non vede**
la cura dichiarata in quel commit. Io ho ricostruito prima di provare, quindi tutto questo report
misura i **sorgenti**, non l'artefatto committato.

**2) Sei difetti su novantuno erano miei.** Li ho ritirati per nome nei taccuini, e la causa è sempre
la stessa: **ho misurato il DOM invece di guardare lo schermo**. `textContent` di uno schermo include
i pannelli nascosti; `offsetParent` è `null` anche per un elemento `position: fixed` perfettamente
visibile; una linguetta che porta un contatore non si trova cercando il testo esatto. **Le foto hanno
smentito la sonda cinque volte su sei.** Chi riprenderà queste prove faccia lo stesso: prima la foto,
poi il selettore.
