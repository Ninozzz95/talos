# LEDGER — Tabella di marcia Desktop, dopo l'harness (30/8)

> ⛔ Richiesta arrivata **a metà** del giro di chiusura di Task 5/Task 12
> (QA visiva, `.claude/QA-VISIVA-HARNESS-2026-08-30.md`), owner: *"vorrei
> che segnassi queste cose e formulo il piano tabella di marcia
> aggiornato"* — **REGISTRATA qui per intero, NON iniziata**: nessun
> file di prodotto toccato per questo lavoro. È l'owner stesso a dire
> che costruirà la tabella di marcia — questo file è solo la
> trascrizione fedele di cosa ha chiesto di segnare, per la stessa
> regola già in uso tutta la sessione (una fase alla volta, un filo
> vero si registra e si lascia per un sì separato — qui il "filo" è
> l'owner stesso, non una scoperta mia).

## Richiesta owner, verbatim (30/8, "RECEPISCI")

> *"Allora vorrei che segnassi queste cose e formulo il piano tabella di
> marcia aggiornato"*

1. **Porting completo delle impostazioni dal mobile al desktop** — *"mi
   interessa un censimento completo delle impostazioni realmente
   applicabili su desktop"* (non un porting cieco 1:1: prima un
   censimento di quali hanno senso fuori da un telefono).
2. **Tutorial e intro come su mobile.**
3. **README ufficiale della repository — riscrittura**: *"molto, molto
   indietro rispetto a tutte le funzioni e prevede solo la versione
   mobile"*. Deve includere **i benchmark del banco contro gli altri
   provider di harness** e mostrare dove TALOS supera. Richiesta
   un'ispezione ATTENTA del README esistente + ricerca web sulle
   pratiche migliori per un README "accattivante e allo stato
   dell'arte, allineato all'ultimo mese, con foto senza essere troppo
   prolisso né troppo corto". L'owner vuole sapere **quali screenshot
   servono** — "li facciamo assieme oppure li fai tu".
4. **Decisione su come rilasciare la versione desktop**: Windows, Linux
   e Mac, con un installer "un po' come fa Hermes". Vuole un piano per
   un installer con **interfaccia super moderna e completa che installa
   tutto in un solo step** — *"l'utente deve fare i meno passi
   possibili"* — con selezione dei componenti disponibile ma opzionale
   dentro il flusso.
5. ⛔⛔⛔ **Dimenticanza importante e cruciale, segnalata dall'owner
   stesso**: la capacità di far girare **modelli locali sul desktop**,
   esattamente come fa il mobile. Porting dell'intera sezione
   "Laboratorio modelli" del mobile, **adattata a un'interfaccia
   desktop**. Ottimizzazioni **allo stato dell'arte dell'ultimo mese su
   desktop** — non solo "far girare qualcosa", pareggiare la cura già
   messa sul motore mobile. Vincolo esplicito: **ogni ottimizzazione
   fatta sul mobile deve essere portata anche sul desktop**, con
   ottimizzazioni ULTERIORI specifiche del desktop (non un sottoinsieme
   del mobile).

## Cosa NON è, per essere precisi

Non è un piano approvato, non è una sequenza di fasi, non ha stime.
Nessuna decisione di design è presa qui (formato installer, quali
impostazioni sono "realmente applicabili", struttura del nuovo README,
architettura del motore locale desktop) — tutte esplicitamente
rimandate al piano che l'owner formulerà. Questo file esiste solo
perché la regola di questa sessione è *i debiti riportati si segnano
SEMPRE, subito, mai lasciati solo in chat* — vale anche per una lista
di richieste dell'owner quanto per un bug trovato in corsa.

## Collegamenti — lavoro già fatto o già aperto che questi punti toccano

- Il punto 1 (porting impostazioni) e il punto 2 (tutorial/intro) si
  intrecciano con [[stessa-ui-mobile-desktop-backend-diverso]] — quella
  nota fissa la direzione opposta per la CHAT (l'harness diventa il
  metro di paragone per il mobile), ma qui la direzione è quella
  dichiarata da questo messaggio: impostazioni/tutorial vanno DAL
  mobile VERSO il desktop. Le due direzioni non si contraddicono (sono
  sottosistemi diversi: chat vs. impostazioni/onboarding) ma vanno
  tenute distinte quando si scrive il piano vero.
- Il punto 3 (benchmark del banco nel README) presuppone TALOS-BANCO
  in uno stato presentabile — vedi il debito aperto
  [[28/8 — TALOS-BANCO: 24 righe su 27 perse]]
  (`corri-riscrive-il-file-se-ripetizioni-non-combacia.md`) e
  [[onesta-batte-velocita-hermes-e-il-peggiore]] (il confronto onestà,
  già misurato, già scomodo per TALOS su un punto preciso — un README
  che mostra "dove TALOS supera" deve reggere anche dove non supera
  ancora, o non è un README onesto).
- Il punto 5 (modelli locali su desktop) riparte dal lavoro già fatto
  sul motore mobile — [[motore-locale-max-performance-22-agosto]] (Fase
  0-3 chiuse, Fase 4/5 in corso) — non da zero: il vincolo "ogni
  ottimizzazione del mobile va portata" implica leggere quel lavoro
  PRIMA di progettare la versione desktop, non reinventarla.
- Il punto 4 (installer) è nuovo, nessun lavoro precedente in questa
  sessione lo tocca.

## Stato

🔜 **REGISTRATO, non iniziato.** L'owner formulerà la tabella di
marcia; questo file resta la trascrizione fedele della richiesta
finché quel piano non arriva. Nessun file di prodotto toccato.
