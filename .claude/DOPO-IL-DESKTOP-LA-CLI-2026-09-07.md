# Dopo il desktop, la CLI — la direzione decisa il 07/09/2026

> Owner: «dopo l'harness (app desktop) faremo anche la **versione CLI tipo pi agent**, minimale ma
> **con tutte le funzionalità**».

⛔ **Quando**: dopo il rilascio del desktop. Inseguire due prodotti mentre il primo non è uscito è
il modo per non finirne nessuno.

## Perché è meno lavoro di quanto sembri

Il motore c'è già ed è **un file**: `harness-ui/src/kernel/talosHarness.mjs` — 6.260 righe, solo
`node:*`, **65 export**, con la sua suite da 538 prove che dal 07/09 gira nei nostri cancelli. Fa il
ciclo agente intero: attrezzi, compattazione del contesto, ritentate, flusso SSE, cancello semantico,
ricevute firmate.

⇒ La app desktop è **un consumatore** di quel motore. La CLI sarebbe **un secondo consumatore**, non
un secondo prodotto. Il lavoro del 07/09 (kernel dentro il repo, con default e cancelli) è
esattamente ciò che la rende possibile a costo basso.

## La regola che decide se andrà bene o male

⛔ **Zero logica d'agente nella CLI.** Solo: leggere gli argomenti, disegnare a terminale, stampare.
Il momento in cui la CLI riscrive «solo un pezzettino» del ciclo è il momento in cui nascono due
TALOS che si comportano diversamente.

Non è una preoccupazione teorica: è già successo con il kernel stesso, e costa. La decisione del
02/09 (`DECISIONE-KERNEL-DUE-COPIE-2026-09-02.md`) nasce da due copie divergenti — **27 export in
comune, 3 solo di qua, 37 solo di là** — che nessuno confrontava.

## La domanda architettonica da sciogliere PRIMA di scrivere una riga

Il ciclo agente sta nel kernel, ma i **servizi** stanno nel server: registro delle sessioni,
permessi per attrezzo, ricevute, skill, memoria, note (`harness-ui/src/session-registry.mjs`,
`config.mjs`, `skill-registry.mjs`, `public-problem.mjs`…). Una CLI «con tutte le funzionalità» deve
sceglierne una:

- **(a) client HTTP**: parla col server locale. Semplicissima, ma vuole il server acceso — e allora
  «minimale» non è più vero.
- **(b) stessi moduli in-process**: la CLI importa gli stessi file del server. È la strada giusta, e
  chiede una cosa sola: che quei moduli non dipendano dal fatto di stare dentro un server HTTP.
  ⇒ È la stessa mossa fatta col kernel, un piano più sopra: estrarre ciò che oggi si chiama
  «server» ma in realtà è **prodotto**.

## Cosa avremmo in più di `pi`

`pi` (earendil-works/pi, letto il 07/09/2026) è minimale **per scelta dichiarata**: niente
sub-agenti, niente plan mode; in cambio ha quattro modi — interattivo, print/JSON, **RPC** e SDK — e
un'estensibilità forte (skill, template, temi, pacchetti).

Noi arriveremmo con quello che loro hanno tolto: **deleghe a sotto-agenti**, **permessi per
attrezzo con approvazione**, **cancello semantico**, **ricevute firmate**. E il loro modo **RPC** è
esattamente il ponte che farebbe parlare CLI e desktop sulla stessa sessione.

⛔ Da tenere invece: la loro lezione sul *minimo*. «Tutte le funzionalità» non vuol dire tutti i
pannelli — a terminale una funzione che non si può vedere in venti righe è una funzione che nessuno
userà.
