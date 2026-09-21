# Board

## Cosa fa

È la tabella di tutte le sessioni di Harness Desktop. Le colonne, nell'ordine
in cui stanno a schermo, sono **dieci**:

**Sessione · Stato · Modello · Giri · Token · Cache · Primo token · Chiusa per ·
Costo · Avviata**

Le colonne di consumo — Giri, Token, Cache — parlano della **sessione intera**,
non dell'ultimo invio.

⛔ **La colonna «Costo» esiste ma non si vede.** È tenuta nascosta finché non
c'è la misura che la riempirebbe: il prodotto preferisce una colonna assente a
una cifra inventata. Se comparisse senza che nessuno l'abbia riempita, è un
difetto da segnalare.

Si ordina per colonna e si filtra.

## Cosa non fa

- ⛔ **Non legge dati di strumenti di misura esterni.** Fino al 30/08/2026 la
  Board mostrava i dati di un banco di prova esterno al prodotto: era un
  accoppiamento accidentale, ed è stato tolto del tutto. Oggi mostra soltanto le
  sessioni di Harness Desktop.
- Un consumo non misurato si mostra come trattino, mai come zero.
- Se domani nascesse una classe di stato che la tabella non conosce, la riga
  direbbe di non conoscerla e **la pagina resterebbe in piedi**: una riga
  sconosciuta non deve far cadere la tabella.

## Come si usa

Dalla voce **Board** della barra laterale.

## Se va storto

- **Una riga dice «Conclusa · esito non registrato»** — è una sessione vecchia
  senza esito salvato: non è un errore, ed è diverso da «riuscita».

> Verificato nel markup di `harness-ui/frontend/index.template.html:879`, dove le
> intestazioni della tabella stanno in quest'ordine — Sessione · Stato · Modello ·
> Giri · Token · Cache · Primo token · Chiusa per · **Costo** · Avviata — e la
> colonna «Costo» porta `hidden data-richiede="fase3"`. Le parole degli stati sono
> in `harness-ui/frontend/src/components/board.js:21` (`STATO`, compreso «Conclusa
> · esito non registrato»); i trattini al posto degli zeri alle righe 44-46. Che
> la Board non legga più un banco esterno lo dice
> `harness-ui/src/path-policy.mjs:4-15`, che racconta la rimozione del 30/08/2026
> di `campaign-service.mjs` / `report-source.mjs` / `cost-reader.mjs`; in
> `board.js` non resta un solo riferimento a quelle campagne.
