# Automazioni

## Cosa fa

Fa ripartire un lavoro **da solo**, a intervalli: ogni tot minuti, con un tetto
di esecuzioni al giorno.

Per ognuna si vede: il nome, l'intervallo, se è attiva o in pausa, quante volte
è partita oggi sul totale consentito, quando è partita l'ultima volta e quando
partirà la prossima.

## Cosa non fa

- ⛔ **Non mostra esiti né costi.** Registra **il programma e gli avvii**: cosa
  sia poi successo dentro quella sessione si guarda nella sessione, non qui.
  Dedurre un esito da «è partita» sarebbe inventare.
- Quando il tetto giornaliero è raggiunto, non dice una data falsa per la
  prossima: dice «Limite giornaliero raggiunto».
- Se lo stato non è registrato, non mostra un interruttore: dice «Stato da
  verificare».
- Un'automazione in pausa non recupera gli avvii persi.

## Come si usa

Voce **Automazioni** nella barra laterale: si creano, si mettono in pausa, si
riattivano e si eliminano. Ogni automazione è legata a un'attività.

## Se va storto

- **«Nessun avvio registrato»** — non è ancora partita nemmeno una volta.
- **«Intervallo non registrato»** — l'automazione è incompleta: va rifatta.
- **Non parte** — controlla in quest'ordine: è attiva? il tetto giornaliero è
  già stato raggiunto? TALOS era acceso all'ora prevista?

> Verificato in `harness-ui/frontend/src/components/automazioni.js:13`, una riga
> sola da cui escono tutte le frasi citate qui sopra: «Intervallo non
> registrato», «Conteggio non disponibile», «Nessun avvio registrato», «In
> pausa», «Stato da verificare», «Limite giornaliero raggiunto», «Attività non
> registrata». Alla riga 27, quando lo stato non è registrato, al posto
> dell'interruttore compare la scritta «Stato da verificare».
