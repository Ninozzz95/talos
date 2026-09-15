# Note

## Cosa fa

È la casa degli appunti: quello che TALOS ha annotato mentre lavorava, e quello
che scrivi tu.

Una nota è **un documento di chi la legge**, non uno stato di un flusso di
lavoro: l'agente la scrive, tu la cerchi, la apri, la copi, te la porti via.

I tempi sono relativi fino a 24 ore («oggi 14:32», «ieri 09:10»), poi diventano
date.

## Cosa non fa

- Non ha stati, non ha flussi, non ha assegnatari. Per quello ci sono le
  [Attività](attivita.md).
- Una nota senza titolo **non** diventa «(senza titolo)»: prende la sua prima
  riga di testo. Un titolo inventato è peggio di nessun titolo.
- Una nota senza data non mostra una data finta.

## Come si usa

Dalla voce **Note** della barra laterale: si creano, si aprono, si modificano e
si eliminano, sia da te sia dall'agente, con le stesse funzioni.

## Se va storto

- **Il contatore accanto a «Note» dice un numero ma non trovi le note** — era un
  difetto vero del 06/09/2026, poi corretto: il contatore c'era e la pagina no.
  Se dovesse ripresentarsi, è un difetto da segnalare, non un tuo errore.

> Verificato in `harness-ui/frontend/src/components/note.js`: una nota senza
> titolo prende la sua prima riga di testo (righe 14-19), e i tempi restano
> relativi fino a 24 ore — «oggi 14:32», «ieri 09:10» — poi diventano date (righe
> 22-33).
