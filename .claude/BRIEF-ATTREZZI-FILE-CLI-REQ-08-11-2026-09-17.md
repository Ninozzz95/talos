# Brief — FASE «Attrezzi dei file» (CLI-REQ-08, 09, 10, 11) — approvata dall'owner il 17/09/2026

> Owner, a me direttamente: «confermo, approvo tutte le CLI e mi va bene la forma che hai descritto» — fase a sé, ADDITIVA,
> ordine **11 → 10 → 08 → 09**, misura dei token prima/dopo, revisore avversariale, giro vero con `glm-5.3-flash`.
> Parte DOPO la fusione del ramo `cli-req` (stesso file: `src/kernel/talosHarness.mjs`). Un agente Opus 5 **xhigh** per volta
> sul kernel (il file è uno: niente corsie parallele), una richiesta per commit, revisore dopo ogni coppia (11+10, poi 08, poi 09).

## Da dove viene
`git show bc17c98f:docs/talos-cli/handoffs/2026-09-17-CLI-REQ-08-11-agent-file-tools-like-hermes.md` (le RED sono lì) e il
confronto `git show b0d32717:docs/talos-cli/research/2026-09-17-hermes-agent-tools-comparison.md`. Hermes `98f758ae`,
`tools/file_tools.py:1088-1260`; un clone di Hermes a commit fissato è su disco in `%LOCALAPPDATA%\Temp\talos-competitor`
(leggi l'IMPLEMENTAZIONE del read-before-write e del fuzzy match: la lane della CLI ha letto solo schema e descrizione).
Motivo dell'owner: copiare il comportamento di Hermes «con il nostro tocco unico, dobbiamo distinguerci migliorando».

## Il vincolo che decide la forma: il BANCO resta confrontabile
Il banco confronta l'uscita degli attrezzi BYTE PER BYTE fra campagne (`talosHarness.mjs` ~1563, ~2774) e la lista base degli
attrezzi ha un'impronta. ⇒ «Additivo» qui vuol dire DUE cose, entrambe obbligatorie:
1. ogni parametro nuovo è FACOLTATIVO, e i nomi degli attrezzi e dei parametri esistenti non cambiano (né gli alias `path`/`filePath`);
2. il contratto nuovo si accende con UN interruttore del kernel (una opzione di `talosLavora`/dell'host, acceso di serie nel
   PRODOTTO, spento di serie nel BANCO): a interruttore spento definizioni e uscite sono identiche byte per byte a oggi, e una
   prova lo asserisce sull'impronta. ⛔ Le RED della CLI vogliono che `leggi` SENZA argomenti numeri e pagini: vale a
   interruttore ACCESO. Se trovi una forma migliore per tenere il banco confrontabile, fermati e scrivimela prima di farla.

## Misure già fatte (non rifarle, estendile)
`scratchpad/misura-righe-numerate.mjs`, 17/09, 501 file veri: forma `N|riga` **+7,2%** di caratteri (mediana +6,5%, p90 +8,3%,
max +20%), `cat -n` +12,7% ⇒ la forma è **`N|riga`**. Oggi `leggi` restituisce un file INTERO: il kernel da solo è 600.565
caratteri/10.025 righe; 10 file su 501 oltre 100.000 caratteri ⇒ il guadagno vero della 08 sono le PAGINE.

## Le quattro, nell'ordine
- **11 · `file_edit` mostra cosa ha cambiato.** Diff unificato del cambiamento, con tetto dichiarato e taglio DETTO. Il
  confronto resta ESATTO; il tollerante agli spazi solo come secondo tentativo dopo un mancato esatto, e il risultato LO DICE
  (mai in silenzio; decidi con la ricerca se farlo ora o lasciarlo fuori dichiarandolo). La ricevuta della scrittura e il
  cancello semantico non cambiano. Il diff serve anche alla Revisione del desktop: guarda cosa usa già (`aggiornaDiffReview`,
  gli eventi di scrittura) e non creare un secondo formato.
- **10 · niente sovrascrittura alla cieca.** `scrivi` in `create` su un file ESISTENTE rifiuta se la sessione non ne ha letto
  TUTTO il contenuto corrente (o non l'ha scritto lei) o se è cambiato sul disco da allora; il rifiuto dice di leggerlo e
  riprovare. `append` e i file nuovi restano come oggi. ⛔ Tocca la grammatica dei permessi: è un rifiuto del KERNEL, non una
  richiesta di approvazione, e non deve scavalcare né essere scavalcato da «sempre/chiedi/nega». ⛔ Con la 08 una lettura a
  PAGINE non è «tutto il contenuto»: definisci cosa conta (tutte le pagine lette senza cambi sul disco in mezzo) e provalo.
  Stato per sessione, non globale; sopravvive alla compattazione? dillo e provalo.
- **08 · `leggi` con righe numerate e pagine.** `offset` (da 1) e `limit` facoltativi; `N|riga`; tetto di caratteri tagliato a
  FINE RIGA che dice da dove continuare; su percorso sbagliato i nomi esistenti più vicini (senza percorsi assoluti, dentro il
  perimetro dei permessi: un suggerimento non deve rivelare file che la lettura negherebbe). File binari, righe lunghissime
  (una riga sola oltre il tetto), CRLF, file vuoto, BOM: ognuno col suo caso. ⛔ `file_edit` cerca il testo ESATTO: il modello
  non deve incollare il prefisso `N|` nel `old` — la descrizione dell'attrezzo lo dice, e un `old` che comincia con `N|` e non
  trova niente risponde con un suggerimento esplicito (misuralo in un giro vero).
- **09 · `cerca` restituisce le righe.** Righe con percorso e numero, `context` facoltativo, `limit`/`offset` col totale, modo
  «conta», filtro glob sui nomi; «solo percorsi» resta un modo (ed è l'uscita di oggi a interruttore spento). Resta il rispetto
  del `.gitignore` dalla radice vera della sessione (⛔ lezione del 10/09: `creaFiltro` vuole `{radice}`, e un catch che
  degrada in silenzio nasconde l'errore di contratto). Tetto di uscita dichiarato: una ricerca larga non deve riempire il contesto.

## Regole
Ricerca web prima di scrivere, fonte+data accanto alla cura. RED → GREEN → al contrario (ripristino per copia, sha256).
`npm run test:kernel` intero e la suite backend INTERA da sola a ogni richiesta; `npm run kernel:controlla` NON è una prova su
questa macchina (stampa «fonte non raggiungibile»). I testi che riceve il modello sono in inglese, minuscoli, fatto negativo per
primo (forma di `cerca`: «no file matches. …»). Niente nomi tecnici NUOVI a schermo nel desktop: se un'uscita nuova compare
nella chat o nella scheda Processi, guarda `frontend/src/components/nomi-attrezzi.js` e scrivimi cosa serve (il frontend non è
tuo). Mai 4174/4177/9333, nessun giro col modello (lo faccio io), mai `mobile/` né `core/`. `git.exe`, commit in inglese da
file, senza trailer. Prima di consegnare elenca i processi lasciati vivi e chiudili per PID.
**Misura obbligatoria nel rapporto:** per 08 e 09, caratteri restituiti prima/dopo su almeno dieci chiamate realistiche
(file piccoli, medi, il kernel; ricerche strette e larghe), a interruttore acceso e spento.

## Finita quando
Le quattro RED della CLI verdi a interruttore acceso; impronta e uscite identiche a oggi a interruttore spento (provato);
un giro vero mio con `glm-5.3-flash` in cui il modello legge a pagine un file grande, cerca, modifica citando righe, prova a
sovrascrivere senza aver letto e viene fermato; token del giro confrontati con un giro uguale a interruttore spento.
