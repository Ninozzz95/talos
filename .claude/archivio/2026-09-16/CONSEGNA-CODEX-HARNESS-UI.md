# CONSEGNA per CODEX — l'interfaccia del banco/harness

> Il piano. Le regole di lavoro, il ramo, l'albero e i confini stanno in
> `.claude/PROMPT-CODEX-HARNESS-UI.md`: **leggi quello per primo.**
>
> Qui dentro: perché questo lavoro parte adesso, cosa è già vero, e la
> roadmap in ordine.

# 0 · Il fatto che apre tutto

Il mockup porta scritta addosso la sua stessa regola: *"non implementare
finché l'harness non è stabile"*. Quella regola aveva 4 giorni. Due cose
sono cambiate insieme:

1. Il **formato dati** del banco (riga di comando, JSONL) è fermo da
   settimane — non ha motivo di cambiare per il lavoro in corso su
   `talosHarness.mjs`.
2. L'**euristica interna** di `talosHarness.mjs` è appena tornata in
   movimento (Stadio A chiuso il 23/8, Stadio B in corso ora).

⇒ La domanda giusta non era "l'harness è stabile sì/no": è QUALE strato.
Il contratto dati (§4 del prompt) è lo strato fermo. Costruisci contro
quello.

# 1 · Cosa è VERIFICATO — dalla sessione principale, stasera

- Il mockup esiste ancora, intatto, al percorso del §3 del prompt — 18
  file, confermato con un elenco diretto della cartella.
- `esiti-22ago-storia/` contiene una campagna reale, chiusa, 40 righe,
  pubblicabile — è il dataset su cui provare la prima versione.
- `rapportoCampagna.mjs` produce un rapporto testuale reale su quella
  cartella (già rigenerato stasera, funziona).
- `TALOS-BANCO` **non è un repository git** — verificato con
  `git status` diretto (`fatal: not a git repository`). Per questo lavori
  in `AVM-harness-ui`, non lì dentro.

# 2 · Cosa NON è verificato — lo scopri tu, lavorando

- Se il formato JSONL ha delle irregolarità fra campagne diverse (righe
  malformate, campi mancanti su corse vecchie) — il tuo lettore deve
  reggerle senza crashare, dichiarando cosa non è riuscito a leggere.
- Quanto tempo impiega il browser a renderizzare una campagna grande (la
  sweep di Stadio A ha 33+ righe per un solo harness; una campagna con
  tutti e 8 gli harness ne avrebbe centinaia).

# 3 · La roadmap, in ordine

## Blocco 1 — l'innesto completo del mockup (§6 del prompt)

Tutte le 18 schermate/sezioni, esteticamente e strutturalmente complete,
con lo stato "non ancora collegato" ovunque non c'è un dato vero dietro.
Verifica: apri ogni schermata del mockup originale e la sua controparte
nuova, side by side — devono corrispondere.

## Blocco 2 — il server e le sezioni con un corrispettivo reale

Elenco campagne, righe per harness, pass-rate, costo, il rapporto
testuale — collegati a `esiti-22ago-storia/` per primi (è il dataset più
pulito e completo che esiste). Verifica: i numeri mostrati a schermo
corrispondono a quelli che `rapportoCampagna.mjs` stampa da riga di
comando sulla stessa cartella — stesso numero, non un'approssimazione.

## Blocco 3 — le 6 risoluzioni del mockup, riprovate sui dati veri

`UI_REVIEW.md` ha già la matrice QA per 6 risoluzioni (desktop, laptop,
tablet, mobile, mobile stretto, capacità). Riprovarle con dati reali
dentro, non con i dati finti del mockup — un layout che regge con 3 righe
finte può rompersi con 40 righe vere.

## Blocco 4 e oltre — non ancora assegnati

Il collegamento delle sezioni rimaste "non ancora collegato" (coda,
fogli, approvazioni) è lavoro futuro: quale sezione, in che ordine, si
decide guardando cosa il banco può davvero offrire quando arriva il
momento — non è una lista fissa da eseguire alla cieca.

# 4 · I cancelli

- ⛔ Prima di dichiarare un Blocco chiuso: uno screenshot (o una
  descrizione precisa, campo per campo) della schermata su dati veri.
- ⛔ Il Blocco 1 non è chiuso finché OGNI sezione del mockup ha una
  controparte a schermo, anche solo come stato dichiarato.
- ⛔ Nessun blocco successivo si apre finché il precedente non è
  verificato — stessa disciplina "a blocchi dopo il via" di ogni altro
  lavoro in questo progetto.

# 5 · Cosa NON si fa

- Non si inventa un dato per far tornare una sezione "collegata".
- Non si cambia il contratto dati (§4 del prompt) da soli — se serve un
  campo nuovo, si dichiara e si aspetta.
- Non si tocca `AVM-harness` né `TALOS-BANCO`.
