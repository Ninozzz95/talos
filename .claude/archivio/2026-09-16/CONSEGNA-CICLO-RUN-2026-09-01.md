# Consegna — ciclo corsa desktop

Data: 2026-09-01  
Perimetro: solo Harness Desktop; mobile usato esclusivamente come riferimento.

## Cosa è stato chiuso

- Quando TALOS elabora o ragiona, la conversazione mostra uno stato visibile e
  accessibile; con movimento ridotto resta il testo ma non l'animazione.
- Durante una risposta il pulsante Invia diventa Stop.
- Un follow-up inviato con Enter resta nella coda ordinaria e aspetta il turno
  successivo.
- Con testo presente compare Reindirizza: la correzione viene applicata al
  primo punto sicuro nella stessa sessione, senza consumare la coda.
- Stop annulla un reindirizzamento ancora pendente e chiude in modo sicuro una
  eventuale richiesta di approvazione.
- La UI non lampeggia falsamente da Stop a Invia fra il giro interrotto e la
  ripartenza.
- Un timeout prima del primo token non perde più la correzione: conserva il
  contesto già noto o ricostruisce il primo task senza inventare messaggi.
- Il runtime locale conserva richiesta, risposta parziale e correzione nello
  stesso contesto; dopo un reload viene scelto l'ultimo snapshot disponibile.
- Un riavvio chiude esplicitamente un redirect rimasto a metà. Anche se le
  scritture sul disco arrivano fuori ordine, il replay usa la sequenza logica e
  non produce collisioni che il browser potrebbe scartare.
- Anche nella gara inversa, in cui Stop raggiunge il server prima della
  richiesta Reindirizza, lo stesso identificatore generato dal browser viene
  invalidato: il run non riparte tardi e il testo resta nel composer.
- Stop prevale su una risposta HTTP tardiva: il testo resta nel composer e un
  redirect già pendente non offre un secondo pulsante destinato a fallire.

## Verifiche

- backend completo: **1203/1203**;
- browser completo: **47/47**;
- build UI: **23 asset**; verifica contratti/build/determinismo verde;
- server owner `4174`: health `200`, mai interrotto;
- server isolato `4175`: endpoint reale e correlazione redirect verificati;
- Qwen 3.8 Flash reale: timeout iniziale recuperato dal redirect, seconda
  corsa conclusa con risposta esatta `OK` nella stessa sessione;
- screenshot 1440×900, 1280×800 e 1024×800 ispezionati integralmente;
- reduced-motion e casi contrari coperti da test permanenti.

La prova Qwen e le prove visuali sono due ricevute complementari ma separate:
la prima attraversa runtime/API/SSE reali sul server isolato; gli screenshot
sono stati prodotti dal server locale di test con gli stessi handler UI e
stati evento deterministici. Il browser integrato non era disponibile, quindi
non viene dichiarato uno screenshot del turno Qwen reale.

## Debiti non nascosti

- A 1024 px il rail destro resta tagliato (`DESKTOP-1024-COMPOSER-RAIL-01`):
  era già censito e resta nella fase layout.
- Il primo giro Qwen del gate isolato ha mostrato un timeout prima del primo
  token; il redirect ha recuperato davvero il giro e il secondo ha risposto
  `OK`. Il timeout resta evidenza di latenza/affidabilità del provider, mentre
  il recupero TALOS è provato end-to-end e non soltanto con fixture.
- Il processo owner su `4174` resta volutamente intatto; il nuovo endpoint
  backend sarà disponibile lì solo al prossimo riavvio autorizzato.
- A `1280×800` l'intera composizione resta leggibile; a `1024×800` permane il
  solo debito di rail già nominato sotto.

## Prossimo blocco già deciso dall'owner

Subito dopo questa consegna: riprogettazione della modale Nuova sessione con
file tree reale da `C:\`, scorciatoie consigliate che riposizionano lo stesso
albero e colonna destra per modello/reasoning/permessi. Il contratto è registrato
in `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`; prima del codice servono
ricerca completa, threat model e ledger file-per-file.

## Riassunto semplice

Prima TALOS poteva sembrare bloccato e l'utente aveva solo una coda lenta o uno
Stop separato. Ora si vede cosa sta succedendo, si può fermare dal composer,
lasciare un messaggio per dopo oppure correggere subito la direzione. Le tre
azioni sono distinte e la correzione non fa sparire i messaggi già in attesa.
