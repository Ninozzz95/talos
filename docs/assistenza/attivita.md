# Attività

## Cosa fa

L'elenco delle cose da fare della sessione, con tre stati e tre priorità.

- Stati: **Da fare**, **In corso**, **Fatta**.
- Priorità: **bassa**, **normale**, **alta**.

In cima c'è un riepilogo onesto: quante aperte, quante fatte, e — se ce ne sono
— quante hanno uno **stato non registrato**, contate a parte invece di essere
messe d'ufficio fra le une o fra le altre.

Si filtra per stato e si cerca nel testo.

## Cosa non fa

- Non ha scadenze né promemoria.
- Non deduce lo stato: se un'attività non ce l'ha, dice «Stato non registrato».
- Non mostra un autore inventato: se non c'è, dice «Autore non registrato».

## Come si usa

Dalla voce **Attività** della barra laterale: si creano, si aprono, si
modificano e si eliminano. Le stesse attività le può creare e aggiornare
l'agente mentre lavora.

Le attività sono anche ciò che una [automazione](automazioni.md) può far
ripartire da sola.

## Se va storto

- **Una riga dice «Stato non registrato»** — non è un guasto: quel dato manca
  davvero, e il prodotto preferisce dirlo.

> Verificato in `harness-ui/frontend/src/components/attivita.js`: i tre stati
> (righe 4-6: `todo` «Da fare», `doing` «In corso», `done` «Fatta») e le tre
> priorità (riga 8: «Priorità bassa», «Priorità normale», «Priorità alta»); il
> ripiego «Stato non registrato» alla riga 9 e «Autore non registrato» alla riga
> 16; il riepilogo che conta a parte gli stati non registrati è
> `riepilogoAttivita`, righe 18-20.
