# MEMORIA — le regole di VERIFICA

> ⛔ **SETTIMO file dell'indice di memoria**, importato da `CLAUDE.md` come gli altri. Nato il
> **18/09/2026 sera**, quando `MEMORIA-INGEGNERIA.md` è stato misurato a **24.099 byte** contro il
> tetto di **25.000** oltre il quale il contenuto si taglia **in silenzio** — cioè a **901 byte** dal
> taglio, con l'allarme a 19.900 superato di oltre quattromila. Il blocco qui dentro pesa da solo
> **16.816 byte**: il 70% di quel file.
>
> ⛔ **E la destinazione è stata misurata prima di spostare, come sempre**: `MEMORIA-LEZIONI` 18.999 ·
> `MEMORIA-REGOLE` 18.945 · `MEMORIA-SETTEMBRE-2026` 18.744 · `MEMORIA-INGEGNERIA-2026-08` 14.213 ·
> `MEMORIA-BANCO` 5.468 byte. Nessuna ha i 16.816 liberi che servono, e le prime tre stanno a mille
> byte dal loro allarme. ⇒ **Quando nessun posto giusto ha spazio, se ne apre uno nuovo** — è il
> precedente del 12/09 e del 13/09.
>
> Blocco intero, non accorciato: le regole su COME si verifica e quando una cosa si può dire provata.
> Nessuna riga persa.

## Le regole di VERIFICA — spostate qui da `MEMORY.md` il 14/09/2026

> ⛔ **Non sono state buttate: sono state spostate.** `MEMORY.md` era a **180 righe**
> contro il tetto di lettura di **200** (e l'allarme del sistema scatta a 140): oltre quel punto il
> contenuto si perde **in silenzio**, come già succede ai 25 KB. Questo era il blocco più coeso —
> tutte regole su COME si verifica e quando una cosa si può dire provata.
>
> ⛔ E la destinazione è stata misurata come l'origine, prima di spostare: questo file aveva
> **6819 byte** e **6352 byte** ci stavano senza avvicinarsi al tetto. Nessuna
> riga accorciata, nessuna riga persa.

> ⛔⛔⛔ **ACCENDERE UNA SCHERMATA NON È UNA RIGA DI ROTTA: IL MONTAGGIO PRESUPPONE LA SUA DESTINAZIONE** —
> 18/09/2026. Per far vivere il Laboratorio modelli nella sua schermata (che esisteva, completa, e
> non aveva porta) ho invertito la destinazione del travaso in `app.js` — i figli dei pannelli legacy
> sarebbero andati nei pannelli canonici. **Tre crolli in tre funzioni diverse**, uno dopo l'altro
> (`montaCatalogoModelli` ×2: `Cannot set properties of null`, poi `replaceChildren` su null;
> `ensureModelLabControls`: `insertBefore`, il nodo di riferimento non è più figlio di quel
> genitore): ognuna **presupponeva** che in `originale` ci fossero i figli canonici, con gli id/attributi
> canonici. Il travaso non è un trapianto: è un cambio di proprietario, e chi lo riceve deve saperlo.
> ⛔ **E la prima foto della schermata era un FALSO POSITIVO**: scattata quando il montaggio non era
> ancora girato, mostrava i pannelli canonici pieni e i modelli veri. Una foto di una superficie non
> prova niente finché il **percorso di codice dietro** non è passato: è la stessa forma del
> «BUILD SUCCESSFUL che non è una prova» e del «pulsante che promette un'altra cosa».
> ⇒ L'accensione è stata RITIRATA (`157a87d2`); il laboratorio resta dove funziona, e i passi per
> portarlo sono quelli del port vero (memoria/fornitori di là, guscio a 4 schede, catalogo a faccette).

> ⛔⛔ **UNA CONCLUSIONE TRATTA DA UN NOME, NON DA UNA MISURA** — 18/09/2026. La ricognizione delle
> sorgenti dati aveva concluso che «il 18,6 GB allocabili» del verdetto «Entra / Entra stretto / Non
> entra» fosse **spazio su disco** usato in un verdetto di **memoria**, e io l'ho portato all'owner
> come difetto da curare. Alla fonte era il contrario: `local-runtime-probe.mjs:251` —
> `memory.availableBytes = machine.memory.freeBytes` = **RAM**; il disco (`storage.allocatableBytes`,
> `machine-capacity.mjs:53`) serve al verdetto di **spazio**. Il sospetto nasceva da un **conflitto di
> nomi**: due grandezze diverse chiamate «allocabili». ⇒ Prima di chiamare difetto una grandezza, si
> legge **da dove viene il numero** (`file:riga`), non come si chiama.

> ⛔⛔⛔⛔ **OGNI MIO FINALE HA QUESTA FORMA, SEMPRE** — owner, 18/09/2026: «d'ora in poi tutti i tuoi
> output finali saranno strutturati così: **cosa hai fatto · cosa devo fare io · cosa devi fare tu ·
> cosa manca** — essenziale conciso ma senza tralasciare nulla».
> ⇒ Quattro voci, in quest'ordine, **a ogni risposta finale**: cosa ho fatto (coi numeri), cosa deve
> fare lui (scelte secche sì/no/dopo), cosa faccio io (senza chiedere permesso), cosa manca (debito e
> non-verificato, per nome). ⛔ «Essenziale conciso» **non** vuol dire omettere: se una cosa è
> importante e non ci sta in una riga, si mette — ma in una riga sola, non in un paragrafo.
> ⛔ Prove, misure e tabelle stanno nel ledger e nel commit; nel messaggio solo ciò che serve alla
> sua decisione. (È la stessa formula della chiusura di fase, ora obbligatoria **sempre**.)

> ⛔⛔⛔⛔ **IL MOCKUP SI COLLEGA FILO PER FILO A CIÒ CHE ABBIAMO GIÀ — E CIÒ CHE NON SI COLLEGA SI RIPORTA, NON SI INVENTA** —
> owner, 18/09/2026: «Ogni cosa del mockup deve essere collegata **filo per filo, elemento per
> elemento, riga per riga, codice per codice**, a quello che c'è già nella nostra infrastruttura.
> Se qualcosa non si può collegare me lo riporti **senza inventarti nulla e prendere decisioni per
> conto tuo**».
> ⇒ Vale per il Laboratorio modelli (il port aperto del prototipo `prototypes/calm-lab`) e per ogni
>   mockup futuro. Tre conseguenze operative:
> 1. **Per ogni elemento del mockup**: da dove vengono i suoi dati **nel nostro prodotto** — rotta,
>    campo, preferenza, componente già esistente — citando `file:riga`. «Collegato» significa che
>    legge e scrive davvero, non che assomiglia.
> 2. **Ciò che non ha una sorgente vera si ELENCA e si porta all'owner**, con la domanda secca. Non
>    si riempie con una fixture, non si sceglie un surrogato, non si decide da soli.
> 3. ⛔ Il pacchetto della PR #27 lo dice con le stesse parole: «il nuovo catalogo approvato è
>    committato sotto `frontend/prototypes/calm-lab`; **NON è il catalogo produttivo**» e «**non
>    sostituire i dati del prodotto con fixture per dichiarare tale cutover concluso**».

> ⛔⛔⛔⛔⛔ **OGNI MIA MODIFICA È NON-DEPLOYABILE FINCHÉ UNA REVIEW AVVERSARIA NON LA RENDE USABILE** —
> owner, 18/09/2026, testualmente: «L'owner non si fidA di te, dai per scontato che tutte le modifiche
> che fai non sono deployabili, ogni tua modifica ha bisogno di code review avversariali per essere
> resa utilizzabile».
> ⇒ **Il punto di partenza di ogni mia consegna è "non utilizzabile".** Non è un'opinione
>   sull'umore: è lo stato di fatto da cui si parte, e la mia stessa verifica (unità, suite, foto,
>   misure) **non** basta a cambiarlo. Serve la **review avversaria di quella modifica** — con le tre
>   condizioni di sempre: cerca il difetto, prova a **romperlo** mostrando la prova che diventa
>   rossa, e **dichiara** se ha verificato davvero.
> **Come si applica, in concreto:**
> 1. scrivo la modifica e la marco **«NON DEPLOYABILE — in attesa di review»** (nel messaggio di
>    commit e in chat), **prima** di consegnarla o di dichiararla utilizzabile;
> 2. la review avversaria arriva **su quella modifica**, non sulla superficie in generale;
> 3. solo un esito positivo la rende **usabile**; se la review non è stata fatta, la modifica resta
>    non deployabile **anche se tutte le prove sono verdi**;
> 4. una modifica già in consegna e poi bocciata si **ritira** o si cura, e si dice.
> ⛔ Nasce da una giornata in cui le mie cure hanno morso più volte: il duplicato `#schermoHome`
> (trovato dall'owner), il composer rotto dal piede reso flessibile, BC78-2 reso impossibile dalla
> barra a una regione, la riga del fornitore cambiata sotto una prova. Nessuna di quelle l'ho vista
> io: le hanno viste l'owner o i revisori.

> ⛔⛔⛔ **RENDERE CEDEVO UN CONTENITORE PERDE TUTTO CIÒ CHE CI STA DENTRO** — 18/09/2026, trovato
> dall'owner dal vivo, furioso («IL CHAT COMPOSER SI È ROTTO REGRESSIONE»).
> Per far accorciare il pannello del terminale a finestra bassa ho reso flessibile **il piede della
> chat** (`flex: 0 1 auto; min-height: 0`, colonna flex). Il riparto del restringimento va **per
> base**, e la conversazione ha una base enorme: il piede cedeva **insieme** a lei e il composer
> finiva **sotto il bordo della finestra**, tagliato.
> ⇒ **La lezione:** se un figlio deve cedere, si mette il vincolo **su quel figlio**, non si rende
> cedevole il contenitore — o cedono anche gli altri, e tu guardavi l'altro. La cura giusta è stata
> `height: min(var(--talos-terminale-h), 45dvh)` **sul pannello**, con il piede tornato `flex:none`.
> ⛔ E la rete che NON ha preso il difetto: `terminale-p0` era **12/12 verde** — perché nessuno dei
> suoi casi è una finestra alta abbastanza da far cedere il piede. L'ha preso l'owner guardando la
> sua schermata: la prova va fatta **nelle condizioni in cui il difetto vive**, non in quelle comode.

> ⛔⛔⛔⛔ **DURANTE LA VERIFICA È OBBLIGATORIO IL CONTROLLO VISIVO SU SCREENSHOT DEL 4174** —
> owner, 18/09/2026: «ultima regola durante il processo di verifica è OBBLIGATORIO verificare
> VISIVAMENTE usando screenshot dell'ambiente 4174 e verificare automaticamente e autonomamente
> errori visivi, glitch, disallineamenti etc».
> ⇒ La verifica di una cura non finisce con la suite verde: si **fotografa l'ambiente VERO**
> (il 4174, che è il server dell'owner, sempre aggiornato) e si **guardano** le foto cercando
> difetti **anche fuori** da ciò che si è corretto — errori visivi, glitch, disallineamenti,
> elementi coperti, righe tagliate, colori fuori palette, testo illeggibile.
> ⛔ «Automaticamente e autonomamente»: non si aspetta che l'owner li trovi, e non si dichiara
> «tutto a posto» perché le prove passano. Si guarda, si elenca ciò che si vede, e ciò che si
> trova si corregge o si registra — con la foto a lato come prova ([[taccuino-ispettore-sempre-acceso]],
> [[ispeziona-la-foto-per-tutti-i-difetti]], [[verifica-visiva-sul-4174-sempre]]).
> ⛔ Sul 4174 valgono i limiti di sempre: si legge e si fotografa, mai una scrittura — la sonda
> ferma ogni richiesta non-GET.

> ⛔⛔⛔⛔ **SEMPRE REVIEW AVVERSARIALI SU TUTTO IL CODICE CHE SCRIVO** — owner, 18/09/2026:
> «d'ora in poi ricorda SEMPRE review avversariali per mettere alla prova tutto il codice scritto
> da te». ⛔ È **permanente** e vale per **ogni** cosa scritta da me — non solo le fasi grandi, non
> solo la UI: CSS, test, script, una riga di template.
> ⇒ **La regola, in pratica:** il codice che scrivo non si dichiara finito con la mia verifica.
> Un revisore **avversario** lo mette alla prova: cerca il difetto, prova a **romperlo** e mostra
> che la prova diventa rossa; si chiede se il difetto **esisteva davvero**; e **dichiara** se ha
> verificato o no (le tre condizioni di [[ogni-corsia-ha-il-suo-controllore]]).
> ⛔ Nasce da un costo vero, lo stesso giorno: sostituendo l'header ho scritto **due** `#schermoHome`
> e a trovarlo è stato **l'owner**, non una revisione — con la Home che galleggiava sopra la chat
> sul server vivo. Nessuno dei miei controlli lo guardava: la suite c'era (`BC71-A`, id doppi) e
> **non l'avevo lanciata**.
> ⇒ Fanno parte della regola anche le due discipline che l'hanno resa necessaria: **la cartella
> intera si lancia prima di dire «fatto»** (una prova ristretta è una misura ristretta), e il
> revisore si dà **prima** della consegna, non dopo che l'owner l'ha vista rotta.

> ⛔⛔⛔ **SE NON VERIFICHI ESATTAMENTE COME CHIESTO, FERMATI E DILLO** —
> owner 2/9: una verifica APPROSSIMATA (surrogato automatico al posto
> del tocco reale richiesto, scenario "simile" invece di quello
> preciso) non chiude una fase — la falsa chiusura costa più di una
> fermata onesta. Dettagli in [[se-non-verifichi-esatto-fermati-e-dillo]].

> ⛔⛔ **UNA RICERCA WEB A OGNI SINGOLO DUBBIO** — [[ricerca-web-a-ogni-dubbio]], obbligo owner 20/8. Non solo prima di implementare: **ogni volta** che una domanda resta aperta, anche a meta' indagine. Il segnale e' la parola «probabilmente».

> ⛔ **REGOLA ZERO — NON NEGOZIABILE.** A **OGNI** fix, da solo:
> **(1)** ricerca web PRIMA — [[web-research-before-implementation]], budget finito → brief — [[web-research-handoff-when-out-of-budget]]; **(2)** skill ufficiali — [[use-official-skills-always]];
> **(3)** vincoli TALOS: ricerca + one-up + parity + **AMBITION** — [[vincoli-ingegneristici-talos]]; **(4)** review SF avversariale, poi i gate — [[sf-review-and-vincoli-norm]];
> **(5)** ⛔⛔ **SI STRUMENTA SEMPRE, MAI IPOTESI** — [[si-strumenta-sempre-mai-ipotesi]] · [[far-dire-alla-macchina-perche]]; riprodurre prima di «risolto» — [[reproduce-before-claiming-fix]]; lavoro coeso — [[no-fragmented-work-debt]];
> **(5-bis)** ⛔ ogni funzione si prova **ANCHE AL CONTRARIO** — [[provare-sempre-anche-il-verso-contrario]];
> **(6)** ⛔ niente è chiuso senza **DISPOSITIVO REALE** — [[device-verified-or-not-done]] — in **QUATTRO combinazioni** — [[quattro-combinazioni-su-dispositivo]] — con **tocchi adb** — [[tocchi-reali-adb-obbligatori]]. Una grep non è una prova — [[phase-closed-only-on-device]];
> ⛔⛔ [LO SCREENSHOT VA SCATTATO **DURANTE**](lo-screenshot-va-scattato-DURANTE.md) - owner 21/8: il JSON grezzo si vedeva **mentre elabora** e spariva nella risposta finale. Avevo dichiarato curato guardando solo la fine. ⛔ Per cio che SCORRE si fotografa a intervalli durante l'attesa, non una volta sola alla fine.
> **(6-bis)** ⛔ ogni funzione **SCREENSHOTTATA**, e ogni screenshot **ISPEZIONATO** — [[screenshot-obbligatorio-e-fonte-di-anomalie]].
> **(6-ter)** ⛔⛔⛔ regola BLOCCANTE owner 27/8: in una pipeline QA visiva, ogni screenshot annota nel **taccuino** TUTTI i difetti (automatici e trovati guardando l'immagine), si corregge **in BATCH**, e si riverifica visivamente **solo una volta, alla fine** — [[pipeline-qa-batch-non-uno-alla-volta]].
> Se stai per implementare senza 1-3: **FERMATI**.

> ⛔⛔⛔ **LOCAL-FIRST È LA PREMESSA DI TUTTA LA APP** — [[mobile-app-local-first-requirement]], DIMENTICATA 3 VOLTE. Il mobile gira standalone, senza PC/server/tunnel, di default e SEMPRE. Un ponte verso un backend desktop è opzionale e futuro — mai proposto come alternativa alla pari per far funzionare qualcosa oggi.

> ⛔⛔⛔ **HARNESS-UI MOBILE: SI ALLINEA SEMPRE AL DESKTOP** — [[mobile-harness-ui-si-allinea-sempre-al-desktop]], owner 29/8, persistente, mai da dimenticare: il desktop ha GIÀ RISOLTO su questo sottosistema — si consulta COME FA IL DESKTOP prima di decidere un comportamento, mai a tavolino. Due bug trovati dal vivo che l'hanno fatto nascere, in coda: la nota "File scritto" senza senso dopo ogni scrittura, e il resume che mostra Files/Review coi dati MOCK invece di uno stato vuoto onesto o la radice vera.

> ⛔⛔ [LE REGOLE D'ORO SI ESEGUONO, non si rileggono](le-regole-doro-la-lista-che-si-esegue.md) — 19/8: tre mancate in un turno solo. **Prima** del codice i punti 1-5, **prima** di dire «fatto» i punti 6-10.

> ⛔⛔⛔ [PRIMA DI UCCIDERE UN PROCESSO, RISALI LA CATENA](il-guardiano-accusava-la-sessione-dellowner.md) — 23/8: la sorveglianza gridava «3 ORFANI» e uno era la **sessione Codex dell'owner, viva**; un'altra volta erano un albero **vivo della campagna** su un task pagato. ⛔ Un allarme che dice QUANTI e non CHI non è azionabile. Si risale ai genitori e si guarda dove finisce, **sempre**, prima di `taskkill`.
> ⛔⛔ [TACCUINO ISPETTORE SEMPRE ACCESO](taccuino-ispettore-sempre-acceso.md) — ogni screenshot si guarda **tutto**, cercando difetti **fuori** da ciò che sto facendo. Tre difetti in una foto che avevo dichiarato buona. Il 20/8 ha trovato **otto** difetti in un turno, tre miei.

> ⛔⛔ [QUATTRO VIEWPORT, non quattro tocchi](quattro-viewport-non-quattro-tocchi.md) — owner 20/8: tablet in **entrambi** gli orientamenti E risoluzione telefono in entrambi. ⛔⛔ owner 30/8: **tablet PORTRAIT è il principale, sempre il primo**; gli altri tre sono un passaggio ulteriore; si ripristina **sempre** a tablet portrait alla fine — `wm size reset` da solo non basta, serve anche `user_rotation 0`.

> ⛔⛔ [SE LA TOCCHI, LA PROVI TUTTA](se-la-tocchi-la-provi-tutta.md) — chi tocca una superficie la **guarda tutta**, la confronta con la sorella, prova **ogni** voce fino all'esito vero e rileva gli errori di **stile**. Da solo. Se l'owner deve dire «prova tutto», il turno prima era incompleto.

> ⛔⛔ [OGNI SCREENSHOT LO APPROVA LUI](ogni-screenshot-va-approvato.md) — nessuna vista entra nel README senza il sì **esplicito**, una per una. Tre volte ho detto «eccellente» e lui l'ha bocciata a colpo d'occhio: viewport sbagliata, chat in italiano. ⛔ Il cancello è nello script di pubblicazione, non nella mia memoria.

> ⛔⛔⛔⛔ **OGNI FOTO SI ISPEZIONA TUTTA, CERCANDO TUTTI I DIFETTI** — owner 13/09/2026,
> dopo che un difetto mai guardato è arrivato sul suo schermo: «devi sempre ispezionare la foto
> per TUTTI I DIFETTI DEVI ESSERE ESIGENTE CRITICO E CAPARBIO, NON DARE PER SCONTATO DI AVER
> SISTEMATO TUTTI I DIFETTI» ([[ispeziona-la-foto-per-tutti-i-difetti]]).
> ⛔ Il caso: avevo provato il compositore a campo vuoto, pieno e in risposta, **mai con la
> dettatura accesa** — e lì restavano DUE comandi di stop. E la guardia che doveva impedirlo era
> **capovolta**: nome e commento promettevano «uno solo», l'asserzione pretendeva che ne
> esistesse uno. Era verde mentre il doppione andava a schermo.
> ⇒ Si enumerano gli **stati** prima di dire «provata»; si guarda la foto **fuori** da ciò che si
> sta correggendo; e quando un test viene adattato a una UI nuova si rilegge il suo commento e si
> controlla che l'asserzione dica ancora la stessa cosa.

> ⛔⛔ **PRIMA DI OGNI BRIEF, VERIFICA COSA ESISTE GIÀ** — owner 12/09: «stai attento a dare i prompt su cose che potremmo avere già fatto» ([[prima-del-brief-verifica-cosa-esiste-gia]]): grep nel codice e nella coda, riga «cosa esiste già» in testa al brief, una domanda all'owner se la voce è ambigua fra due sottosistemi. ⛔ Spostata qui il 14/09/2026 insieme al blocco delle regole di verifica: è la stessa disciplina, applicata a un brief invece che a una foto.
