# TABELLA DI MARCIA — dopo il rilascio desktop (13/09/2026)

> # SUPERATA IL 13/09/2026 — non e' piu' l'ordine di lavoro
>
> Sostituita da **`TABELLA-FASI-COMPLETA-2026-09-13.md`**, nella stessa cartella: dodici fasi, ogni
> punto spiegato per intero (cosa succede oggi, perche', cosa cambia dopo), con dentro anche le righe
> che questa tabella non copriva — i debiti del 10/09, i quattordici mai registrati, le proposte del
> 12/09 e il porting verso il mobile.
>
> Resta qui come storia: e' il documento in cui e' nata la divisione in corsie e il vincolo del file
> da 20.638 righe. Non si cancella, non si aggiorna, **non si usa per decidere**.

> Richiesta dell'owner il 13/09: «rielabora ed aggiorna la tabella di marcia per la post release».
>
> ⛔ **Qui dentro c'è SOLO lavoro aperto.** Ogni riga è stata riaccertata leggendo lo stato
> dichiarato nelle code e in `STATO-VERO-DELLE-RIGHE-2026-09-11.md`, non ricordata. Niente di già
> chiuso compare: l'owner l'ha vietato esplicitamente l'11/09 («non voglio assolutamente vedere
> fasi già fatte in documenti di debiti/implementazioni in corso»).
>
> **Non sostituisce** la tabella del 12/09 dentro `CODA-UNICA-DEBITI-2026-09-06.md`: quella è il
> registro storico del lavoro pre-rilascio, con dentro le sue righe chiuse. Questa è l'ordine di
> lavoro da qui in avanti.
>
> ⛔⛔ **Collisione di numeri, sanata oggi.** PO-14, PO-15 e PO-16 esistevano già dal 12/09 nella
> coda dei debiti (fornitori P-D…P-L, delega a un agente esterno da CLI, connessione a GitHub). Le
> tre proposte nate il 13/09 sono state rinumerate in **PO-17, PO-18, PO-19**. La causa resta
> aperta: i numeri PO si assegnano in due documenti senza un registro unico.

---

## 0 · Prima di tutto: chiudere il rilascio

| # | cosa | stato al 13/09 |
|---|---|---|
| 0.1 | Tag `desktop-v0.1.4`, e la 0.1.5 pronta | **cancelli VERDI per la prima volta**, installer e zip **costruiti**, e il prodotto ha superato la prova vera: installato in 81,6 s, avviato, chiuso, disinstallato, zero processi e collegamenti residui, dati conservati. A cadere e' stato lo SCRIPT che sorveglia, su una macchina con due node.exe. Curato, versione a 0.1.5, tutto verde in locale e spinto sul privato |
| 0.1-bis | **Ispezione preventiva dei passi mai eseguiti** (13/09) | ⛔ Cinque tag persi scoprendo un ostacolo per volta: prima del sesto ho validato in locale cio' che si poteva. **Provato**: il passo di impronte e note in QUATTRO direzioni, incluse tre che devono rifiutare (smoke non completato, tag che non corrisponde alla versione, prova di un ALTRO binario). **Ispezionato**: `ci-smoke.ps1` si analizza senza errori e i risultati del registro sono sempre avvolti prima del conteggio; l'aiutante `ci-smoke-installed.mjs` letto per intero, ha timeout ovunque, ripulisce le credenziali dagli errori e in caso di guasto scrive `completato: false`, che e' cio' che blocca la pubblicazione a valle. **Resta NON verificabile in locale**: attestazione di provenienza, caricamento degli artefatti e creazione della release, che vogliono un tag e un token veri. **Rischio residuo accettato**: l'aiutante risolve `powershell.exe` dal PATH per leggere la memoria del backend; se non lo trovasse fallirebbe a voce alta, con lo stderr nel messaggio, quindi si lascia com'e' || 0.2 | Cancelli pubblici su `main` ancora rossi | la cura su zod ha funzionato (zero occorrenze nel log). Restano due test del motore di contesto su Linux e la suite e2e della mobile. Da separare: cosa è nostro e cosa è della lane mobile |
| 0.3 | Catena di pubblicazione della lane mobile | sua cura e suo cancello «zero cancellazioni sull'albero intero», provato nel verso che deve fallire: **riuscito**, rifiuto con uscita 1. Resta da applicare l'opzione (b) sui file che differiscono solo per fine riga |


> ⛔⛔ **13/09, lezione pagata con crediti veri.** BC-01 e BC-02 erano marcati «in lavorazione» in
> coda ed erano **chiusi da un commit**. Ho aperto la Fase 1 su quella riga e un agente ha lavorato
> su un difetto già curato, finché l'owner non mi ha detto di cercare le contraddizioni. ⇒ **Prima di
> aprire una fase, lo stato di ogni riga si riaccerta NEL CODICE**, non si legge dalla coda. La coda
> dice cosa qualcuno credeva, il codice dice cosa c'è.

## 1 · Difetti che l'utente vede, o su cui il prodotto gli mente

| id | cosa | perché è qui |
|---|---|---|
| ~~BC-01~~ | ~~il modello locale va in loop~~ | ✅ **CHIUSO** dal commit `a468e6ed`. Accertato il 13/09 DOPO aver mandato un agente a lavorarci: la coda diceva «in lavorazione», il codice diceva chiuso |
| ~~BC-02~~ | ~~lo stop non è immediato~~ | ✅ **CHIUSO** dallo stesso commit `a468e6ed` |
| **BC-07** | tre rotte rispondono 503/422 a ogni giro e **dalla UI non si vede niente** | trovato il 13/09 scattando le foto della vetrina. Il pannello Contesto mostra un contesto che il server non ha dato |
| **BC-03** | la delega ai sotto-agenti: la scheda «Agenti» resta vuota, il percorso è di un altro | da ispezionare su una corsa vera e da provare nei tre versi |
| **BC-05** | reindirizzamento e accodamento «funzionano malissimo», la popup sta dal lato sbagliato | ⛔ **segnalato DUE volte**: 11/09 «funziona malissimo», 13/09 «adesso quasi inutilizzabile», e in mezzo non è stato fatto niente. La persona la incontra ogni volta che scrive mentre il modello lavora. ⛔ Si usa dal vivo prima di aprire un file: «quasi inutilizzabile» è un giudizio sull'uso |
| **BC-11** | **chi vuole ACCODARE finisce per reindirizzare, e riceve una carta rossa** | L'owner ha corretto: ha **accodato**. Nel registro non c'è nessun evento di coda, ci sono un reindirizzamento chiesto e applicato col suo testo, e poi «si è interrotto per un errore… apri Doctor». ⛔ La catena della coda è stata seguita ed è **pulita**: `/queue` chiama solo `accodaMessaggio`, e `reindirizza()` è raggiungibile solo da `/redirect`. Quindi la richiesta partita era `/redirect`. ⛔ Tre difetti: un reindirizzamento non è un guasto; il riconoscitore in `errori.js` cerca parole inglesi mentre il kernel emette «interrotto su richiesta» in italiano; e l'evento **non porta la propria provenienza**, quindi dal registro non si può sapere quale comando l'ha scatenato. ⭐ Ipotesi da provare per prima, dal vivo: mentre il giro è attivo il pulsante di reindirizzamento **compare da solo** appena c'è del testo, accanto al posto dove si sceglie «Accoda». Terreno di BC-05 |
| **BC-10** | gli dici «ciao» e sfoglia TUTTA la Libreria, 11 pagine; e per cancellare 214 file serve **una chiamata per file** | segnalato dall'owner dall'app installata, due screenshot. Due cause lette nel codice: l'attrezzo dice «segui il token finché non è nullo», e la guardia anti-valanga confronta gli argomenti, quindi la paginazione le è invisibile per costruzione. ⛔ Censite **15 attrezzi** e **7 famiglie di rotte** con la stessa forma: non è la Libreria, è il prodotto |

## 2 · Righe dell'owner che NON sono chiuse davvero

⛔ Hanno tutte una cosa in comune: qualcuno, me compreso, le ha date per fatte. Lo stato qui sotto
viene dal documento che le ha riaccertate **provandole**, non rileggendole.

| id | cosa manca davvero |
|---|---|
| **PO-09** | terminale in basso: **fatta nel sorgente, non nel pacchetto che il 4174 serve**. `terminale-basso` compare zero volte nel bundle servito. È un problema di CONSEGNA, non di codice |
| **PO-12** | la funzione c'è, **il modello non può usarla**: manca l'attrezzo di modifica lato kernel |
| **PO-01** | OpenRouter a metà (manca il giro vero); **ChatGPT/OpenAI e Claude/Anthropic a ZERO**, grep vuoto |
| **PO-02** | codice fatto e provato, ma **sul 4174 la funzione è vietata per costruzione**: `config.mjs` proibisce il motore del contesto su quella porta. ⛔ Serve una decisione dell'owner, perché togliere quel divieto significa togliere una guardia scritta apposta |
| **PO-03** | l'engine c'è, **le misure che il requisito chiedeva no**: confronto ON/OFF, latenza (misurata una volta, 61,2 s al primo token, fuori bersaglio), hit-rate della cache (il 40% è una fixture), costi prima e dopo, un rollback ESEGUITO, l'annullamento in streaming |
| **PO-10** | comandi dell'agente nel Terminale: **mai iniziata** |
| **PO-07** | computer use integrato: **mai iniziata** |

## 3 · Le tre proposte nuove del 13/09

| id | cosa | nota |
|---|---|---|
| **PO-19** | **TALOS come centro assistenza di sé stesso** | l'owner l'ha chiamata «importantissima». Alla domanda «cosa fa Full access?» TALOS deve rispondere con la documentazione vera, citando la fonte, e saper dire cosa è TALOS (repository, licenza, versione). ⛔ Ha un corollario che vale da subito: se il prodotto deve spiegarsi, le sue funzioni devono essere **scritte**, e oggi molte vivono solo nel codice |
| **PO-17** | **installer con una vera interfaccia e il passo del consenso** | riferimento visivo di Hermes già descritto nella coda. Vincolo misurato: un NSIS a un colpo solo **non ospita pagine**, serve l'installer assistito |
| **PO-18** | **la finestra dell'app come interfaccia** | stesso riferimento. ⛔ Vale la regola: una UI nuova non nasconde funzioni che oggi esistono |
| **PO-20** | **selezione massiva in tutte le sezioni con un elenco** | Libreria, Note, Attività, Memoria, Ricerca, Progetti, Board. Disegnata una volta come comportamento condiviso delle liste, non copiata sette volte. ⛔ Senza l'operazione massiva sotto (BC-10) rifarebbe il ciclo di oggi con un pulsante al posto dell'agente |
| **PO-21** | **freccia su per la cronologia dei messaggi** | ⭐ La funzione **esiste già**, ma registra solo i comandi con `!`: un unico chiamante dentro quel ramo, store globale in localStorage con tetto 50. Il lavoro è estenderla ai messaggi, conservando la guardia che prende ↑ solo a campo vuoto. Tre scelte da fare con l'owner: una lista o due, globale o per sessione, e se 50 resti il tetto giusto |

## 4 · Debito di ingegneria — quello che ci è costato la giornata

⛔ Cinque tag di rilascio spesi il 13/09, e **mai per colpa del prodotto**: ogni volta era un test
che descriveva qualcosa di diverso dal software. Queste righe servono a non ripeterlo.

| id | cosa |
|---|---|
| **BC-09** | **48 file di test** rimuovono cartelle temporanee senza ritentare: su Windows ognuno può far cadere una corsa e costare un tag. ⛔ Non si sistema con una sostituzione di massa: un ritentativo messo ovunque nasconderebbe anche un file che nessuno ha chiuso |
| **BC-08** | **guardie svuotate dal refactor della UI**: nome e commento che promettono, asserzione che non morde più. Segnalata dalla lane mobile, confermata da noi lo stesso giorno su un test che aspettava una frase che il prodotto non scrive più. Metodo: provare ogni guardia sospetta **nel verso che deve fallire** |
| — | **4 test rossi** in `scripts/tests/prepara-monorepo-pubblico.test.mjs` (ANTEPRIMA, R100, SNAPSHOT): provano il RIORDINO iniziale su un pubblico già riordinato. Da **rifare**, non da indebolire |
| — | **Un cancello che misura un insieme vuoto dice «tutto bene», non «non lo so»**. Trovato dalla lane mobile: due suoi cancelli erano verdi perché non avevano niente da guardare. Dopo aver scritto un cancello, la domanda non è «passa?» ma «su quante cose ha guardato?» |
| — | **Misure che non vedono ciò che non ti aspetti**: ogni misura che decide se pubblicare va presa sull'ALBERO INTERO, con le cancellazioni fuori dal proprio perimetro a **zero**, come cancello che si pianta e non come numero da leggere |
| — | **DR1**: col modello più piccolo il secondo turno dopo un attrezzo si interrompe; il kernel non legge `finish_reason` |
| — | **R-05c**: intestazioni di licenza nei sorgenti, per Astra dal 19/09 quando tornano i crediti |
| ✅ | **Verificato e CHIUSO senza difetto (13/09)**: la lane mobile ha trovato un difetto in cui l'attesa del test vive in una fase del ciclo di eventi diversa da quella in cui il componente lavora (`setImmediate` contro `setTimeout(0)`), armato da un flag di tasto premuto che solo il `keyup` azzera. **Da noi non c'è.** I componenti che trattano le frecce sono sincroni e non hanno un solo timer; i quattro test che verificano il fuoco senza attese lo fanno su componenti che `.focus()` non lo chiamano mai. Condividiamo solo la metà innocua: 9 file premono una freccia, 1 solo emette il keyup. ⇒ Registrato perché «abbiamo guardato e non c'è» risparmia la caccia a chi verrà dopo |
| — | **Rapporto di smoke VECCHIO sul disco di sviluppo**: `desktop/.prove/R04-ci-smoke.json` del 12/09 dichiara «completato» per la **0.1.0**. Sul runner viene riscritto a ogni corsa, quindi la CI non è a rischio; ma chi eseguisse il passo delle impronte **in locale** leggerebbe la prova di un binario diverso. ⭐ Verificato il 13/09 che la guardia sull'impronta lo RESPINGE, provandola nel verso che deve fallire. Resta da decidere se il rapporto debba portare anche versione e tag, così che il rifiuto spieghi *quale* build stava dichiarando |

## 4-bis · ⛔ RITROVATE IL 13/09 — righe aperte che NON erano in questa tabella

L'owner: «cerca tutte le memorie e docs di questi giorni… sono sicuro che manca qualcosa». Aveva
ragione: avevo costruito la tabella da DUE code soltanto. Le altre fonti (`CODA-UNICA-DEBITI-2026-09-06.md`
e `STATO-VERO-DELLE-RIGHE-2026-09-11.md`) ne contenevano molte altre. Qui sotto, distinte per quanto
sono affidabili, perché mescolarle sarebbe ripetere l'errore.

### A · Riverificate aperte NEL CODICE l'11/09 (fonte autorevole, riga 13 di STATO-VERO)

| id | cosa |
|---|---|
| **BH-04** | «English traduce solo la barra laterale». ⭐ Converge con quanto ho misurato oggi da solo: nella pagina costruita **sei sole etichette** sono traducibili. Due osservazioni indipendenti, stessa conclusione |
| **CB-16** | un errore vero perde per strada il suo motivo e la sua azione |
| **CB-20-bis** | il server cade: la barra di stato lo dice, la chat dice il contrario per un minuto |
| **CB-07** | il suggerimento del composer sopravvive alla sessione che l'ha generato |
| **T15-D1/D2** | la consultazione del rapporto e delle fonti non è disponibile |
| **T17-D7** | sei pulsanti, cinque in inglese: Agents, Hooks, Skills, Plugins, MCP |

### B · Dichiarate aperte l'11/09, NON riverificate oggi (da riaccertare prima di lavorarci)

Interfaccia: **T12-D1/D3** (Libreria: «0 file · Token non disponibili» scritto sempre) · **T13-D1/D2/D4**
(Memoria divisa per genere invece che per strato) · **T14-D3** (Attività coi filtri ma nessuna riga dice
l'autore) · **T10-D2/D3** (nessuna azione sul proprio messaggio, e non si può modificarlo) · **CB-13**
(tre numerazioni diverse di «giro» nella stessa schermata) · **CB-12** (il cursore del ragionamento
promette sei livelli, il modello ne ha tre) · **CB-15(1)** e **BH-15** e **CB-16-bis/ter** (identificatori
grezzi e frasi del mockup a schermo) · **BH-16** (ricerca senza risultati: lista vuota e contatore fermo).
Server: **BH-19** e **BH-07** (errori HTTP sbagliati, 503 e 500 dove andrebbe 400). Delega: **T09-D4**
(tre deleghe su tre fallite, la shell del figlio prova a entrare in un percorso che non esiste).
Prima sessione: **T01-D1/D2/D6/D7** (modale a due colonne, progetti senza conteggio, «Planner opzionale»
ancora lì, manca la riga col totale attrezzi e costo per giro). Permessi: **T03-D1** (5 attrezzi nel
foglio invece di 43).

### C · Debiti nel CODICE, mai registrati in nessuna tabella (§6 della coda unica, 14 righe)

I più pesanti: **nessun focus trap e nessun `inert` in tutta la app** (accessibilità) · **`verify:all`
non invoca `verify:ui`**, cioè un cancello che esiste e non gira mai · `build-ui.mjs` copia `public/`
su `dist/`, che è gitignorata · `apriIntroPrimoAvvio()` (~180 righe) **senza chiamanti** · uno schermo
intero di mockup **irraggiungibile** · **12 veli del mockup** che nessun codice apre · due coppie di
funzioni che fanno lo stesso lavoro · cartelle `vendor/` caricate da nessuno · **il permesso per
attrezzo esiste solo per 5 attrezzi su 43** (`config.mjs:273`).

### D · ⛔ BC-13, che l'owner ha messo a PRIORITÀ 1 e io avevo dimenticato

Owner, 12/09: «bisogna fare una ricerca delle ultime tecnologie e metodi all'avanguardia, dobbiamo
rendere il motore di llm locale **estremamente rapido e meglio dei competitor**». Non è nella coda dei
bug: vive solo nella coda unica. Il codice è atterrato (`fa3bac38`: cache KV decisa dai parametri del
modello, speculativa a n-grammi), ma **la verifica dal vivo e il confronto coi concorrenti mancano**, ed
erano il cuore della richiesta.

### ✅ E una correzione, perché il documento si contraddice da solo

La riga «chiudere *scrivi* non impedisce la scrittura via *shell*», etichettata «il difetto di sicurezza
più grave di tutta la coda», risulta APERTA in una tabella e **CHIUSA dal 06/09** nell'intestazione dello
stesso file. È testo originale conservato, e il documento stesso avverte della contraddizione. ⇒ **È
chiusa.** L'ho verificata leggendo la voce per intero invece di fidarmi della riga di tabella.

## 5 · Verità scomode da sanare, non urgenti

| cosa | perché |
|---|---|
| La foto del README ha l'interfaccia in **italiano** in un README **inglese** | nella pagina costruita solo sei etichette sono traducibili: barra laterale e pannello destro sono testo italiano scritto a mano. Finché è così, una schermata inglese non esiste. Dichiarato nel commit, non nascosto |
| ⛔ **`legacy/app.js` è il collo di bottiglia di quasi tutto il piano** | Misurato il 13/09: **20.638 righe, 1.175 KB, 602 funzioni di primo livello, zero intestazioni di sezione**. Lo vogliono BC-02, BC-03, BC-05, BC-11, PO-01, PO-07, PO-09, PO-10, PO-12, PO-20, PO-21. ⇒ In ogni fase **un solo agente** può possederlo, e il parallelismo deve venire dagli altri strati. ⛔ **Correzione di una mia raccomandazione**: avevo proposto di «spezzarlo» come corsia di fase. La misura dice che non regge — non c'è nessuna cucitura lungo cui tagliare e 602 funzioni non si rifanno in una fase. ⭐ Quello che regge è un'estrazione MIRATA del gruppo «scrivere mentre lavora» (bivio, coda, reindirizzo, cronologia, tasti del composer): **495 righe, il 2,4% del file**, sparse in tre zone (9838-9975, 15390-15650, 19775-19870), con **2-7 riferimenti in entrata** per funzione e solo tre campi di stato condiviso (`state.realSession`, `state.session`, `state.sessionSelection`). Sblocca da sola BC-05, BC-11 e PO-21 |
| Il registro dei numeri PO è **diviso in due documenti** | è la causa della collisione sanata oggi. Finché resta così, succederà ancora |
| Cartella `C:/c` sul disco dell'owner | nata da un percorso in forma Unix passato a PowerShell. Contiene anche file non miei, quindi non l'ho toccata |
| Pulizia di fine lavoro | `.harness-ui-research`, `.harness-ui-library`, `harness-ui/scratch-l9/`, worktree vecchi, `desktop/dist` e `.staging`. Solo al sì dell'owner, e misurando prima |

---

## ⛔ COME SI ESEGUONO queste fasi — regola dell'owner, 13/09/2026

Parole sue, a rilascio in volo: «dalla post release in poi sarai ufficialmente orchestratore e
coordinatore e code reviewer di 5 agenti oltre a te (solo opus 5 solo sforzo high) PER FASE
IMPLEMENTATIVA quindi dosa bene i compiti di ciascuna fase successiva dopo il rilascio».

- **Cinque agenti per FASE**, non per sessione: chiusa una fase (consegne riviste, fuse, provate),
  la fase dopo ha di nuovo cinque. Solo Opus 5, solo sforzo high.
- **Il cinque e' un vincolo di progettazione, non un tetto da riempire.** Ogni fase qui sotto va
  disegnata perche' stia in al massimo cinque lavorazioni indipendenti e di taglia simile. Se ne
  servono sei, la fase e' tagliata male e va rifatta; se ne bastano due, se ne spawnano due.
- **Prima di aprire una fase** si scrive la sua scomposizione: per ogni compito, i file che tocca e
  cosa lo dichiara finito. ⛔ Le intersezioni di file devono essere VUOTE. Due agenti sullo stesso
  file e' un difetto che qui ha gia' fatto perdere lavoro.
- **Io resto orchestratore, coordinatore e revisore**: nessuna consegna entra senza la mia lettura,
  i cancelli rifatti da me e la prova dal vivo. Commit, fusioni, build, giri veri e richiesta di
  push non si delegano.

⇒ Conseguenza pratica su questa tabella: le sezioni 1, 2 e 4 sono **gia' scomponibili** in compiti
disgiunti (difetti diversi, file diversi). Le sezioni 3 (PO-17, PO-18, PO-19) no: sono lavori di
disegno che condividono superfici e documentazione, e vanno affrontati **uno per fase**, non tre in
parallelo.

## L'ordine in cui la farei, e perché

1. **Chiudere il rilascio** (sezione 0). Finché non è pubblicato, tutto il resto è rumore.
2. ~~BC-01 e BC-02~~ — ✅ **gia' chiusi** dal commit `a468e6ed`, accertato il 13/09. Al loro posto sale
   **BC-10 prima parte** (lato kernel): l'attrezzo che dice al modello di sfogliare tutte le pagine, e
   la guardia anti-valanga che sulla paginazione e' cieca per costruzione.
3. **BC-07**: una rotta che risponde 503 a ogni giro senza che si veda niente erode la fiducia in tutto il resto del pannello.
4. **PO-09**: è già fatta, manca solo la consegna. È il miglior rapporto fra valore e lavoro di tutta la tabella.
5. **PO-19** (centro assistenza): l'owner l'ha chiamata importantissima, e il suo corollario, scrivere la documentazione d'uso funzione per funzione, serve anche a PO-17 e PO-18.
6. **BC-09 e BC-08** prima delle proposte grosse: sono le due che fanno cadere i rilasci futuri, e oggi hanno dimostrato quanto costano.
7. **PO-17 e PO-18** (installer e finestra): lavoro di disegno, da fare quando la casa è in ordine e con la ricerca sui concorrenti fresca, come l'owner ha chiesto.
8. **PO-12, PO-01, PO-02, PO-03, PO-10, PO-07**: in coda, e PO-02 aspetta comunque una decisione dell'owner.

⛔ **Dove si infilano BC-10 e PO-20**, arrivate dall'owner dopo la prima stesura di questa tabella:
subito dopo il punto 4, e **insieme**, perché sono due metà della stessa lacuna. Prima la metà
server e attrezzi (accettare una lista di id, con un tetto dichiarato e un esito **per voce**), poi
la selezione nella UI che la usa. Invertirle produrrebbe un pulsante che fa esattamente ciò che
oggi fa l'agente: 214 chiamate.

⇒ E si prestano bene al lavoro in parallelo: la metà server, la metà UI e la stretta al contratto
dell'attrezzo che sfoglia sono tre compiti su file disgiunti, quindi stanno in una fase sola dentro
il vincolo dei cinque.
