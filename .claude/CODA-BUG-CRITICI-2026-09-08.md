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

## BC-62 | Aprendo la scheda «Terminale» nasce ogni volta una NUOVA tab di terminale, senza motivo (owner 17/09/2026, dal vivo) — ✅ CURATO il 17/09 (`e5f4d9b1`), sul 4174, da confermare dal vivo dall'owner

**Cosa hai visto:** «quando apro scheda terminale si apre una nuova tab terminale senza motivo». Entrare nella vista Terminale
non deve creare niente: deve mostrare le schede che ci sono; una scheda nuova nasce solo da «+ Nuovo» (o se non ce n'è nessuna).
**Da misurare prima di curare:** chi chiama la creazione all'ingresso nella vista (`setView('terminal')` / il cablaggio del
pannello dal composer che SPOSTA il terminale della sezione, `app.js` ~19764-19950 e `montaSchedaTerminale` →
`components/terminale-xterm.js`), se il doppione nasce dal blocco di cablaggio che gira due volte (rischio già documentato
in `app.js:19816-19826`, e la P0/A ha messo la guardia sul toggle ma non sulla creazione) o dal ripristino delle schede.
**Finita quando:** aprire e richiudere la vista dieci volte lascia lo STESSO numero di schede (prova browser che conta le
linguette), con una sessione PTY sola per scheda; «+ Nuovo» ne aggiunge esattamente una.

## BC-63 | La vista «Revisione» deve avere lo STESSO componente a schede del Terminale (schede stile Chrome) (owner 17/09/2026) — APERTO, debito

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

