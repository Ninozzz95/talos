# CODA DEI BUG CRITICI — 08/09/2026

> Segnalati dall'owner mentre lavoravo, tutti con uno screenshot. Ordinati per gravità.
> ⛔ Owner: «ispeziona la run reale in 4174, dopo aver sistemato la coda di bug corrente».

## Stato all'11/09/2026, ore 13

| riga | stato |
|---|---|
| **BC-01** loop del modello locale | **in corso da altri** — non toccare da qui |
| **BC-02** stop non immediato | **in corso da altri** — non toccare da qui |
| **BC-03** scheda Agenti vuota, delega in `C:\` | **in corso da altri** — non toccare da qui |
| **BC-04** regressione stile nel selettore dei modelli locali | ✅ **CHIUSA** — verificata l'11/09, sezione «✅ CHIUSE» in fondo |
| **temi** (`temi.css`, `aspetto.css`) | **in corso da altri** — non toccare da qui |
| **BC-05** reindirizzamento e accodamento, popup sopra il composer | **APERTO** — owner 11/09, mai lavorato |
| **BC-06** spazio su disco (`projects/`, scratchpad) | **APERTO** — owner 11/09, da delegare, non urgente |

> ⛔ **Un avvertimento su BC-01, BC-02 e BC-03, per chi li sta lavorando adesso.** Il commit
> `fb120b2a` dell'11/09 mattina ha messo al sicuro il lavoro **PARZIALE** di cinque agenti morti
> insieme su un limite di sessione, e lo dichiara esso stesso: «QUESTO COMMIT NON CHIUDE NIENTE…
> nessuno dei cinque ha verificato il proprio lavoro». Dentro ci sono nomi nuovi in
> `src/kernel/talosHarness.mjs` (`fermaQuandoArrivaLoStop`, `USCITA_FERMATO_SU_RICHIESTA`,
> `posizioneDelPezzo`, `messaggioIntero`, `vistoUnDelta`) **alcuni dei quali non risultano usati**, e
> un test `tests/unit/inspector-agenti.test.mjs` il cui esito non è mai stato letto. ⇒ Il codice che
> si trova in quei file **non è una base verificata**: va riletto, non ereditato.
>
> ⛔ **E BC-03 è la prova vivente del motivo per cui esiste questo documento riscritto**: la riga
> **O-10** («spawno un sotto-agente e non si vede in tab Agenti») è data per `CHIUSO-NON-PROVATO`
> dal 06/09 in `CODA-UNICA-DEBITI`, e la foto dell'owner dell'08/09 mostra che **non funziona**.
> Una riga chiusa senza la prova che chiedeva torna indietro, sempre.

Lo stato accertato di tutte le righe PO è in `.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md`.

---

## BC-01 · Il modello LOCALE va in loop: 398 chiamate in un giro solo

**Segnalato:** «SU 4174 MODELLO LOCALE FA PARTIRE CENTINAIA DI CHIAMATE E SI BLOCCA IN LOOP
BISOGNA RISOLVERE LA CAUSA ALLA RADICE NON LIMITARLO».

**Misurato**, leggendo l'Indice dei giri della sessione col modello locale (nvidia Nemotron Cascade
2 30B): la riga dice `5 · 398 ricerche completate — 398 attrezzi`, in **un solo giro**, e la
sessione finisce in stato **errore**. Gli altri giri della stessa sessione hanno 0 attrezzi. Le
foto dell'owner colgono la stessa riga mentre saliva: «131 ricerche in corso…», poi «97».

**Dove guardare** (verificato da me nel codice, non dedotto):
- `src/kernel/talosHarness.mjs:4657` — `const chiamate = risposta.tool_calls ?? []` e subito
  `for (const c of chiamate)`: **nessun tetto, nessuna deduplicazione**. 398 emesse, 398 eseguite.
- `src/kernel/talosHarness.mjs:345` — l'assemblaggio in streaming usa `pezzo.index ?? 0`. I server
  locali (llama.cpp / LM Studio / Ollama) **non mandano `index` come OpenRouter**: è il primo posto
  dove il conteggio può essere fabbricato da noi invece che scelto dal modello.
- Il ciclo dei giri ha un tetto (`GIRI_MASSIMI = 24`): il loop **non** è lì.

**Stato:** ✅ **CHIUSO** — commit `a468e6ed` «BC-01 e BC-02 chiusi: il loop da 398 scende a 2, e lo stop e immediato», preceduto da `581f1575`. Guardia viva nel kernel: `fermatoPerRipetizione` (talosHarness.mjs:6458, 8590, 8634). ⛔ Accertato il 13/09 dopo che un agente era stato mandato a lavorarci sopra per colpa di questa riga rimasta «in lavorazione». Testo originale sotto, non cancellato.

**Stato originale (vecchio):** in lavorazione. ⛔ Vincolo dell'owner: la cura è la causa, non un limite. Se serve una
rete di sicurezza, deve accorgersi della **ripetizione identica** e fermarsi **dicendo perché**.

---

## BC-02 · Lo STOP non è immediato, e non deve esistere «il prossimo punto sicuro»

**Segnalato:** «quando voglio interrompere la conversazione il dialogo "Stop richiesto. La sessione
si ferma al prossimo punto sicuro." non deve assolutamente esistere, se clicco fermo la
conversazione si ferma all'istante».

**Diagnosi fatta, e il codice la confessa da solo:**
- `src/kernel/talosHarness.mjs:3998` — commento testuale: «`segnaleStop` (AbortSignal) —
  controllato **SOLO fra un giro e l'altro**».
- `src/kernel/talosHarness.mjs:417` — la fetch verso il modello passa
  `signal: AbortSignal.timeout(180_000)` **e nient'altro**: il segnale di stop non raggiunge mai lo
  stream, che resta aperto fino alla fine della risposta o ai 180 s.
- `frontend/src/legacy/app.js:7978` e `:8535` — le due frasi «al prossimo punto sicuro» a schermo.

**Ricerca 08/09/2026:** Ken Huang, «Cancellation & Abort Propagation (Claude Code vs Hermes
Agent)» — **Claude Code** passa `AbortController.signal` attraverso **ogni** confine async;
**Hermes** usa un flag che gli attrezzi lunghi consultano **cooperativamente**, cioè esattamente il
«prossimo punto sicuro». Oggi siamo Hermes. Requisito end-to-end dello stesso pezzo: allo stop
devono chiudersi lo **stream HTTP**, morire i **sottoprocessi**, rilasciarsi l'**approvazione in
attesa**, e il registro deve dire **cosa** si è fermato. E thomasdevos.com (16/08/2026): il limite
noto di Claude Code è che il lavoro già accodato altrove continua — da non ripetere.

**Cura possibile qui:** `AbortSignal.any` è disponibile (Node v24.18.0 su questa macchina): si
compone il segnale di stop col timeout sulla fetch.

**Stato:** ✅ **CHIUSO** — stesso commit `a468e6ed`: «lo stop e immediato». Accertato il 13/09.

**Stato originale (vecchio):** in lavorazione, insieme a BC-01 (stesso file).

---

## BC-03 · La delega ai sotto-agenti: la scheda «Agenti» resta vuota, e il percorso è di un altro sistema operativo

**Segnalato:** «la delega in sub agenti fa partire una nuova sessione e non si vede nulla nella
barra a destra, ispeziona la run reale in 4174».

**Dallo screenshot, due difetti distinti:**

1. **La scheda «Agenti» dice il falso.** In chat sono in corso due sotto-attività («Scrivi la PARTE
   1 / PARTE 2 di un paper tecnico») e la colonna destra, scheda Agenti, mostra: «Nessun
   sotto-agente in questa sessione. Quando ce ne sarà uno, qui compaiono i suoi giri, le sue
   richieste di permesso e il pulsante per fermarlo».
   ⛔ Questa è **O-10**, che i documenti danno per «CHIUSO-NON-PROVATO» dal 06/09. Adesso c'è la
   prova che **non funziona**, ed è quella che il registro dell'owner chiedeva: «si chiude con una
   foto della scheda piena, non con una riga di codice».

2. **La delega parte con un percorso che non esiste su Windows.** La prima delega è «rifiutata» con:
   `cartella: /home/user/app` → `REFUSED: la cartella /home/user/app non esiste su questo computer:
   usa un percorso di Windows`. Il rifiuto è corretto e ben scritto — il difetto è **a monte**: chi
   costruisce la delega propone un percorso Unix su una macchina Windows. Il modello lo inventa
   perché nessuno gli dice dove sta lavorando la madre.
   ⚠️ C'è un commit del 07/09 che dichiarava proprio questo curato («il figlio lavora dove lavora la
   madre, e ne eredita il modello»): o non copre questo percorso, o è regredito.

3. **La delega compare come sessione separata nella barra a sinistra** («Delega · e02f5d85-…»),
   non come figlia della sessione che l'ha chiesta.

4. ⛔⛔⛔ **LA DELEGA GIRA IN `C:\`, LA RADICE DEL DISCO** — trovato l'08/09 guardando una foto del
   Terminale di una sessione «Delega». Si legge in TRE punti indipendenti della stessa schermata: il
   badge della cartella nel terminale dice `C:\`, il piede dice «Aperta da te · `C:\` · connessa», e
   in basso a sinistra il progetto è «C:\» invece di «progetto-5».
   ⇒ Un sotto-agente con «Accesso pieno» che lavora nella radice del disco può toccare qualunque
   cosa sulla macchina. Non è un difetto di comodità: è **il più grave della coda**.
   Spiega anche il rifiuto `/home/user/app` del punto 2: nessuno dice al figlio dove lavora la
   madre, e il modello inventa un percorso.

5. Nella barra a sinistra compaiono **due sessioni «Delega · e02f5d85-…» separate** (11:00 conclusa,
   19 giri; 11:04 interrotta, 7 giri) invece di figlie della sessione che le ha chieste.

**Owner, 08/09:** «assicurarti che le deleghe possano essere chiamate in parallelo o una dopo
l'altra» e «assicurarti anche che vengano chiamati nello stesso workspace e directory — insomma non
hai provato un cazzo di sta cosa quindi è molto flaky». Ha ragione: non è mai stata provata.

**Stato:** da ispezionare sulla run vera del 4174 e da PROVARE nei tre modi — due deleghe in
parallelo, due in sequenza, e la cartella ereditata dalla madre.

---

## ✅ BC-04 · Regressione di stile nel selettore dei modelli locali — CHIUSA

> ⛔ **Spostata fra le chiuse l'11/09/2026.** Era già stata curata **l'08/09 stesso**, e questo
> documento continuava a dire «in lavorazione»: è esattamente il difetto che l'owner ha segnalato
> oggi. Le due cure sono vive nel codice di adesso:
> - `frontend/src/legacy/app.js:5444` — `nomeModelloUmano(valore)`, con l'id intero nel `title`;
> - `frontend/src/styles/index.css:1080-1082` — la colonna del testo si nomina **per posizione**
>   (`>span:nth-child(2)`) invece di cadere sulla regola della colonna di coda, che era **la causa
>   vera**: non la lunghezza del nome.
>
> **Prova, 11/09**: quattro giri con foto a **1440×900** e **1024×800**, tema chiaro e scuro. Prima
> (ricostruito): lista 410 / contenuto 876, con barra di scorrimento orizzontale. Oggi: **410/410** e
> **397/397**, nessuna barra. Rapporto in `.claude/RAPPORTO-BC04-2026-09-11.md`, foto in
> `.claude/foto-bc04-2026-09-11/`.
>
> ⛔ **Restano aperte due righe diverse**, trovate nello stesso giro e **che nessuno sta lavorando**:
> **CB-16-bis** — `components/modelli-installati.js:70` fa ancora `modello.name || modello.id`,
> quindi il Model Lab «Installati» mostra ancora i 102 caratteri: delle **tre** superfici che la coda
> dei debiti chiedeva, ne risulta curata **una**; e **BH-15** — `components/session-item.js:122`
> `nomeModello()` fa solo `split('/')`, quindi è **inerte** sugli id `local:`, ed è la funzione che
> usa `board.js:35`. Due funzioni per lo stesso lavoro: è la causa strutturale della mezza cura.

**Il testo originale della segnalazione:** «regressione stile su model picker locali».

Nella scheda «Locali» del selettore in «Nuova sessione» le righe **sforano orizzontalmente**: il
nome del modello (l'identificatore interno, 102 caratteri) allarga il contenitore, compare una barra
di scorrimento orizzontale e il testo viene tagliato a metà parola. È **CB-16-bis**, già registrato
come «gli id grezzi a schermo», che qui si manifesta come rottura visiva.
⛔ La cura per il nome esiste già e non viene usata: `components/chat-foot.js` esporta
`nomeModelloUmano()`, chiamata in **un solo posto**.

~~**Stato:** in lavorazione.~~ → ✅ **CHIUSA l'08/09, verificata l'11/09** (vedi il riquadro in testa
alla sezione). ⛔ La diagnosi originale qui sopra era **sbagliata sulla causa**: non era la lunghezza
del nome, era la regola CSS della colonna di coda che catturava la colonna del testo.

---

## BC-05 · Reindirizzamento e accodamento «funzionano malissimo» — e la popup sta dal lato sbagliato

**Segnalato dall'owner, 11/09/2026:** «il reindirizzamento e accodamento funziona malissimo, va
provato dal vivo e reso estremamente robusto. Inoltre la popup di accodamento va messa **sopra** il
composer, non sotto.»

**Cosa si sa oggi**, senza averlo ancora misurato:
- il bivio invio/accoda è `.talos-bivio` nel piede della chat (`index.template.html`), con i tre
  pulsanti «Indirizza ora», «Accoda», e l'annulla;
- la scelta è una decisione dell'owner del 04/09 (B14/B15: il bivio è esplicito, `Ctrl+Invio`
  accoda, la coda è a vista) — quindi il comportamento non va semplificato, va reso solido;
- il reindirizzo passa da `redirectRunButton` e dagli eventi `runRedirect*` (`session-registry.mjs`),
  e la coda da `codaMessaggi` sulla voce di sessione.

⛔ **Va provato DAL VIVO con un giro vero**, non a tavolino: «funziona malissimo» è un giudizio
sull'uso, e i difetti di questa famiglia (messaggi che si perdono, coda che non si svuota, bivio che
non compare o compare quando non serve) si vedono solo usandolo. Quattro-cinque scenari veri, con
foto DURANTE, e ogni difetto nominato prima di toccare il codice.

⛔ La posizione della popup non è un dettaglio di gusto: sotto il composer è dove l'occhio NON è
mentre si scrive — e proprio sotto il composer l'owner ha appena fatto togliere tutte le scritte
perché erano rumore. Va sopra.

**Ribadito dall'owner il 13/09/2026**, a rilascio in volo: «miglioramento sostanziale della
funzione accoda e reindirizza (adesso quasi inutilizzabile)».

⛔ E' la SECONDA segnalazione sulla stessa funzione a due giorni di distanza, e in mezzo non e'
stato fatto niente. Il giudizio e' anche peggiorato: dall'11/09 «funziona malissimo» al 13/09
«quasi inutilizzabile». Non e' una riga da tenere in fondo a una coda: e' una funzione che la
persona incontra ogni volta che scrive mentre il modello lavora, cioe' continuamente.

⛔ Resta valido, e va ripetuto, che NON si tocca il codice prima di averla usata dal vivo: «quasi
inutilizzabile» e' un giudizio sull'uso, e i difetti di questa famiglia si vedono solo usandola.
Quattro o cinque scenari veri, foto DURANTE, ogni difetto nominato prima di aprire un file.

**Stato:** APERTO, mai lavorato. **Segnalato due volte** (11/09 e 13/09), priorita' alzata dalla
seconda segnalazione.

---

## BC-06 · Lo spazio su disco: `projects/` e uno scratchpad da giga (non urgente)

**Segnalato dall'owner, 11/09/2026:** «mi servirebbe ripulire tutte le cartelle in projects che
occupano spazio; poi ho notato che nello scratchpad ci sono una marea di giga, solo file non
necessari. Mi raccomando, magari la deleghiamo a un sub agente.»

⛔ **Non urgente, e non da fare a mano.** È esattamente il genere di lavoro dove un errore costa
caro: in questo progetto un `writeFileSync(dove,'')` ha già distrutto 56 righe e $2,64 di lavoro
pagato, e una cartella cancellata «perché sembrava temporanea» non si recupera da nessun reflog.

Requisiti quando si farà:
1. prima si **misura** (quanto occupa cosa, per cartella, ordinato), poi si propone;
2. si cancella **solo** ciò che è riproducibile (build, cache, `node_modules`, artefatti) e mai ciò
   che è costato denaro o non è tracciato da git;
3. l'elenco di ciò che si sta per togliere si mostra all'owner **prima**, con i byte accanto;
4. lo scratchpad di una sessione viva non si tocca mentre la sessione lavora.

**Stato:** APERTO, da delegare.

## BC-07 | Tre rotte rispondono 503/422 a ogni giro, e nessuno se ne accorge (13/09/2026)

**Trovato scattando le foto della vetrina**, non cercandolo: lo script di cattura raccoglie ogni
risposta HTTP >= 400, come fa `qa-visual-pipeline.mjs`. Su un banco PULITO (porta 4199, store
isolato, mai il 4174) e su DUE giri veri di fila con `z-ai/glm-5.3-flash` sono comparse sempre le
stesse tre:

- `503 /api/v1/sessions/<id>/context` | **la piu' seria**: e' la rotta del pannello Contesto, e
  fallisce per OGNI sessione creata, in entrambi i giri, con id diversi. Il pannello mostra quindi
  un contesto che il server non ha dato.
- `503 /api/v1/providers/lmstudio/models` | LM Studio non gira su questa macchina. Un fornitore
  assente dovrebbe essere una risposta normale che dice «non c'e'», non un errore del server.
- `422 /api/v1/providers/esterno/models` | il fornitore «esterno» senza configurazione.

⛔ Nessuna di queste si vede dalla interfaccia: la pagina non mostra niente di rotto, e i test
verdi non le toccano. E' la lezione «build verde e test verdi non guardano il runtime», di nuovo.

⛔ **Causa non indagata**: trovate mentre il rilascio 0.1.1 era in volo, e rincorrerle li' avrebbe
spostato il lavoro. Si registra, non si insegue.

Quando si guardera': riprodurre col banco (porta propria e store isolato), leggere il log del
server durante la chiamata a `/context`, e provare anche AL CONTRARIO | cioe' che con un fornitore
presente la stessa rotta risponda 200, per non scambiare «assente» con «rotto».

**Stato:** APERTO, da indagare dopo il rilascio.

## BC-08 | Caccia alle guardie SVUOTATE dal refactor della UI (segnalato dalla lane mobile, 13/09/2026)

**Non trovato qui, ma la finestra in cui nasce e' la nostra.** La lane mobile (`avm-1b`) ha trovato
sul Pad un difetto vero — durante la dettatura il compositore mostrava DUE comandi di stop — e la
guardia che doveva impedirlo era diventata inerte: il caso si chiamava «expones exactly one
Stop-dictation control while listening», il commento sopra diceva che il compositore non disegna
nessun comando di dettatura, e l'asserzione sotto pretendeva l'opposto. Adattata alla UI Calm senza
toccare l'INTENTO, passava sia con un comando sia con due. Era verde mentre il doppione andava a
schermo.

⛔ Perche' ci riguarda: il refactor della UI dell'11-12/09 ha riscritto molti nostri test per le
superfici Calm. E' esattamente la finestra in cui un test cambia forma per far pace col DOM nuovo e
perde per strada cio' che doveva mordere. Qui dentro questa famiglia l'abbiamo gia' pagata due
volte: il cancello semantico che non aveva MAI respinto una scrittura in nessuna campagna, e una
funzione che lanciava sempre dentro un `catch` che rispondeva «ignoto».

⛔ **Non si fa con un rilascio in volo.** Si parte dopo.

Metodo, quando si fara': (1) elencare i test toccati dal refactor (`git log` sulle date, file dei
test delle superfici Calm); (2) per ognuno leggere NOME e COMMENTO come una promessa, e chiedersi
quale ingresso dovrebbe farlo fallire; (3) provarlo **nel verso che deve fallire**, davvero, non a
ragionamento: se non diventa rosso, la guardia e' inerte; (4) sospettare per primi i casi con
`toBeTruthy`, conteggi `>= 1`, selettori generici, e i commenti che raccontano un comportamento
diverso da quello che l'asserzione controlla.

**Stato:** APERTO, da fare dopo il rilascio.

## BC-09 | 49 file di test rimuovono cartelle temporanee SENZA ritentare, e su Windows e' una mina (13/09/2026)

**Trovato pagando un tag di rilascio.** Il job di `desktop-v0.1.2` e' morto ai cancelli con UN solo
test rosso su 2881: `LOCAL-RESUME-JSON-02` in `session-registry.test.mjs`. Non era il prodotto, era
la PULIZIA del test: `rmSync(cartella, {recursive: true, force: true})` uscito con **ENOTEMPTY**
sul negozio temporaneo. Su Windows un handle sul JSONL si chiude qualche millisecondo dopo la fine
del test, e la cartella risulta ancora non vuota.

⛔ La spia che dice che e' una CORSA e non un difetto: lo stesso test passa in locale e **era
passato sul runner al giro precedente**. Cambia solo il tempo.

**Curato adesso**, ma solo dove ha morso: in `session-registry.test.mjs` le 43 rimozioni passano da
`rmSync` nudo a un aiuto locale con `maxRetries: 10, retryDelay: 50`. Sono le opzioni ufficiali di
`rm`/`rmSync` per questo caso (documentazione Node, modulo fs, letta il 13/09/2026; `maxRetries`
vale **0** di serie, cioe' nessun ritentativo). L'aiuto non nasconde niente: se dopo i ritentativi
la cartella resta piena, lancia ancora.

⛔ **Il resto della classe e' APERTO: 49 file di test** fanno la stessa rimozione ricorsiva senza
ritentare. Ognuno puo' far cadere una corsa sui runner, e ogni caduta costa un tag, perche' un tag
pubblicato non si riscrive.

Quando si fara': un solo aiuto condiviso (non 49 copie), usato da tutti i teardown che tolgono una
cartella temporanea; e prima di adottarlo, chiedersi caso per caso se quella cartella dovrebbe
gia' essere vuota — un ritentativo generalizzato nasconderebbe un file che nessuno ha chiuso, che
invece e' una cosa da sapere.

**Stato:** APERTO per i restanti 48 file; curato in `session-registry.test.mjs`.

## BC-10 | Gli dici «ciao» e sfoglia TUTTA la Libreria, pagina per pagina (owner 13/09/2026, dall'app installata)

**Segnalato dall'owner con uno screenshot dell'app installata**, sessione intitolata «ciao». Il
messaggio era un saluto. TALOS ha iniziato a chiamare `library_list` in sequenza, narrando ogni
passo: «Pagina 3/11: 60 ID. Proseguo.», «Pagina 4/11: 80 ID. Proseguo.», «Pagina 5/11: 100 ID.
Proseguo.». Venti voci per pagina, **216 file**, **11 pagine**. Nello scatto: giro 8, **86 secondi**,
la sessione segna **33 giri**, e stava ancora andando. Tutte le voci mostrano lo stesso
`name: Relazione.pdf` con id diversi.

⛔ Due cause, lette nel codice e non dedotte.

**1. L'attrezzo lo CHIEDE.** La descrizione di `library_list` dice testualmente: «Follow
next_page_token until it is null when asked for all files». La guardia e' quel «when asked for
all», ed e' troppo debole: un saluto non e' una richiesta di elencare tutto, ma niente nel
contratto dell'attrezzo lo distingue. Il modello ha fatto quello che c'era scritto.

**2. La guardia anti-valanga e' CIECA sulla paginazione, per costruzione.** `GIRI_MASSIMI` e'
`Number.POSITIVE_INFINITY` — ⛔ e questa NON e' una svista: e' una decisione documentata nel
sorgente, che al posto del tetto mette due guardie, la deduplica delle chiamate identiche e la
compattazione periodica. Il punto e' che **la deduplica confronta l'hash di (attrezzo, argomenti)**,
e nella paginazione ogni chiamata ha un `page_token` DIVERSO. Quindi undici chiamate a sfogliare lo
stesso elenco sono, per quella guardia, undici chiamate legittime e distinte. La guardia che ha
domato una valanga da 398 chiamate non puo' vedere questa, ed e' la stessa forma di difetto vista
oggi altrove: *un controllo che guarda solo dove si aspetta il problema*.

⛔ **Da non curare cosi'**: rimettere un tetto ai giri. Il tetto e' stato tolto apposta, con un
ragionamento scritto, e rimetterlo tornerebbe a mordere i compiti lunghi e legittimi.

Piste, da valutare quando si aprira': (a) stringere il contratto dell'attrezzo — chiedere di
sfogliare solo su richiesta esplicita, e dichiarare il TOTALE nella prima risposta cosi' che il
modello sappia quanto costa prima di iniziare; (b) una guardia che riconosca la SEQUENZA, cioe'
n chiamate consecutive allo stesso attrezzo che differiscono solo per il token di pagina; (c)
chiedersi perche' un saluto attivi un attrezzo della Libreria — e' un problema di innesco, prima
che di paginazione.

⛔ **Non verificato**: i 216 file tutti chiamati `Relazione.pdf` hanno l'aria di scarti generati
dalle prove, ma il negozio della Libreria dell'app INSTALLATA non l'ho trovato con una ricerca
rapida sotto il repo e sotto il profilo, quindi non affermo ne' dove sia ne' cosa contenga. Va
guardato: se sono scarti, la Libreria di chi installa il prodotto nasce sporca, ed e' un secondo
difetto dentro il primo.

**Stato:** APERTO, da fare dopo il rilascio. Imparentato con BC-01 (il modello locale in loop), ma
distinto: li' e' la stessa chiamata ripetuta, qui sono chiamate tutte diverse e tutte legittime.

### BC-10, seconda parte | e per CANCELLARLI ne serve una chiamata per file (owner 13/09, secondo screenshot)

Stessa sessione «ciao», qualche minuto dopo. L'owner ha chiesto di ripulire la Libreria, e TALOS ha
fatto la cosa giusta: ha contato (**216 totali, 214 «Relazione.pdf» da cancellare, 2 veri da
salvare**, coi due nominati per esteso), ha dichiarato il conteggio verificandolo — «160 (pag. 1-8)
+ 20 + 20 + 14 = 214» — e ha cominciato. ⛔ Poi si e' dovuto inventare i lotti da solo: «Lotto 1 di
9 (ID 1-24)», e nello scatto siamo a **giro 13**, **314 secondi**, **38 giri** di sessione, con il
contatore della Libreria sceso da 216 a **192** mentre guardavamo.

**Causa, letta nel codice:**
- l'attrezzo `library_delete` prende **un solo `id`**, obbligatorio: una chiamata per file;
- la rotta del server e' `DELETE /api/v1/sessions/:id/library/:voceId`: **un file per volta**;
- fra gli attrezzi della Libreria (`list`, `search`, `read`, `file_origin`, `delete`, `rename`)
  **non ne esiste nessuno massivo**.

⇒ 214 file significano 214 chiamate, ognuna un giro del modello: token, latenza e nove lotti
inventati dal modello per non esplodere. ⛔ Il modello si e' comportato bene: il difetto e' che gli
abbiamo dato solo un cucchiaio per svuotare una vasca.

Piste per quando si aprira': una operazione massiva vera, che accetti una LISTA di id (o un filtro
gia' usato da `library_list`), con un tetto dichiarato per chiamata; la conferma che oggi e'
giustamente pretesa per un file va ripensata per N file — deve dire **quanti** e **quali**, non
ripetersi 214 volte. ⭐ La stessa operazione massiva serve anche alla UI: vedi **PO-20**, che e'
l'altra meta' di questa lacuna.

**Stato:** APERTO, da fare dopo il rilascio, insieme alla prima parte.

### BC-10, terza parte | l'INVENTARIO: non e' la Libreria, e' la forma di tutto il prodotto

Owner, 13/09: «fai in modo che si estenda a tutti i tool che ne hanno bisogno». Aveva ragione, e il
censimento del kernel lo dimostra: su **45 attrezzi**, **15 lavorano su un solo identificativo**.

| sezione | attrezzi che prendono UN id |
|---|---|
| Libreria | `library_delete`, `library_rename`, `library_read`, `library_file_origin` |
| Note | `notes_update`, `notes_delete` |
| Attivita' | `tasks_complete`, `tasks_update`, `tasks_delete` |
| Memoria | `memory_update`, `memory_delete` |
| Ricerca approfondita | `research_delete`, `research_pause`, `research_resume`, `research_cancel`, `research_rename`, `research_read` |

E sotto, **sette famiglie di rotte** con la stessa forma, una voce per chiamata: `library/:id`,
`notes/:id`, `tasks/:id`, `memory/:id`, `research/:id`, `context/jobs/:id`, `context/facts/:id`.

⛔ **Ma «massivo ovunque» sarebbe sbagliato quanto «massivo da nessuna parte».** La distinzione:
- **Lo vogliono davvero** le azioni che una persona compie su molte voci insieme, e che oggi
  costano un giro del modello ciascuna: eliminare, completare, mettere in pausa o annullare,
  cambiare una proprieta' comune. Sono il grosso: le cinque `_delete`, `tasks_complete`, le tre
  di `research` che cambiano stato, e gli `_update` quando il campo e' lo stesso per tutti.
- **Non lo vogliono** le rinomine (`library_rename`, `research_rename`): ogni voce vuole un nome
  DIVERSO, quindi «massivo» li' significa un'altra cosa e va disegnata a parte, se mai servira'.
- **Da pesare** le letture (`library_read`, `research_read`, `library_file_origin`): leggere N
  documenti in un colpo e' comodo, ma riversa N contenuti nel contesto, ed e' il difetto che qui
  abbiamo gia' pagato altrove. Se si fa, con un tetto dichiarato e un riassunto, non i corpi interi.

⇒ La forma da disegnare **una volta sola** e riusare: accettare una LISTA di id (o un filtro gia'
espresso dall'elenco della stessa sezione), un tetto dichiarato per chiamata, un esito **per voce**
— quante riuscite, quali fallite e perche' — invece di un si'/no complessivo. ⛔ Un'operazione
massiva che riporta un solo esito nasconde la voce che non e' andata, ed e' peggio del ciclo di
oggi.

**Stato:** APERTO. E' la meta' server/attrezzi; l'altra meta' e' **PO-20** (selezione nella UI).
Vanno disegnate insieme e in quest'ordine.

## BC-11 | REINDIRIZZARE produce una carta ROSSA che dà la colpa a te (owner 13/09/2026, sessione 36a48266)

**Segnalato dall'owner dall'app installata**, con l'id della sessione. Io avevo letto male e gli
avevo detto «hai premuto Ferma». Lui ha risposto: **«non ho premuto ferma»**. Aveva ragione lui, e
il registro della sessione lo dimostra riga per riga.

**La sequenza vera** (`%APPDATA%\TALOS\sessionsa48266-…jsonl`, record 13468-13474):

    ToolCallResult
    RunRedirectRequested   { testo: "sola lettura per favore" }
    CUSTOM · messaggi-finali · tempi-giro · checkpoint-ripresa
    RunError { code: "fermato", message: "⛔ interrotto su richiesta: prima del giro 10." }

⇒ Cosa ha fatto la persona: **ha scritto un messaggio mentre il modello lavorava**. Interpellato,
l'owner ha precisato due volte: «non ho premuto ferma», «non ho premuto ferma o accodato un
messaggio». Cosa ha fatto il sistema: ha prodotto un reindirizzamento, ha chiuso il giro al primo
punto sicuro, e ha mostrato una carta ROSSA — «Il giro si e' interrotto per un errore… questa forma
di errore non e' ancora tradotta… apri Doctor e allega il testo qui sotto».

⛔⛔ **E il registro non puo' dire quale comando l'abbia scatenato**, perche' l'evento non porta la
propria provenienza: `agui-events.mjs:66` costruisce `RunRedirectRequested` con **solo**
`{ type, redirectId, testo }`. Nel frontend le vie sono tre — il pulsante nella striscia del giro,
la scelta «Indirizza ora» del bivio, e la funzione interna — e nessuna lascia traccia di se'. ⇒ Una
segnalazione come questa **non e' risolvibile dal registro**, e questo e' un difetto a se' stante:
un evento che non sa dire da dove viene rende impossibile distinguere «l'ho chiesto io» da «e'
partito da solo».

⭐ Un dettaglio che spiega perche' la persona non lo chiama ne' fermare ne' accodare: il pulsante
nella striscia compare **da solo**, appena c'e' un giro attivo e del testo scritto, e si presenta
come «Reindirizza con il testo scritto». Il suo stesso titolo dice «Interrompi al prossimo punto
sicuro e applica questa correzione»: il prodotto **sa** di star interrompendo di proposito, e poi
racconta quella stessa interruzione come un guasto.

**Due difetti distinti, tutti e due provati.**

**1. Un reindirizzamento non e' un errore.** E' l'azione piu' normale che ci sia — cambiare idea
mentre il modello lavora — e viene presentata come un guasto, con l'invito ad aprire lo strumento
diagnostico. ⛔ Questo e' un caso concreto di **BC-05** («accoda e reindirizza quasi inutilizzabile»):
non e' solo scomodo, ti dice che hai rotto qualcosa quando hai solo parlato.

**2. Il riconoscitore non capisce il suo stesso produttore.** In `errori.js` esiste gia' la regola
`fermato-da-te`, scritta il 06/09 proprio per non chiamare guasto una fermata. Ma il suo
`riconosce` cerca `operation was aborted|AbortError|aborted by user|fermato dall'utente`, mentre il
kernel emette (`talosHarness.mjs:8625-8626`) `esito: 'fermato'` con il testo italiano
**«⛔ interrotto su richiesta: …»**. Le due stringhe non si incontrano, la regola non scatta, e si
cade nel ramo `sconosciuto`. ⛔ Emettitore e riconoscitore stanno **nello stesso repository** e non
parlano la stessa lingua.

**⛔ DOVE NON STA il difetto — misurato il 13/09, e serve per non cercarlo nel posto sbagliato.**
L'owner ha corretto due volte: «non ho premuto ferma», poi «non ho fermato, **HO ACCODATO**». Ho
seguito la catena dell'accodamento dall'inizio alla fine e **e' pulita**:
- `accodaMessaggioReale` (client) fa `POST /api/v1/sessions/:id/queue`, e in caso di successo
  mostra l'avviso «Messaggio in coda · posizione N». Quell'avviso non compare negli scatti.
- Il gestore `POST /queue` (`http-app.mjs:4712-4740`) chiama **solo** `accodaMessaggio` e risponde
  con la posizione. Non ha nessuna via che porti a un reindirizzamento.
- `reindirizza()` (`session-registry.mjs:4932`) e' l'**unico** punto che emette
  `RunRedirectRequested`, e vi si arriva **solo** dalla rotta `POST /:id/redirect`
  (`http-app.mjs:1045`, chiamata a :4128).

⇒ Il server non puo' trasformare un accodamento in un reindirizzamento. La richiesta arrivata era
`/redirect`. ⛔ Quale comando l'abbia prodotta **non e' determinabile dal registro**, per il difetto
della provenienza qui sopra: nel client le vie sono tre, il pulsante nella striscia del giro, la
scelta «Indirizza ora» del bivio, e la funzione interna.

⭐ **L'ipotesi da provare per prima**, perche' spiega come una persona che voleva accodare finisca
per reindirizzare: mentre il giro e' attivo e c'e' del testo scritto, il pulsante di
reindirizzamento **compare da solo** nella striscia (`app.js:9311`), con nome accessibile
«Reindirizza con il testo scritto». Il bivio, che e' il posto dove si sceglie «Accoda», e' un
altro elemento nella stessa zona. Due comandi vicini, uno dei quali appare da se', e uno solo dei
due e' quello che la persona intende usare. ⛔ Si prova DAL VIVO, guardando dove sono e cosa
ricevono davvero i clic e l'Invio — non a tavolino. E' esattamente il terreno di **BC-05**, che
dice anche che «la popup di accodamento va messa sopra il composer, non sotto».

**Piste, da valutare quando si aprira':**
- ⭐ Non riconoscere per TESTO quando c'e' gia' un CODICE: `code: 'fermato'` viaggia fino alla UI
  (`agent-service.mjs:1811` lo tratta come esito del task, non come guasto). Abbinare sul codice
  elimina la classe, invece di aggiungere una frase alla regex.
- ⛔ E anche riconosciuto, «Hai fermato il giro» sarebbe **sbagliato** per un reindirizzamento: sono
  due cose diverse e vogliono due frasi diverse. Per un redirect la frase vera e' che il giro
  precedente e' stato chiuso per seguire la nuova indicazione, e che quello che era gia' fatto resta.
- Da guardare insieme: se dopo il redirect il giro nuovo sia partito davvero, o se la carta rossa
  sia l'unica cosa rimasta. Nello scatto il modello risponde alle 12:40 subito sotto, quindi
  probabilmente si', ma non l'ho verificato e non lo affermo.

**Stato:** APERTO, da fare dopo il rilascio, **insieme a BC-05**: e' lo stesso racconto visto da due
lati.

## BC-12 | Quattro test scrivono le foto nella cartella SBAGLIATA, dentro il repo (13/09/2026)

Trovato per strada indagando BC-11. I test browser del frontend calcolano la cartella delle prove
come `resolve(frontend, '../.claude')`, dove `frontend` e' `harness-ui/frontend`: il risultato e'
**`harness-ui/.claude/`**, non il `.claude/` alla radice che intendevano. Sul disco ci sono gia'
quattro PNG (PH-UI-1440, PH-UI-390, PK-UI-1440, PK-UI-390).

⭐ **L'intento e' provato dal codice stesso**: nello stesso albero altri test usano la forma giusta,
a tre livelli (`new URL('../../../.claude/foto-bc43-2026-09-12/', import.meta.url)`). Quindi non e'
una scelta, e' una profondita' sbagliata.

✅ **Nessun rischio di riservatezza**, verificato: l'esportazione pubblica vieta qualunque segmento
`.claude` (`$script:vietati` in prepara-monorepo-pubblico.ps1), quindi quelle foto non possono
uscire. ⛔ Ma `harness-ui/.claude/` **non e' ignorata da git** (il `.gitignore` ignora solo
`.claude/settings.local.json`, e la scelta di non ignorare `.claude/` e' deliberata e documentata),
quindi le foto compaiono come non tracciate ogni volta che si guarda lo stato, e un `git add -A`
distratto le prenderebbe. In questo progetto `git add -A` ha gia' fatto danni due volte.

Cura: correggere la profondita' nei quattro test, e togliere dal disco la cartella nata per errore.

**Stato:** APERTO, piccolo, da fare con la prima passata sui test.

### BC-10, quarta parte | il tetto ferma DUE attrezzi, ma un terzo pagina lo stesso (13/09/2026)

Trovato dal revisore avversariale della corsia, e **riverificato da me** prima di scriverlo.

**Cosa e' stato curato oggi:** un saluto non fa piu' sfogliare tutta la Libreria. Il tetto vive in
`decisioneDiSfogliamento` e la firma della domanda si costruisce ora **per inclusione** — un campo
non dichiarato non entra nella firma, quindi non puo' piu' azzerare il conteggio.

**⛔ Cosa resta aperto, misurato:**
- `decisioneDiSfogliamento` compare **tre volte** nel kernel: la definizione e **due** punti di
  chiamata, che sono `library_list` e `library_search`.
- Ma `research_list` dichiara nel proprio schema **`page_size`** e **`offset`**: pagina anche lui, e
  **non e' agganciato al tetto**.

⇒ La valanga non e' stata eliminata: e' stata **chiusa su due porte su tre**. Puo' traslocare su un
altro attrezzo, con lo stesso identico meccanismo e senza che nessun cancello se ne accorga.

**⛔ E c'e' una seconda crepa della stessa famiglia**, dichiarata dal revisore: il fondo assoluto del
kernel usa un numero di voci per pagina **copiato a mano** da quello dello store, che non e'
esportato. Nessun cancello tiene allineati i due numeri: se lo store cambia taglia di pagina, il
fondo del kernel resta fermo **in silenzio**.

**Come si chiude davvero:** non aggiungendo il terzo aggancio a mano — sarebbe la stessa toppa una
terza volta — ma censendo **tutti** gli attrezzi che dichiarano un campo di paginazione e facendo in
modo che un attrezzo che pagina **senza** essere agganciato al tetto faccia fallire un cancello. Cioe'
la regola diventa «chi pagina passa dal tetto», verificata dal codice invece che dalla memoria di chi
scrive il prossimo attrezzo.

**Finita quando:** un attrezzo nuovo che dichiara un campo di paginazione e non passa dal tetto fa
**fallire** una prova; e il numero di voci per pagina e' uno solo, condiviso, non due copie.

## BC-53 | Incolli un prompt lungo nella chat e l'invio muore con «Failed to fetch» (owner 16/09/2026, dal vivo) — ✅ CHIUSO lo stesso giorno

**Cosa hai visto:** incollato un testo di ~12 KB (il prompt dell'audit tecnico) in una chat aperta, «TALOS · errore —
Invio non riuscito: Failed to fetch», e la conversazione sembrava crashata.

**Cosa era, misurato:** «Failed to fetch» è il browser che dice che NESSUNA risposta HTTP è arrivata. Il server accettava
al massimo **4.096 byte** di corpo (`MAX_REQUEST_BODY_BYTES`, `http-app.mjs:46`) e, al primo byte in più, `leggiCorpoJson`
faceva `req.destroy()`: la connessione moriva prima che partisse una risposta, e il 413 `PAYLOAD_LIMIT` — che aveva la sua
riga e la sua copia — non era raggiungibile dall'esterno. ⛔ Il codice lo confessava in un commento (`:830-834`) e un test
(bc07) lo aveva **escluso come «non provabile»** invece di curarlo: un difetto noto, dichiarato e lasciato lì.

**La domanda dell'owner («ha senso un tetto?»), risposta con la ricerca (16/09):** sì, ma non a 4 KB. Hermes Agent mette
`MAX_REQUEST_BYTES` a **10 MB** sul suo API server (e la PR #58902 lo impone anche ai corpi chunked); l'API Anthropic
rifiuta sopra **32 MB** con un 413; Claude Code non documenta un limite e sugli incolla lunghi **tronca o si blocca in
silenzio** (issue #65280, #29375: il difetto da non copiare); un corpo senza tetto è un modo per far cadere il processo
(`JSON.parse` amplifica ~15× in memoria).

**Cura:** tetto a **10 MiB** di serie, `TALOS_HTTP_BODY_MAX_BYTES` nel README, iniettabile nei test
(`createHttpApp({ limiteCorpoByte })`); un corpo oltre il tetto riceve un **413 che dice cosa fare** («accorcia il
messaggio, oppure metti il testo in un file e allegalo») e il server **drena** il resto invece di chiudere in faccia
(oltre 4× il tetto chiude davvero). Le rotte con corpo a forma fissa (codice OAuth, batch) tengono i loro tetti piccoli.
Prove sulla rotta vera (`POST …/resume`): 5/5, bc07 senza più esclusioni, suite HTTP verdi; al contrario: `destroy`
rimesso → rosse; tetto a 4.096 → rossa; ripristino sha256 identico.

**Finita quando:** ✅ un messaggio da 12 KB arriva al registro byte per byte; un corpo oltre il tetto riceve il 413 con la
copia. Resta da riprovare **dal vivo sul 4174** dopo la consegna, incollando lo stesso prompt.

## BC-54 | Nella shell (WSL) gli apici singoli non proteggono `$…`: `echo '$HOME'` stampa `/root`, `false; echo $?` stampa 0 (audit interno 16/09/2026, riprodotto sul banco) — APERTO, cura misurata

**Cosa ha visto il modello dell'audit (sessione `4c3e1649`, app installata 0.1.13, cartella Desktop):** «espansione di `$`
che ignora gli apici», e «il codice d'uscita è sempre quello dell'ultimo statement» (`false; echo "rc=$?"` → `rc=0`).
Ha imparato a evitare `$` ovunque per finire l'audit.

**Cosa è, misurato (banco `scratchpad/audit-banco/riproduci.mjs`, `eseguiComandoSandboxato` chiamata diretta, mai il 4174):**
`echo '$HOME' ; echo "$HOME"` → `/root` `/root` con `dove: null` e con `dove: 'wsl2'`; `export Y=7; echo "Y=$Y"` → `Y=`;
`X=42 sh -c 'echo "X=$X"'` → `X=`. **Causa:** `talosHarness.mjs:4268` lancia `wsl.exe -d <distro> -- bash -lc "<script>"`, e
`--` consegna la riga alla **shell predefinita della distro**, che la espande UNA VOLTA PRIMA che il nostro `bash -lc` la veda:
`$HOME`, `$?`, `$X` diventano testo (`/root`, `0`, vuoto) anche dentro gli apici singoli, perché per la shell esterna stanno
dentro le virgolette doppie dell'argomento. Due strati di shell, non uno. ⇒ Anche il «B5» del report (exit code) è questo:
`$?` viene espanso a 0 dalla shell esterna, non è bash che perde il codice.

**Cura misurata (`wsl-strati.mjs`, stesso script, stessa distro Ubuntu):** con `wsl.exe -d <distro> --exec bash -lc "<script>"`
(anche `-e`) → `$HOME` letterale, `"$HOME"` = `/root`, `X=42`. Un token: `'--'` → `'--exec'` in `:4268`. Fonte: Microsoft
Learn, «Basic commands for WSL» — `--exec, -e`: «Execute the specified command without using the default Linux shell»
(letta il 16/09/2026). Prova: test del kernel che asserisce l'argv (`--exec`, mai `--`) + un test d'integrazione che gira solo
se `wsl.exe -l -q` risponde, con `echo '$X'` che deve tornare `$X` (al contrario: con `--` torna vuoto).

**Finita quando:** i tre comandi sopra danno `$HOME` / `/root` / `Y=7` / `X=42` dal banco, e `false; echo $?` dà `1`.

## BC-55 | Un comando che inizia con `VAR=` (o con un programma che WSL non ha) finisce su cmd.exe con `[sandbox: none]` senza che nessuno l'abbia scelto (audit interno 16/09/2026, riprodotto) — APERTO

**Cosa ha visto il modello:** `X=abc; echo "X=[$X]"; false && echo YES || echo NO` → `"X" non è riconosciuto come comando
interno o esterno` + `NO-branch; echo end`, `[sandbox: none]`; nella stessa sessione `pwd; uname -a` girava in WSL. Il
report lo chiama «B3 routing cmd.exe non documentato» e «B2 statement splitting»: **B2 è una conseguenza di B3** — cmd.exe
non capisce `;`, `&&` di bash, `printf`.

**Cosa è, misurato:** con `dove: null` (il default finché la sessione non sceglie; la 0.1.13 non lo espone), `:4265`
decide comando per comando con `programmaDisponibileInWsl(distro, primoProgramma(comando))`, e `primoProgramma`
(`:3932`) è `split(/\s+/)[0]`: per `X=abc; …` è `X=abc;`, per `export Y=7` è `export` (builtin, non un file nel PATH),
per `(cd a && ls)` è `(cd` ⇒ «non disponibile in WSL» ⇒ `eseguiSuWindows` ⇒ cmd.exe. Riprodotto: `X=42 sh -c …` → exit 1
`[none]` con `dove: null`; con `dove: 'wsl2'` gira in Linux.

**Cura proposta (da decidere con la P0-bis, stessa zona):** il ripiego automatico non guarda più il «primo token»: se la
riga contiene sintassi POSIX (assegnazione `NAME=` in testa, `;`, `&&`, `||`, `|`, `$`, apici, `export`, `cd … &&`) e WSL c'è,
va in WSL; il ripiego su Windows resta solo per un programma nudo assente in Linux. Meglio ancora: la scelta della sessione
(`doveGiranoIComandi`, già letta in `session-registry.mjs:5076`) esposta nell'interfaccia, come Claude Code e Codex fanno
(ricerca 10/09, commento D-10F), così il `null` sparisce. E l'esito dice SEMPRE dove ha girato (già `[sandbox: …]`).

**Finita quando:** i tre comandi del report girano in WSL con `dove: null` e l'esito lo dichiara; un programma nudo assente
in Linux ripiega su Windows dicendolo.

## BC-56 | Un comando vuoto fa cadere `eseguiSuWindows` con un `TypeError` non catturato (e in WSL è un `syntax error`) — APERTO, piccolo

**Misurato:** `eseguiComandoSandboxato('', cartella, { dove: 'windows' })` → `TypeError [ERR_INVALID_ARG_VALUE]: The argument
'file' cannot be empty` lanciato dentro l'executor della Promise (`:4132`); con WSL → `bash: syntax error near unexpected
token ';'` su `{  ; }` (esito onesto ma criptico). BC-17 (11/09) ha curato l'alias `command`/`comando` che PRODUCEVA il vuoto,
non il vuoto in sé. **Cura:** una guardia in testa a `eseguiComandoSandboxato`: comando vuoto ⇒ `{ codice: -1, testo: 'Il
comando è vuoto: scrivi cosa eseguire.', enforcement: 'none' }`, con test nei due rami.

## BC-57 | `prova` risponde `exit 0` senza aver eseguito nessuna suite (audit interno 16/09/2026: confermato dal trascritto, NON riprodotto sul banco) — APERTO, causa da trovare

**Nel trascritto (`%APPDATA%\TALOS\sessions\4c3e1649….jsonl`, `_sequenza` 16543-16552):** `ToolCallStart prova`, args `{}`,
`ToolCallResult` = `"exit 0\n"`, testo vuoto. Intestazione: `cartella: C:\Users\Antonino\Desktop`, `comandoProva: 'npm test'`,
`taskId: libero:full-access`, app installata **0.1.13** (`Programs\talos-desktop\TALOS.exe`, kernel identico al mio in
`eseguiProva` `:3791-3805`). Sul Desktop non c'è `package.json`.

**Sul banco NON succede:** lo stesso `spawn('npm test', { cwd: Desktop, shell: true })` dà `close codice = 4294963238`
(= -4058, `npm error code ENOENT … C:\package.json`) sia con Node 24.18 sia dentro il Node di Electron
(`ELECTRON_RUN_AS_NODE=1 TALOS.exe prova-desktop.mjs`). ⇒ Il difetto è vero (c'è la ricevuta) e la causa non è nel codice
di `eseguiProva` letto da solo: manca il pezzo fra `talosLavora` e lo spawn nella sessione impacchettata (ambiente del figlio,
`comandoProva` effettivo a runtime, o un `npm` diverso nel PATH del guscio). **Prossimo passo:** un banco con `server.mjs` su
porta effimera, cartella Desktop, un giro vero con `glm-5.3-flash` che chiama `prova`, e la ricevuta letta con
`evidence.exitCode`. Indipendentemente dalla causa, la cura di prodotto è quella che il report chiede: **`prova` senza una
suite riconoscibile (nessun `package.json` con `scripts.test`, nessun runner trovato) non risponde `exit 0`, dice «nessuna
suite trovata in <cartella>» e conta come NON provato** per il nudge «scritture senza prova».

**Cosa NON è un difetto, dal report:** B4 (stdout e stderr fusi) è D-10C, scelta dichiarata: `insieme` nell'ordine di arrivo
(l'ordine varia fra `uno tre due` e `due uno tre`, com'è per due pipe); B5 è BC-54; «nessun modello di approvazione, nessuna
allowlist» è falso: `verificaPermessoScrittura` (`:7742`) e `permessiPerAttrezzo` esistono per `shell`, `prova`, `scrivi`,
`document_create` — la sessione dell'audit era **Full access per scelta dell'owner**, e il modello ha misurato la propria
sessione, non il prodotto.

## BC-58 | A 1024 la pill «Giri 10» del composer si tronca in «Giri 1…» — un numero tagliato è un numero sbagliato (foto del 17/09, giro vero P0) — APERTO, piccolo

**Visto** in `03-terminale-dal-composer-dark-1024.png` e `05-agenti-figlia-dark-1024.png`: a 1024 px il composer stringe le pill
(`glm-5.3-fl…`, `Scrive nel prog…`, `Termin…`, tollerabili) e anche **«Giri 10» → «Giri 1…»**: chi legge vede «1». A 1440 è intero.
**Cura:** il contatore non si tronca mai (la pill dei giri ha priorità sull'ellissi, o l'etichetta «Giri» cede prima del numero);
prova con un contatore a due cifre a 1024 nei due temi. ⛔ Regola di casa: un numero letto oltre la sua risoluzione, qui oltre il suo
spazio, è la tredicesima forma del 13/09.

## Osservazioni dal giro vero del 17/09 (non ancora difetti in coda, da decidere)

- **Processi in replay: durata «0 s»** — i tempi dei comandi non sopravvivono al registro (client-side, calcolati dagli eventi che al
  replay hanno lo stesso istante). Serve `durataMs` nell'evento di fine attrezzo, o la durata sparisce quando non è misurata.
- **`prova` non è un processo** — la scheda elenca solo `shell`; `npm test` lanciato da `prova` è un comando come gli altri.
- **Errori JS dentro l'iframe sandbox** («Failed to read localStorage… lacks the allow-same-origin flag»), 2 per apertura del
  Browser con la pagina IANA: pagine terze con script dentro la cornice `sandbox`; non nostri, ma la console dell'owner li vede.

## BC-59 | Nella riga attività della chat compare `file_edit`, un nome tecnico (owner 17/09) — APERTO, in P0-bis corsia C

**Regola violata:** «niente nomi tecnici nella UI» (owner 04/09): mappa nome-tecnico → nome-umano in UN posto solo, mai a schermo
`web_search`, `tool_create`… **Misurato il 17/09:** `grep -rn file_edit frontend/src` → **0** occorrenze: l'attrezzo è nato nel
kernel (l'audit interno del 16/09 lo loda) e nessuno l'ha aggiunto alle mappe del frontend — `nomi-attrezzi.js:30-36` (nomi),
`:135-141` (descrizioni), `conversazione.js:484-485` (icone), `app.js:5011` (icone), `permessi.js:22` (permessi). ⛔ E la mappa
dei nomi è DUPLICATA in `app.js:2560-2566`: due posti, contro la regola. **Cura:** `file_edit` → «modifica di un file» (icona,
descrizione, permesso); una mappa sola; un test di contratto che legge l'elenco degli attrezzi che il kernel espone e pretende che
ognuno abbia nome umano, icona e descrizione — così il prossimo attrezzo nuovo non può arrivare a schermo col nome tecnico.

## BC-60 | Sotto la risposta del modello: tre icone in fila, nessun «⋯», nessun Elimina, nessun tasto destro (visto dal revisore della corsia C nelle foto del 17/09, confermato nel codice) — APERTO

**Misurato:** `frontend/src/components/conversazione.js:180-203` (`creaAzioniMessaggio`) costruisce ESATTAMENTE tre bottoni a
icona — «Copia la risposta», «Ascolta la risposta», «Chiedi di nuovo» — e nient'altro: nessun menu di overflow, nessun
`contextmenu`, nessuna azione per eliminare la risposta. **Regole dell'owner violate:** 10/09 «più di due azioni su un oggetto ⇒
un menu "⋯" più il tasto destro»; 13/09 «riga e menu: intersezione vuota, unione completa; una lista di azioni si giudica da ciò
che MANCA» (lì mancava proprio Elimina, sul mobile); 11/09 CRUD completo su ogni entità che la persona vede. **Cura:** in riga al
più due azioni (Copia + una), le altre nel «⋯» e nel tasto destro, con **Elimina** (e la sua conferma) e ciò che il messaggio
dell'utente ha e la risposta no; stessa forma per il messaggio della persona. Skill `frontend-design`, due temi, 1024 e 1440.

## BC-61 | Il piede della barra laterale scrive l'id grezzo del fornitore: «Tema Calm · z-ai» (17/09) — APERTO, piccolo

⛔ **Non è il difetto che sembrava:** il revisore l'ha letto come «il prefisso al posto del modello», ma `workspace-footer.js:15-27`
documenta che il sottotitolo è «Tema <preset> · <chi serve il modello>» per scelta (05/09). Il difetto vero è più piccolo:
`fornitoreDelModello('z-ai/glm-5.3-flash')` restituisce `z-ai`, un **id tecnico**, e la regola dice che gli id dei fornitori si
mappano a nomi umani in un posto solo («Z.AI», «OpenRouter», «Anthropic»…). **Cura:** leggere il nome dal registro dei fornitori
(lo stesso che usa la sezione Fornitori), con test che per ogni fornitore del registro il piede non mostri mai l'id.

## BC-62 | Aprendo la scheda «Terminale» nasce ogni volta una NUOVA tab di terminale, senza motivo (owner 17/09/2026, dal vivo) — ✅ CURATO il 17/09 (`e5f4d9b1`), sul 4174 — ✅ **CONFERMATO dal vivo dall'owner il 17/09/2026: «BC-62 confermo, funziona»**

**Cosa hai visto:** «quando apro scheda terminale si apre una nuova tab terminale senza motivo». Entrare nella vista Terminale
non deve creare niente: deve mostrare le schede che ci sono; una scheda nuova nasce solo da «+ Nuovo» (o se non ce n'è nessuna).
**Da misurare prima di curare:** chi chiama la creazione all'ingresso nella vista (`setView('terminal')` / il cablaggio del
pannello dal composer che SPOSTA il terminale della sezione, `app.js` ~19764-19950 e `montaSchedaTerminale` →
`components/terminale-xterm.js`), se il doppione nasce dal blocco di cablaggio che gira due volte (rischio già documentato
in `app.js:19816-19826`, e la P0/A ha messo la guardia sul toggle ma non sulla creazione) o dal ripristino delle schede.
**Finita quando:** aprire e richiudere la vista dieci volte lascia lo STESSO numero di schede (prova browser che conta le
linguette), con una sessione PTY sola per scheda; «+ Nuovo» ne aggiunge esattamente una.

## BC-63 | La vista «Revisione» deve avere lo STESSO componente a schede del Terminale (schede stile Chrome) (owner 17/09/2026) — APERTO, debito — ✅ FATTA e sul 4174 il 17/09 (`c75b0d3a`; revisore avversariale: accettata con riserve, un giro di riparazione; residuo Browser → BC-68)

**Richiesta:** «la scheda revisione deve avere lo stesso component tab di terminale (schede stile chrome)». Oggi il Terminale ha
le linguette di `components/terminale.js` (linguetta con titolo, chiusura, «+ Nuovo», menu contestuale) e il Browser le sue;
la Revisione no. **Cura:** UN componente di schede condiviso (estratto da quello del Terminale, non una terza copia), usato da
Terminale, Browser e Revisione, con lo stesso comportamento di tastiera, chiusura, trascinamento se c'è, e overflow. Skill
`frontend-design`, tema Calm, due temi, 1024 e 1440, confronto affiancato fra le tre viste.
**Finita quando:** le tre viste montano lo stesso componente (un solo file, zero copie), e le foto affiancate lo mostrano.

## BC-64 | «Visualizza in Esplora file» non apre nessuna finestra di Esplora file (owner 17/09/2026, dal vivo) — ✅ CHIUSO il 17/09 (`0f711a4c`), **confermato dal vivo dall'owner sul 4174: «ok funziona»**

**Cosa hai visto:** la voce non fa niente. **Da misurare:** quale rotta chiama (`/api/v1/…/reveal` o simile), cosa risponde, e
cosa esegue il server: su Windows la forma giusta è `explorer.exe /select,"<percorso>"` (che esce con codice 1 ANCHE quando
funziona: un controllo sul codice d'uscita lo scambia per un fallimento), senza `shell: true` e col percorso assoluto
normalizzato; nel guscio Electron la via è `shell.showItemInFolder`. Da verificare anche nel browser puro (4174), dove il
server è l'unico che può aprire Esplora.
**Finita quando:** dalla riga di un file, su Windows, si apre Esplora file con QUEL file selezionato, sia dall'app installata
sia dal 4174; un percorso che non esiste più dice perché; prova sul percorso vero con lo spawn iniettato (argv asserito) e
una prova manuale dichiarata.

## OSS-3 — RETTIFICA del 17/09: l'errore «localStorage… sandboxed» lo produceva LA MIA SONDA, non il prodotto

**Misurato nei due versi sul 4174 (solo GET):** con `page.addInitScript(() => localStorage.setItem(…))` → un `pageerror`
«Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag» a
**30 ms** dall'avvio, con **zero iframe** nel documento; **senza** quello script → **nessun errore**. Playwright esegue lo
script d'avvio in OGNI cornice, anche nelle sandboxate (l'anteprima degli artefatti è `sandbox="allow-scripts"`,
`conversazione.js:787`; i widget annidati nelle pagine terze idem), e lì `localStorage` è vietato per costruzione.
⇒ L'osservazione del 17/09 («due errori JS aprendo il Browser su iana.org») era un **artefatto dello strumento**. Il lavoro
della corsia C resta valido per ciò che ha riprodotto davvero con una fixture (widget terzi annidati che lanciano da sé), ma
la riga d'origine va letta così. **Regola per le sonde:** uno script d'avvio che tocca `localStorage` si protegge con
`if (window.top === window)` e `try/catch`, oppure si imposta lo stato con `context.addCookies`/`storageState`.

**BC-64 — causa MISURATA e cura (17/09):** la politica di processo imponeva `windowsHide: true` a ogni `execFile`
(`process-policy.mjs`), e libuv lo traduce in `SW_HIDE`: `explorer.exe /select,<file>` riusciva e creava la finestra con
`Visible=False`. Misurato nei due versi (`true` → `Visible=False`, `false` → `Visible=True`); ⛔ una prima sonda che CONTAVA
soltanto le finestre non vedeva differenza — una finestra che esiste non è una finestra che si vede. Cura: `createProcessPolicy`
accetta `finestreVisibili` (default `false`) e solo la porta di Esplora la dichiara; 5 test, 2 rossi col fix tolto, ripristino a
sha identico. Consegnata sul 4174. **Resta:** la tua conferma dal vivo (dal 4174 e dall'app installata, che prende il fix alla
prossima release).

**BC-62 — ipotesi di lavoro (NON misurata):** `apriVistaTerminaleReale` (`app.js:11879`) è protetta (`t.ordine.length > 0 → avvia`),
ma due chiamanti creano una scheda se non trovano il mount: `app.js:20499` (`if (!pane.querySelector('.talos-terminal__mount')) void
nuovaSchedaTerminale()`) e `:11912`. Dalla P0/A il terminale della sezione viene SPOSTATO nel pannello sotto il composer e viceversa:
se il mount sta nell'altro ospite, il controllo «non c'è» è vero e nasce una scheda in più. Va riprodotto su un banco (crea PTY: mai il 4174).

**BC-62 — causa MISURATA e cura (17/09), che SMENTISCE la mia ipotesi di lavoro qui sopra:** il mount spostato fra sezione e
pannello non c'entra (senza sessione: una scheda sola su nove passaggi). Con una sessione VERA su un banco, al primo ingresso
partivano due `GET …/terminals` nello stesso millisecondo e due `POST …/terminals` 7 ms dopo: `caricaSchedeTerminale` è un
«controlla poi agisci» con una POST idempotente solo a registro vuoto, e due chiamanti insieme la facevano partire due volte —
la seconda creava «tu · Git Bash 2». Cura: volo unico per sessione (chi arriva a metà riceve la stessa promessa). Cancello
`tests/browser/terminale-una-scheda-sola.spec.mjs`: una scheda per sessione su A → B → A e dopo una ricarica, e al più UNA POST per
sessione; rosso sul pacchetto senza cura («attese 1, trovate 2»), verde dopo; «Nuovo» ne aggiunge esattamente una.

## BC-65 | La COMPATTAZIONE AUTOMATICA va rivista e resa robusta: l'owner non l'ha mai vista funzionare su sessioni lunghe (owner 17/09/2026) — DEBITO, «lo facciamo dopo»

**Parole dell'owner:** «non ho mai visto funzionare la compattazione automatica su sessioni lunghe, onestamente dubito che
funzioni bene; deve essere una funzionalità SUPER ROBUSTA perché potrebbe compromettere i task a lungo termine».

**Cosa so di misurato oggi (da non ri-dedurre):**
- Esiste ed è scattata: nel giro vero della P0 (sessione `dc42bc6c`, 16/09) il modello scrive nel ragionamento «The conversation
  was compacted at turn 8. The summary says: Points 1-4 of the assignment are COMPLETE…» — in una sessione da **10 giri** con la
  finestra al **9%** (118k su 1.310k). ⇒ Scatta, e scatta PRESTO: la soglia non è la finestra del modello.
- Sul 4174 il motore del contesto è **spento per costruzione** (`GET …/context` → 503 `CTX_NOT_ENABLED`, BC-07; tabella, Fase 9
  corsia 2: «la compattazione è fatta e provata, ma sul server di prova è vietata per costruzione»): ciò che l'owner usa ogni
  giorno non è il posto dove la compattazione del Context Manager gira. Due meccanismi (kernel e Context Manager) da distinguere.
- Fase 9, corsia 3: mai misurati acceso/spento, latenza (una sola misura: 61,2 s al primo token), riuso della cache (il 40%
  attuale è finto), costi prima/dopo.

**Cosa va fatto, quando si apre:** (1) inventario misurato — quanti meccanismi di compattazione esistono, chi li accende, con
quale soglia, su quale server; (2) una prova su sessione LUNGA vera (centinaia di giri, non una fixture) con un compito a
lungo termine che dipende da un fatto detto all'inizio: dopo ogni compattazione il fatto c'è ancora? il compito prosegue?;
(3) cosa vede la persona — quando scatta, cosa è stato tenuto e cosa no, e come si torna indietro; (4) i guasti: compattazione
che fallisce a metà, che scatta durante un attrezzo, che perde l'ultimo messaggio dell'utente, che si ripete in ciclo;
(5) confronto con Claude Code, Codex e Hermes (auto-compact, soglie, riassunto verificabile). Ricerca web prima di scrivere.
**Finita quando:** un compito di più ore con tre compattazioni di fila si chiude come senza compattazione, con la prova che i
fatti dichiarati all'inizio sopravvivono, e la persona vede e capisce ogni compattazione. Da fare DOPO le fasi in corso.

**Aggiunta dell'owner, 17/09/2026 (stesso giorno) — l'INTERFACCIA è parte del debito, non un contorno:** «sì, anche a livello
di interfaccia ci deve essere **barra completamento e separatore** come fa Claude Code (chi meglio di te per implementarlo)…
mi riferisco al compattamento». ⇒ Due elementi obbligatori, sul modello di Claude Code: (a) mentre la compattazione gira, una
**barra di avanzamento** nella chat (stato vivo, non uno spinner muto: la persona sa che sta compattando e quanto manca);
(b) a compattazione finita, un **separatore** nella conversazione nel punto esatto in cui è avvenuta («conversazione
compattata», con ciò che è stato tenuto apribile), che resta nella cronologia e sopravvive a ricarica e riapertura. Entrano
nel punto (3) qui sopra e nel criterio di chiusura: senza barra e separatore a schermo, nei due temi, BC-65 non è chiusa.
All'apertura: skill `frontend-design`, e prima si guarda cosa il progetto ha già (separatori di giro, righe di stato).
⭐ **Esiste già, trovato il 17/09:** `frontend/src/components/context-progress.js` + `context-compactor.js` — una barra di
avanzamento della compattazione con stima del tempo residuo (09/09, ricerca Win32 «Progress Bars» citata nel file, spec
`context-compactor.spec.mjs`). Vive però col solo Context Manager, che sul 4174 è SPENTO: per questo l'owner non l'ha mai
vista. ⇒ La barra non si riscrive: si accende dove lui lavora e si collega ANCHE alla compattazione del kernel. Il
separatore invece non risulta esistere (da accertare all'apertura).

## BC-66 | REFACTOR o IRROBUSTIMENTO del CONTEXT ENGINE (owner 17/09/2026, insieme a BC-65) — DEBITO, «lo facciamo dopo»

**Parole dell'owner:** «un refactor o irrobustimento del context engine anche». È il motore su cui poggia la compattazione
(BC-65): le due righe si aprono INSIEME, e questa viene prima — non si rende robusta una funzione sopra un motore che non lo è.

**Cosa c'è già scritto e va riletto prima di aprirla (niente da ri-dedurre):** il motore vive in `context-engine/` (store
SQLite con un worker: `src/node/sqlite-store.mjs`, `sqlite-worker.mjs`, `migrations/`); sul 4174 è **spento per costruzione**
(`CTX_NOT_ENABLED`, BC-07), quindi l'owner non lo esercita mai dal vivo; la Fase 9 elenca ciò che non è mai stato misurato
(acceso/spento, latenza — una sola misura, 61,2 s al primo token —, riuso della cache, costi). ⭐ L'**audit indipendente**
custodito (FASE 12) ha tre task proprio qui, non ancora valutati: **T04.1** backpressure e shutdown del worker SQLite,
**T04.2** migrazioni, recovery e restore (P1), **T04.3** query, export e limiti delle risorse. Entrano in questa riga.

**Da decidere all'apertura (owner):** refactor (ridisegnare i confini: store, worker, contratti con `harness-ui`) oppure
irrobustimento sul disegno attuale — si sceglie coi numeri dell'inventario, non a tavolino. **Finita quando:** il motore regge
una sessione lunga vera con guasti iniettati (worker che muore, DB bloccato, migrazione a metà, disco pieno) senza perdere né
corrompere niente, è acceso dove l'owner lavora, e BC-65 ci gira sopra verde.


## BC-67 | Senza sessione la REVISIONE mostra DATI FINTI (tre file, un diff, una ricevuta, «Accetta questo file») — e la prova che lo vietava è rossa da giorni in silenzio (17/09/2026) — ✅ CURATO e sul 4174 il 17/09 (`c75b0d3a`, pacchetto `05bb98a4`): la Revisione si ridisegna dai fatti all'avvio e a ogni ingresso, il markup d'esempio è uscito dal template, REVIEW-REAL-41 rafforzata (vuota → piena → vuota) e BROWSER-REAL-42 riportata ai selettori veri; NOTIFICHE-REALI-43 è `test.fail()` dichiarato → BC-70. ⛔ Dal vivo lo stato VUOTO non l'ho visto: il 4174 riapre da solo l'ultima sessione. Testo originale:

**Misurato il 17/09 sulla lane (`870988d6`), banco 4193, un worker, 1440x900, profilo nuovo con la modale saltata:** aperta la
Revisione con «Nessuna sessione», a schermo ci sono tre linguette VISIBILI (`offsetParent` presente, larghezze 253/281/173 px):
`src/session-registry.mjs +18 −2`, `tests/session-registry.test.mjs +64`, `src/http-app.mjs +30`, sotto un diff finto di
`guardiaDiStallo`, la pillola «Ricevuta a1f4…9c02», «giro 5», i bottoni «Accetta questo file · Apri nell'editor · Scarta» e
«Scartare ripristina il file dal checkpoint del giro 4». È il markup STATICO del template che nessuno svuota. L'ordine
dell'owner del 02/09 («agganciarlo e renderlo veramente funzionale», stato vuoto onesto) è violato. Foto nello scratchpad:
`bc67-review-vuota-dati-finti.png`.
⛔ **La mia prima diagnosi era SBAGLIATA e l'avevo scritta come misurata:** avevo attribuito il rosso al velo d'avvio guardando
UNA foto. La sonda che aspetta la app pronta (`#talosAvvio` staccato + runtime) dà ancora **3 failed**: il velo non c'entra.
La prova REVIEW-REAL-41 aveva ragione.
**Le altre due:** BROWSER-REAL-42 cerca `.browser-url` e NOTIFICHE-REALI-43 cerca `#notificationsBadge`: nel DOM di oggi **non
esistono** (misurato: `badge:false`) ⇒ selettori del monolite, prove invecchiate; resta da accertare che ciò che provavano
(Browser senza telefono finto, campanella che conta solo chi chiede attenzione) sia ancora vero coi selettori nuovi.
⛔ **Il difetto di processo:** `review-browser-notifiche.spec.mjs` non è nell'elenco browser che giro prima di consegnare: rossa
su `e2853725` e su `870988d6`, nessuno la guardava. Visto anche, fuori tema: con locale `en-US` la UI è MISTA («Terminal»,
«Search chats…», «SESSIONS» accanto a «Spazi di lavoro», «Conversazioni», «Nessuna sessione»).
**Finita quando:** senza sessione la Revisione mostra SOLO lo stato vuoto (zero linguette, zero diff, azioni spente), provato
nei due versi (vuota → piena dallo StateDelta → di nuovo vuota cambiando sessione), nei due temi; le tre prove sono verdi coi
selettori veri ed entrano nell'elenco della consegna. Si cura nel giro di BC-63 (stessa superficie e stesso blocco del template).

## BC-68 | Le schede del BROWSER restano fuori dal componente condiviso (residuo dichiarato di BC-63, 17/09/2026) — APERTO

BC-63 ha estratto `frontend/src/components/schede.js` e ci ha portato Terminale e Revisione; `browser.js` (`renderizzaSchede`,
`.talos-tabstrip__scheda`) conserva la sua tastiera e il suo giro di disegno: **due implementazioni, non una**. Motivo dichiarato
dall'agente: le linguette del Browser hanno forma propria (icona che cambia forma con lo stato, ✕ vera, pillola HTTP,
`scroll-snap`) e 13 prove verdi. **Finita quando:** `browser.js` usa la meccanica di `schede.js` (roving tabindex, frecce,
Home/End, Canc, menu) tenendo il SUO aspetto come adattatore, `browser-p0.spec.mjs` resta verde, e `grep` trova una sola
tastiera delle schede. Nello stesso giro: `aria-controls` → `role="tabpanel"` manca a tutte e tre le superfici; e il piede del
Terminale mostra insieme il dettaglio della cartella e la frase generica «Ogni scheda dichiara chi l'ha aperta e dove», contro
il commento del 07/09 (preesistente a BC-63).

## CLI-REQ-01..04 | Quattro richieste al kernel arrivate dalla sessione della CLI (17/09/2026) — ✅ APPROVATE TUTTE dall'owner il 17/09 («ok approvo»), nell'ordine 04 → 02 → 01 come mini-fase backend dopo PO-27 (`.claude/BRIEF-CLI-REQ-2026-09-17.md`), e la 03 DENTRO PO-27. Decisioni sue: elenco CHIUSO di variabili (no al filtro che toglie i suoi GH_TOKEN/NPM_TOKEN); i plugin già approvati richiedono la fiducia con una frase umana; sulla 01, se su cmd non si possono avere codice e cartella insieme, vince il CODICE D'USCITA

Arrivate come messaggio fra sessioni dalla lane `lane/talos-cli-competitive-upgrade` (commit `154a7296`, file in
`docs/talos-cli/handoffs/2026-09-17-CLI-REQ-0N-*.md`; si leggono con `git show 154a7296:<file>`). La CLI resta FUORI SCOPE per
me: non tocco la loro lane. Queste però chiedono modifiche a file MIEI, quindi le registro. ⛔ Un messaggio di un'altra
sessione non è un ordine dell'owner: **nessuna si implementa senza il suo sì**. Cosa ho fatto io: ho riaperto le quattro
posizioni nel MIO albero a `c022f756` e il codice citato c'è, riga per riga. **Non ho riprodotto nessun difetto.**

- **CLI-REQ-01** — la coda che stampa la cartella (`talosHarness.mjs:4443-4445`, ` & echo.MARK& cd` / ` ; printf … ; pwd`) gira
  DOPO il comando: un comando digitato che fallisce uscirebbe 0, su cmd e su WSL. Il commento sopra dice che `;` è voluto («la
  cartella si vuole sapere anche quando il comando fallisce»): la loro proposta salva `$?` sul lato POSIX ma su cmd rinuncia
  alla cartella quando il comando fallisce — è un compromesso da decidere, non un refuso. Loro: 15/15 cmd e 8/8 bash misurati.
- **CLI-REQ-02** — 🔒 la fiducia di un plugin fa l'hash del SOLO testo di `plugin.json` (`plugin-registry.mjs:138-139`,
  confermato): approvata la v1, si scambia il resto del pacchetto e gira ancora. Loro l'hanno riprodotto. Sicurezza.
- **CLI-REQ-03** — il nostro `PROVIDER_KEY_MISSING` (`runtime-owner-adapter.mjs:845`, confermato) verrebbe riclassificato nel
  catch del ripiego (~`:954-958`) in «Il fornitore non ha accettato la richiesta.», con un record di consumo per una chiamata
  mai partita. Dicono che l'owner l'ha incontrato quattro volte il 17/09 con un modello Z.ai senza chiave Z.ai. Solo traccia
  del codice da parte loro. ✅ **RIPRODOTTA da me il 17/09** (sonda `scratchpad/sonda-cli-req-03b.mjs`, nessuna rete, store senza chiavi, modello
  `zai:glm-5.3-flash`): per la strada VERA del runtime, `fetchMultiProvider.eseguiConFallback`, esce `PROVIDER_REQUEST_ERROR` «Il
  fornitore non ha accettato la richiesta.» (classe `ignoto`) con **0 chiamate di rete** e **1 consumo scritto**
  (`{provider:'zai', usage:null, esito:'interrotto'}`). ⛔ Per la fetch nuda (`creaFetchMultiProvider(...)(url, init)`) l'errore
  esce GIUSTO (`PROVIDER_KEY_MISSING`, «Manca la chiave del fornitore scelto.», 0 consumi): il difetto è SOLO nel catch di
  `eseguiConFallback`. La RED si scrive su quella strada, o passa per costruzione. Vicino a BC-61 (nome del fornitore) e alla corsia PO-27 («Collega un modello»).
- **CLI-REQ-04** — 🔒 `pty-terminal.mjs:157` avvia la shell con `env: process.env` (confermato) e `desktop/runtime.mjs:57` dà al
  server `TALOS_HARNESS_UI_TOKEN` (confermato): qualunque cosa giri nel terminale dell'app può leggere il token e chiamare la
  API locale. Proposta: togliere un elenco CHIUSO di variabili solo-server; il filtro più stretto sulle credenziali resta una
  decisione dell'owner (toglierebbe anche i suoi `GH_TOKEN`/`NPM_TOKEN`). Solo traccia del codice. Sicurezza.

**Il mio consiglio sull'ordine, quando l'owner decide:** 04 e 02 per primi (sicurezza, cure piccole), poi 03 (messaggio falso
che lui ha già visto), poi 01 (compromesso da scegliere). Ognuna con la sua prova RED e la ricerca prima di scrivere.

## BC-70 | La CAMPANELLA non conta chi aspetta, e il pannello la contraddice (trovato il 17/09/2026 riportando in vita NOTIFICHE-REALI-43) — APERTO

Misurato dall'agente di BC-63 sul banco, con la rotta `**/api/v1/sessions*` intercettata (con la stella: senza, la query string
sfugge): (a) una sessione con `inAttesaApprovazione: true` già in elenco lascia la campanella su «Notifiche: nessuna» alla
prima lettura — il commento del 02/09 diceva «un'approvazione in attesa notifica sempre», e non è più vero; (b) poi la
campanella dice «1 cosa aspetta te» mentre il pannello ne ELENCA DUE; (c) una voce del pannello legge **«Invalid Date»**.
La prova NON è stata adattata: è `test.fail()` dichiarato in `tests/browser/review-browser-notifiche.spec.mjs`, così il giorno
della cura Playwright segnala «atteso rosso, è passato». ⛔ Non riprodotto da me. **Finita quando:** un'approvazione in attesa
accende la campanella alla prima lettura, il numero della campanella è uguale al numero di voci del pannello, nessuna data
illeggibile, e il `test.fail()` sparisce.

## BC-71 | Tre residui visti nel giro di BC-63/BC-67 (17/09/2026) — APERTI, non curati

- **`#copyAllDiffs` è DUPLICATO nel DOM** (due nodi, stesso id: uno nel vecchio pannello `[data-view="diff"]`, uno nella
  testata della Revisione): il `$()` del prodotto aggiorna solo il primo, quello invisibile. L'id vive nel markup legacy.
- **Il riassunto in testata si contraddice**: `renderRealReviewList` scrive «Nessuna modifica in questa sessione» in
  `.talos-topbar__path` e `aggiornaSommarioReviewReale`, subito dopo, lo riscrive vuoto; e quel nodo è `display:none` sotto i
  900 px di contenitore (`index.css:534`).
- **`#browserTesto` mostra il testo dimostrativo del template** mentre le schede sono «in apertura»: possibile gemello di
  BC-67 nel Browser, visto in una sonda e non misurato a fondo.

## CLI-REQ-05 e CLI-REQ-06 | Altre due richieste al kernel dalla sessione della CLI (17/09/2026, pomeriggio) — ✅ APPROVATE dall'owner il 17/09 («sì, ho già autorizzato l'agente CLI per CLI-REQ»), nella collocazione che avevo proposto: **05 punto 1** (chiave OpenRouter pretesa a vuoto) SUBITO nel ramo `cli-req`; **05 punto 2 e 3** (compattazione e giudice verso il fornitore DELLA SESSIONE) dentro BC-65/BC-66 come vincolo di chiusura; **06** (verifica chiave da un token, forma OpenAI, per i quattro fornitori) in coda ai fornitori

Commit `b2be144b` sulla lane della CLI, misurate contro il nostro `cc8a25c9`; testo intero con
`git show b2be144b:docs/talos-cli/handoffs/2026-09-17-CLI-REQ-05-session-registry-tied-to-openrouter.md` e `…-CLI-REQ-06-minimal-key-check-openai-shape.md`.
Io ho riaperto le posizioni nel nostro albero: **il codice citato c'è**. Non ho riprodotto niente.

- **CLI-REQ-05 — le sessioni sono legate a OpenRouter.** (1) `session-registry.mjs:2648-2650` rifiuta l'avvio di ogni sessione
  non locale se `chiaveFn()` è vuota, e `server.mjs:418` cabla `chiaveFn` alla chiave di OPENROUTER (confermati entrambi, e il
  messaggio dice proprio «OPENROUTER_API_KEY»): una sessione DeepSeek con la chiave DeepSeek e senza quella di OpenRouter non
  parte, e quando parte OpenRouter non riceve niente — chiave pretesa e mai usata. (2) 🔒 **Riservatezza:** `compatta()`
  (`session-registry.mjs:4244`) passa a `compattaSessione` (`agent-service.mjs:1947`) che usa `chiamaConRitenta`, il cui URL è
  FISSO `https://openrouter.ai/api/v1/chat/completions` (`talosHarness.mjs:1326`, confermato); l'unica eccezione è
  `contextCompactFn`, che `server.mjs:411` passa solo con `config.contextTrial`. Loro l'hanno misurato ermeticamente: compattare
  una sessione DeepSeek con una chiave OpenRouter salvata fa UN tentativo di rete, verso openrouter.ai ⇒ l'intera conversazione
  andrebbe a un fornitore che la persona non ha scelto. (3) Solo letto: il giudice della ricerca (`:1712-1716`) fa la stessa strada.
  ⭐ **È lo stesso terreno di BC-65/BC-66** (compattazione e motore del contesto): quando si aprono, questa entra lì come vincolo
  — la compattazione va al fornitore DELLA SESSIONE, attraverso `creaFetchMultiProvider`. Nota mia: l'owner sul 4174 usa
  `z-ai/glm-5.3-flash`, che È un modello di OpenRouter ⇒ per lui oggi non esce niente dove non dovrebbe; il difetto morde chi
  usa un fornitore diretto.
- **CLI-REQ-06 — verifica della chiave con una richiesta da un token.** `deepinfra`, `novita`, `ollama-cloud`, `huggingface`
  dichiarano `catalogoPubblico` e nessuna `richiestaMinima` (`provider-registry.mjs:911, 953, 1089, 1136`, confermato: quattro
  voci) ⇒ le loro chiavi non si possono verificare. La sonda ha già `richiestaMinima` dietro `consentiGenerazione:true`
  (`provider-probe.mjs:195-197`) ma convalida solo il corpo in forma Anthropic. Chiedono la forma OpenAI (`/chat/completions`,
  `max_tokens:1`) per quei quattro. Dicono che l'owner l'abbia deciso il 17/09 nella LORO sessione: io non l'ho sentito da lui.

**Consiglio, quando l'owner decide:** la 05 punto 2 è l'unica urgente (riservatezza) e si cura bene solo insieme a BC-65/66;
il punto 1 è piccolo e può andare subito; la 06 è un miglioramento, in coda ai fornitori.

## BC-72 | La cartella `tests/browser` INTERA ha 77 rossi su 277, e il mio elenco di consegna ne girava solo una parte (misurato il 17/09/2026 fondendo BC-63) — APERTO

**Misura:** build fusa di BC-63, banco 4176, un worker, 31,6 minuti: **197 passed · 77 failed · 3 skipped**. Dei 77: `baseline-shell`
(debito già noto), `workspace-chooser` (28, l'intero file), `visual-matrix` (1), e sei in quattro file: `context-compactor` ×2,
`immagini-chat` NATIVE-UI-02, `settings-fatti-reali` SETTINGS-FATTI-44, `ragionamento-compresso` SCHERMO-10 ×2 temi.
**A/B sugli ultimi quattro file, stessa macchina, uno dopo l'altro:** build FUSA 6 failed / 32 passed; pacchetto di PRIMA
(`public/` di `fd3bfd0b`) 5 failed / 33 passed — stesso insieme, tranne SCHERMO-10 nel tema chiaro che passa in un giro e cade
nell'altro mentre lo scuro cade in entrambi ⇒ **non vengono da BC-63**; SCHERMO-10 è instabile o già rotto (era nel mio elenco
verde della P0-bis: da riaccertare quando e perché è diventato rosso).
⛔ **Il difetto di processo è lo stesso di BC-67:** consegno guardando un elenco scelto a mano, e ciò che sta fuori marcisce in
silenzio. **Finita quando:** ogni file di `tests/browser` è o verde, o `test.fail()` dichiarato con la sua riga di coda, o
cancellato perché prova una superficie che non esiste più (con la prova che non esiste); e la consegna gira la CARTELLA, non un
elenco.

## CLI-REQ-07 | `elenca` su una cartella VUOTA risponde con una stringa vuota, e il modello la legge come attrezzo fallito (17/09/2026, dalla sessione della CLI) — ✅ APPROVATA dall'owner il 17/09, a me direttamente («CLI-REQ-07 si»); in lavorazione nel ramo `cli-req`, punto E del giro di riparazione

Testo intero: `git show 3fb4e9d8:docs/talos-cli/handoffs/2026-09-17-CLI-REQ-07-empty-folder-listing-is-silent.md`.
**Cosa ha visto l'owner (riferito):** `talos` avviato in una cartella nuova e vuota; il modello chiama `elenca` quattro volte
(`""` e `"."`), non riceve niente, e gli dice che l'elenco «non è arrivato»; poi `scrivi`/`leggi` funzionano.
**Riprodotto da me il 17/09 a `0bad1459`** (`%TEMP%/s7.mjs`, sola lettura): `elencaDaCartella({elenca: async () => []}, '')`
→ `{"tipo":"string","valore":""}`. Il secondo caso (una sottocartella senza file non viene nominata, `talosHarness.mjs:3487`)
l'hanno misurato loro; io no.
**Chiedono:** (1) una cartella vuota risponde con una frase che il modello non può scambiare per un guasto; (2) una
sottocartella senza file compare lo stesso nell'elenco (`sub/`). È la stessa famiglia di «un modello che non vede non tace:
spiega» (P-13, 10/09): una risposta vuota e una risposta «è vuota» non sono la stessa cosa. Kernel ⇒ va nel ramo `cli-req` o
in una riga sua, con `npm run test:kernel` intero e ricerca prima di scrivere.

## CLI-REQ-08..11 | Portare gli attrezzi dei FILE del modello (`leggi`, `cerca`, `scrivi`, `file_edit`) al contratto di Hermes, tenendo i miglioramenti di TALOS (17/09/2026, dalla sessione della CLI) — ✅ APPROVATE dall'owner il 17/09, a me direttamente («confermo, approvo tutte le CLI e mi va bene la forma che hai descritto»): fase a sé, additiva con interruttore per il banco, ordine 11 → 10 → 08 → 09, brief in `.claude/BRIEF-ATTREZZI-FILE-CLI-REQ-08-11-2026-09-17.md`; parte dopo la fusione del ramo `cli-req`

Testo: `git show bc17c98f:docs/talos-cli/handoffs/2026-09-17-CLI-REQ-08-11-agent-file-tools-like-hermes.md` (84 righe, una RED per
richiesta); confronto di origine: `git show b0d32717:docs/talos-cli/research/2026-09-17-hermes-agent-tools-comparison.md`
(Hermes `98f758ae`, `tools/file_tools.py:1088-1260`). Misurate da loro in sola lettura al nostro `13d9b986`.
- **08 — `leggi` con numeri di riga e pagine:** oggi `leggi(percorso)` (`talosHarness.mjs:7824`) restituisce il testo com'è.
  Chiedono `offset`/`limit` facoltativi, righe numerate, un tetto di caratteri tagliato a fine riga che dice da dove
  continuare, e i nomi esistenti più vicini quando il percorso è sbagliato.
- **09 — `cerca` restituisce le righe trovate:** oggi solo percorsi (`cercaNelProgetto`, `:3584`). Chiedono righe con percorso
  e numero, contesto facoltativo, `limit`/`offset` col totale, un modo «conta», un filtro glob; «solo percorsi» resta un modo.
- **10 — niente sovrascrittura alla cieca:** `scrivi` in `create` rimpiazza un file esistente col solo consiglio «leggilo
  prima». Chiedono il rifiuto se questa sessione non ne ha letto TUTTO il contenuto corrente (o non l'ha scritto lei) o se è
  cambiato sul disco da allora.
- **11 — `file_edit` mostra cosa ha cambiato:** oggi risponde «edited: … N occurrence(s)»; chiedono un diff unificato con
  tetto dichiarato; il confronto resta esatto, quello tollerante agli spazi solo come secondo tentativo dichiarato.
⛔ **Perché NON è una cura piccola, e va decisa dall'owner con me:** cambia ciò che il MODELLO riceve da quattro attrezzi
(i nomi restano, ma parametri e uscite no) — e qui (a) il banco confronta l'uscita degli attrezzi BYTE PER BYTE fra campagne
(`talosHarness.mjs:1563, 2774`), quindi ogni campagna passata smette di essere confrontabile; (b) la scommessa di TALOS è il
contesto MAGRO (`talos-esaurisce-i-giri`: i token sono la somma sui giri): righe numerate e righe trovate costano token a ogni
chiamata e vanno MISURATE prima/dopo, non assunte; (c) la 10 tocca la grammatica dei permessi e la 11 la ricevuta della
scrittura; (d) il kernel ha più copie (decisione sulla sorgente ancora aperta) e il mobile lo condivide. ⇒ È una FASE
(ricerca, misura di token su task veri, additivo per costruzione dove si può: parametri facoltativi che a vuoto lasciano
l'uscita identica), con revisore avversariale e un giro vero con `glm-5.3-flash`. Hermes è l'obiettivo da battere: il verso è giusto.

**Misura mia del 17/09 per CLI-REQ-08, PRIMA di decidere** (`scratchpad/misura-righe-numerate.mjs`, sola lettura, 501 file veri
di `harness-ui/src`, `frontend/src/components`, `tests`; 9.076.522 caratteri; caratteri e non token: conta il rapporto):
numerare le righe nella forma di Hermes (`N|riga`) costa **+7,2%** (mediana per file +6,5%, p90 +8,3%, massimo +20,0% su un
file di righe corte); nella forma `cat -n` **+12,7%** ⇒ se si fa, la forma è `N|riga`. ⭐ E corregge il mio timore: il costo
vero di OGGI non è la numerazione, è l'assenza di PAGINE — `talosHarness.mjs` da solo è **600.565 caratteri in 10.025 righe**, e
`leggi` lo restituisce intero; **10 file su 501 superano i 100.000 caratteri, 21 i 50.000**. Un tetto con «continua da riga N»
fa RISPARMIARE ordini di grandezza proprio dove il contesto si brucia, e il +7% lo si paga su pagine piccole. ⇒ La 08 è un
guadagno netto sul contesto, non un rincaro; resta da misurare su task veri quante volte il modello rilegge pagine successive.

## BC-73 | L'attrezzo IMMAGINI manda il prompt a OpenRouter qualunque sia il fornitore della sessione (trovato il 17/09/2026 dal secondo revisore del ramo `cli-req`) — APERTO, decide l'owner

`src/image-generator.mjs:48-49`: `OPENROUTER_IMAGES_URL` / `OPENROUTER_CHAT_URL` FISSI, `generaImmagineOpenRouter` con `fetch`
nuda e la chiave di OpenRouter. ⇒ In una sessione DeepSeek (o di qualunque fornitore diretto) il prompt dell'immagine va a
OpenRouter. È una scelta DICHIARATA nel codice («zero provider nuovo»), non una svista — ma dopo CLI-REQ-05 è l'ULTIMA strada
che ignora la destinazione della sessione (censimento del revisore: compattazione manuale e automatica, giudice, figlie, ACP,
motore locale passano tutte dal fornitore della sessione; letto, in parte eseguito). **Da decidere:** lasciarla com'è ma DIRLO
alla persona prima dell'invio («le immagini si generano con OpenRouter»), oppure instradare sul fornitore della sessione quando
ne ha uno capace di immagini. Solo letto, non riprodotto da me.

**Misurato e letto da me il 17/09, su richiesta dell'owner («fai molta attenzione»):**
- ESCE solo la descrizione scritta dal MODELLO più la forma, non la conversazione — ma la descrizione può portare dettagli della
  conversazione. Va a DUE terzi: OpenRouter e il fornitore del modello immagini fisso, `bytedance-seed/seedream-4.5` (ByteDance)
  (`config.mjs` `IMMAGINE_MODELLO_DEDICATO_DEFAULT`).
- ✅ MISURATO (`%TEMP%/s73.mjs`, fetch finta): SENZA chiave OpenRouter la descrizione PARTE LO STESSO —
  `POST https://openrouter.ai/api/v1/images`, `Authorization: "Bearer undefined"`, corpo con il prompt intero — e torna 401.
  In `onImmagine` (`agent-service.mjs` ~1331) l'unica guardia è `if (!immagine)`: sulla chiave nessuna. Fuga inutile.
- LETTO: l'attrezzo è offerto in OGNI sessione (`session-registry.mjs` ~1622, `strumentiEstesi` non dipende dal fornitore),
  comprese le LOCALI — dove l'app promette «niente esce da questa macchina». Ha il suo permesso
  (`requiredActions: ['outbound','write']`, `talosHarness.mjs:5414`) ma a schermo dice solo «Genera un'immagine»
  (`nomi-attrezzi.js:167`): non dice DOVE va.
✅ **APPROVATO dall'owner il 17/09 («sì a tutte»)** — brief in `.claude/BRIEF-BC-73-IMMAGINI-2026-09-17.md`, parte dopo la fusione del ramo `cli-req`. **Il consiglio approvato:** NON instradare sul fornitore della sessione (pochi fanno
immagini, interfacce diverse, «zero provider nuovo» era voluto); tre cure strette: (1) la destinazione detta nella scheda di
approvazione e nel foglio dei permessi, letta dalla configurazione; (2) nelle sessioni LOCALI e in quelle di un fornitore ≠
OpenRouter l'attrezzo CHIEDE SEMPRE, anche con «sempre» (stessa regola di F15); (3) senza chiave OpenRouter nessuna chiamata
di rete. Più avanti: scelta del fornitore delle immagini in Impostazioni.

## BC-74 | Tre script del repo puntano DI SERIE al 4174 VIVO dell'owner (17/09/2026: l'agente di PO-27 ne ha lanciato uno per errore) — APERTO

Misurato col grep il 17/09: `frontend/scripts/cancello/veli-sani.mjs:44` (`TALOS_VELI_BASE || 'http://127.0.0.1:4174'`),
`frontend/scripts/diagnose-interaction-lag.mjs:5` (`TALOS_LAG_URL || …4174/`), `scripts/qa-visual-pipeline.mjs:89`
(`--url=` || `…4174/`). La regola di casa dice «una sonda non tocca MAI il 4174» ed è scritta nella memoria, non negli
script: l'agente di PO-27 ha lanciato `veli-sani` senza sapere dove puntava, e ha aperto dei veli sul server dell'owner
(nessuna scrittura, dichiarato da lui). ⇒ Stessa lezione di sempre: il cancello sta nello SCRIPT, non nella memoria.
**Finita quando:** nessuno script ha il 4174 come ripiego: senza un indirizzo esplicito si RIFIUTA di partire (o avvia un suo
banco), e puntare al 4174 vuole un'opzione che lo dica per nome; una prova legge i sorgenti di `scripts/` e diventa rossa se
ricompare un ripiego sul 4174. Visto nello stesso giro da `veli-sani` sul 4174: 5 veli su 12 «non si aprono» (`veloFornitori`,
`veloRinominaModello`, `veloEliminaModello`, `veloAnnullaDownload`, `veloFileModello`) e 10 senza via dichiarata — non
verificato da me, da riaccertare su un banco.

**CLI-REQ-06 — ✅ CHIUSA e sul 4174 il 17/09/2026: `95716162`** (rami di lavoro `fecece15`, `8efd5bec`, `49652fb4`; revisore
avversariale: accettata con riserve, un giro di riparazione). Misurato da me sulla lane fusa: mirate 194/191/0/3; backend intero
da solo 3167 · 3162 pass · 0 fail · 5 skipped (un primo giro con 2 rossi in `shell-chiede-davanti-a-un-segreto` e le prove WSL
saltate: l'intermittenza WSL nota, 27/27 da solo). ⛔ NON verificato: nessuna richiesta vera ai quattro fornitori, nessuna chiave
vera. ⛔ Si discosta dal handoff della CLI su un punto, apposta: `usage.prompt_tokens` è richiesto finito SOLO se presente
(Novita e Ollama non documentano il corpo della risposta). Il modello di prova di Novita è `meta-llama/llama-3.1-8b-instruct`
(quello dell'esempio nella loro documentazione non ha più una scheda). Toccato un record di un'altra corsia (`zai-anthropic`:
una riga additiva, la fonte datata del modello, senza la quale il registro non si carica).

## BC-75 | A FINE GIRO la chat deve riportare i file modificati in quel giro, ognuno col collegamento alla sua scheda nella Revisione (owner 17/09/2026, con una foto di Claude Code) — APPROVATA, entra nel giro di riparazione di PO-27

**Parole dell'owner:** «piccola modifica UI, usando stesso stile coerente TALOS: come fa Claude Code a fine turno bisogna
riportare lista file modificati in quel turno con link a review in quella scheda file». Nella foto: una carta «Modificati 3
file» con «Annulla» e «Visualizza le modifiche», e una riga per file (nome, `+19 −0`, freccia).
**Cosa esiste già (misurato col grep il 17/09, prima di scrivere una riga):** il componente C'È e non lo chiama NESSUNO —
`frontend/src/components/conversazione.js:743` `creaFileToccati(file)` («File toccati in questo giro», `data-c="TouchedFiles"`) e
`:754` `rigaFileToccato({percorso, aggiunte, rimozioni, onApri, onDiff})`, con «Apri» e «Differenza» (`data-vaia="review"`), portati
dal mockup; in `legacy/app.js` zero chiamanti. È la forma già vista il 20/08: una funzione coi test e nessun chiamante. Oggi la
chat mostra solo, PER OGNI scrittura, la riga «1 file scritto» (`app.js:11112`). I dati ci sono: `state.realSession.reviewFiles`
(percorso → file, col giro) e `renderReviewFile(key)` (`app.js` ~9507) apre la Revisione su QUEL file; dopo BC-63 la linguetta
giusta va in vista da sola.
**Da fare:** alla fine di ogni giro che ha scritto almeno un file, sotto la risposta, UNA carta con i file di QUEL giro (non della
sessione): nome del file (percorso intero nel `title`, cartella madre solo se due nomi coincidono — la regola di BC-63), `+N −M`
misurati, e il clic sulla riga apre la Revisione sulla scheda di quel file; in testa «Visualizza le modifiche» (apre la Revisione
sul primo). ⛔ Niente «Annulla» finché non esiste un annullamento VERO del giro (checkpoint): un bottone che non fa niente non si
disegna. Due azioni per riga al massimo (regola dei menu). Sopravvive a ricarica e riapertura (si ricostruisce dal replay, non da
uno stato volatile), non compare nei giri senza scritture, e nei giri lunghi non si duplica a ogni scrittura. Skill
`frontend-design`, tema Calm, nei due temi a 1024 e 1440; nessun componente nuovo: si CABLA quello che c'è.

## BC-76 | Una sessione col modello LOCALE disegna le chiamate agli attrezzi e non ne esegue NESSUNA (trovato dalla PR bozza #28 dell'owner, confermato nel nostro albero il 17/09/2026) — APERTO, è il blocco vero del motore locale sul desktop

`src/session-registry.mjs:2452` `eseguiRuntimeLocale`: una sola `generateStream`, e su `tool_call` (`:2480-2484`) emette
`ToolCallStart` + `ToolCallArgs` e BASTA — nessun attrezzo eseguito, nessun risultato, nessun messaggio `tool`, nessuna
continuazione; e non manda al motore né `tools` né `tool_choice`. `:3223` instrada lì OGNI sessione locale (le altre vanno a
`talosLavora`). ⇒ Sul desktop una sessione locale NON è un agente, e quando il modello «chiama» un attrezzo la chat mostra
un'attività che non è mai avvenuta. Letto da me riga per riga; non eseguito con un modello vero.
**Da dove viene:** rapporto della PR bozza #28 (`Ninozzz95/talos`, ramo `perf/desktop-local-llm-engine`, commit `17b05b99`), che
lo chiama «correctness blocker» e avverte giustamente: NON scrivere un secondo esecutore che scavalchi permessi e hook — la
sessione locale deve entrare nel giro del kernel (`talosLavora`) come fanno le altre, col motore locale come trasporto.
**Stessa PR, verificata da me sul NOSTRO albero:** il nostro `local-runtime-llama-server.mjs` è byte per byte la loro base
(sha256 `b417c2ef…`); il difetto quadratico c'è (`:188`, `JSON.parse(previous.arguments)` a ogni frammento); la patch si
applica pulita (`git apply --check`); le loro prove: candidata **25/25**, le 20 nuove contro la nostra base **10 rosse / 10
verdi** come dichiarato; il loro banco su QUESTA macchina Windows, 64 KiB, 11 ripetizioni: mediana **128,2 ms → 4,3 ms**.
Evidenze custodite nello scratchpad `evidenze-motore/` (zip dell'owner).

✅ **Patch della PR #28 APPLICATA alla lane su ordine dell'owner («sì, applica») il 17/09: `93650914`, sul 4174.** Revisione
fatta da ME (regola nuova: niente revisori delegati): diff di produzione letto riga per riga; sha256 del file risultante uguale a
quello dichiarato (`615ee4af…`); 25/25; tre rotture mie, tutte rosse dove devono (stop fra le emissioni: 1 · indice ignorato: 5 ·
emissione a ogni frammento: 7), ripristino per copia a sha256 identico; backend intero da solo **3187 · 3182 pass · 0 fail · 5
skipped**. ⛔ NON verificato: nessun modello vero è girato, nessuna misura sul tempo al primo token.
✅ **ORDINE approvato dall'owner il 17/09 («approvo il tuo consiglio»): BC-76 viene PRIMA del lavoro sulla velocità del motore
locale** — una sessione locale che non esegue gli attrezzi non è un agente, e misurarne la velocità ha poco senso. Forma: la
sessione locale entra nel giro del kernel (`talosLavora`) col motore locale come TRASPORTO; mai un secondo esecutore che scavalchi
permessi e hook. Tocca `session-registry.mjs` e il kernel ⇒ dopo la fusione di `cli-req`, prima della fase degli attrezzi dei file.

**CLI-REQ-01, 02, 04, 05, 07 e il browser pilotato — ✅ CHIUSE e sul 4174 il 17/09/2026: `ba420a95`** (tre revisioni avversariali
delegate, quattro giri di riparazione; l'ULTIMO giro l'ho rivisto IO, per la regola nuova dell'owner). Misurato da me sulla lane
fusa: kernel 599 · 598 pass · 1 skipped; backend intero da solo **3269 · 3264 pass · 0 fail · 5 skipped**. Mia revisione della
grammatica dei plugin dalla porta vera (`caricaPlugin` su cartelle vere, `scratchpad/mia-review-clireq.mjs`): **47 forme, 0
buchi** (`node -pe`, `--run`, `-`, `--eval=`, `-r./x`, maiuscole, `node.exe`, virgolette, `;`/`&&`/`|`, `$(…)`, `%COMSPEC%`,
`cmd /c`, `deno eval`, percorsi fuori dal pacchetto, un file chiamato `-e`; anche come HOOK) e 9 forme legittime su 9 accettate.
**Giro vero sul 4174** con `glm-5.3-flash` (sessione `4578469d`, 34 s): la sessione PARTE col controllo nuovo della chiave;
`elenca "sub-vuota"` → «no files and no folders. "sub-vuota" is empty — this is the complete listing, not a failure.»; `elenca`
sulla radice → `giro.mjs` e **`sub-vuota/`** (la sottocartella vuota ora è nominata); `node -e "process.exit(3)"` → **`exit 3`**.
⛔ **Debito di copertura trovato dalle MIE rotture (nessuna prova diventa rossa):** (1) l'id del plugin ricavato dal nome invece
che dalla mappa — oggi equivalente, perché gli id con `__` sono rifiutati al caricamento; (2) il controllo del disco di
PRODUZIONE in `cartellaFinaleValida` (`eUnaCartellaLocale`) è provato solo attraverso una funzione iniettata: `return true` al
posto di `statSync().isDirectory()` lascia tutto verde. ⛔ Residui dichiarati: gli hook riverificano la fiducia solo all'avvio;
`require()` dentro un file del pacchetto; `TALOS_HARNESS_RECEIPT_KEY_ID` ed `ELECTRON_RUN_AS_NODE` arrivano ancora a
`shell`/`prova` del modello; nove punti che ereditano l'ambiente intero (`.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`); il
giudice della ricerca di norma non c'è più quando l'unico candidato è l'autore (prezzo di non uscire dal fornitore della
sessione: da decidere se dare alla persona la scelta del giudice nelle Impostazioni); gli hook STANDALONE
(`.harness-ui-hooks.json`) accettano ancora `node -e`; `scansionaPatternSospetti` oggi rassicura e basta.

## BC-77 | Due difetti visti nelle foto di PO-27, fuori da quella corsia (revisore, 17/09/2026) — APERTI
- **Un toast copre il composer a 1024×800**: «Collegato di nuovo» sopra «Terminale», il microfono e il pulsante di stop; in
  un'altra foto sopra «Scrive nel progetto». In 4 foto su 20. Un avviso non deve mai coprire un comando, tanto meno lo stop.
- **HTML malformato nella `talos-turn-spine` del template** (`index.template.html`): `<button …></span aria-label="Vai al
  giro"></button>` — si vede come un trattino fantasma a sinistra della colonna (x≈303) in tutte le foto con sessione.
Non verificati da me: letti nel rapporto del revisore.

**CLI-REQ-05, difetto trovato DOPO la fusione dalla corsia della CLI e curato lo stesso 17/09: `3cbecf60`, sul 4174.** La regola
«pronto» fusa in `ba420a95` usava `hasKey` per ogni fornitore tranne OpenRouter, e `hasKey` conta anche le chiavi in PANCHINA.
Riprodotto da me con lo store vero prima di toccare una riga (`scratchpad/sonda-panchina.mjs`): una chiave DeepSeek in panchina →
`hasKey true`, `getKey null` ⇒ la sessione partiva e il giro moriva senza chiave. L'owner l'ha incontrato nella CLI lo stesso
giorno. Cura: la regola esce da `server.mjs` (era una chiusura che nessuna prova poteva chiamare) in `src/sessione-pronta.mjs`,
con 8 prove sullo store VERO; una regola sola per tutti — una chiave utilizzabile ADESSO; se le chiavi ci sono ma sono in
panchina il rifiuto lo DICE (causa in parole umane e fino a quando), non «Manca la chiave». Al contrario: rimessa la regola
vecchia → 2 rosse. Backend intero da solo: **3277 · 3272 pass · 0 fail · 5 skipped**. ⛔ Lezione: tre revisori avevano
«misurato» quella funzione ricopiandone i byte, e nessuno aveva provato lo STATO che la rompe — una chiave che c'è e non si può
usare. Una regola dentro una chiusura non ha prove sue: si estrae PRIMA di fonderla, non dopo che qualcuno ci inciampa.
