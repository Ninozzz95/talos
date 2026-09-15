# Review

## Cosa fa

Mostra **cosa la sessione ha cambiato**, prima che tu lo accetti: l'elenco dei
file toccati e, per ognuno, il confronto riga per riga fra prima e dopo.

Per ogni file si vede anche **in quale giro** è stato scritto, se è un file
nuovo, e — quando c'è — la **ricevuta firmata** di quella scrittura.

## Cosa non fa

- La ricevuta compare **solo** se quella modifica ne porta una. Non ne viene
  inventata una per riempire lo spazio.
- ⛔ **Oggi «accetta» e «scarta» per singolo file NON ci sono.** Esistono nel
  markup e sono **tenuti nascosti apposta**, insieme a «Apri nell'editor»:
  aspettano la rotta che li farebbe funzionare. È la regola del prodotto — mai
  un pulsante che non fa niente — applicata invece che dichiarata.

  ⇒ Quello che la Review fa oggi è **mostrare**, non decidere. Le modifiche
  restano sul disco: la revisione serve a guardarle, non ad approvarle una per
  una.

  > Verificato in `harness-ui/frontend/src/components/review.js:136`: la
  > funzione si chiama **`nascondiAzioniFase3(radice)`** e mette `hidden = true`
  > su ogni nodo `[data-richiede="fase3"]`. Le righe 11-12 dello stesso file dicono
  > perché: «Accetta/Scarta vogliono rotte che il contratto congelato non ha».
  > Quei nodi nascono già `hidden` nel markup di
  > `harness-ui/frontend/index.template.html`.
  > ⛔ Correzione del 13/09/2026: qui era scritto un nome diverso —
  > **nascondiFase3**, senza «Azioni» — che **non esiste in nessun file del
  > repository**. Non è ricopiato qui come codice apposta: un nome falso scritto
  > fra apici inversi è esattamente ciò che il centro assistenza ripeterebbe a
  > qualcuno come se fosse vero.

## Come si usa

Si apre dalla sessione. Si scorre l'elenco dei file e si guarda il confronto di
quello selezionato.

## Se va storto

- **Un file che ti aspetti non c'è** — o non è stato toccato, o è stato scritto
  per una strada che non passa dalla revisione (per esempio un comando nel
  terminale). Vedi [Terminale](terminale.md).
