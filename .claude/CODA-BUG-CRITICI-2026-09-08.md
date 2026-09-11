# CODA DEI BUG CRITICI — 08/09/2026

> Segnalati dall'owner mentre lavoravo, tutti con uno screenshot. Ordinati per gravità.
> ⛔ Owner: «ispeziona la run reale in 4174, dopo aver sistemato la coda di bug corrente».

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

**Stato:** in lavorazione. ⛔ Vincolo dell'owner: la cura è la causa, non un limite. Se serve una
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

**Stato:** in lavorazione, insieme a BC-01 (stesso file).

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

## BC-04 · Regressione di stile nel selettore dei modelli locali

**Segnalato:** «regressione stile su model picker locali».

Nella scheda «Locali» del selettore in «Nuova sessione» le righe **sforano orizzontalmente**: il
nome del modello (l'identificatore interno, 102 caratteri) allarga il contenitore, compare una barra
di scorrimento orizzontale e il testo viene tagliato a metà parola. È **CB-16-bis**, già registrato
come «gli id grezzi a schermo», che qui si manifesta come rottura visiva.
⛔ La cura per il nome esiste già e non viene usata: `components/chat-foot.js` esporta
`nomeModelloUmano()`, chiamata in **un solo posto**.

**Stato:** in lavorazione.

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

**Stato:** APERTO, mai lavorato.

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
