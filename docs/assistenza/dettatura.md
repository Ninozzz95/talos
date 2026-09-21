# Dettatura e lettura ad alta voce

## Cosa fa

Due cose diverse, in due direzioni opposte.

**Dettare** — il microfono nel composer. Si tiene premuto, si parla, si
rilascia: il testo compare nel campo. Mentre parli il testo **parziale si vede**,
così sai che ti sta seguendo. La lingua del riconoscimento è l'italiano.

**Farsi leggere** — un pulsante sulla risposta dell'assistente la legge ad alta
voce, con le voci del sistema operativo.

## Cosa non fa

- ⛔ **Dettare non è offline.** Il riconoscimento vocale del browser manda
  l'audio a un servizio in rete: gira **dentro il browser**, ma non **dentro
  questo computer**. È un limite della piattaforma, non una scelta di TALOS, ed è
  diverso dal motore vocale del telefono, che invece è locale.
- ⛔ **Non c'è un ascolto sempre acceso.** Niente parola di richiamo: si tiene
  premuto e si parla. Una scheda che perde il fuoco perde anche il microfono —
  comportamento del browser, non nostro.
- ⛔ **Non tutti i browser lo hanno.** Fuori dai browser che espongono il
  riconoscimento vocale, il pulsante **lo dice** — «Questo browser non supporta
  il riconoscimento vocale» — invece di restare lì a non fare niente.
- **La lettura ad alta voce, invece, è locale** e ha un supporto più largo: usa
  le voci già installate nel sistema operativo.
- ⚠ *Non verificato dal vivo*: il riconoscimento vocale non esiste negli
  strumenti di prova automatici, quindi nessun test lo copre. Funziona o non
  funziona sotto il dito di una persona — è l'unica verifica che vale.

## Come si usa

1. Nel composer, tieni premuto il **microfono**.
2. Parla. Il testo compare mentre parli.
3. Rilascia. Il testo resta nel campo: **rileggilo e correggilo prima di
   inviare**.

Il servizio può fermarsi da solo dopo un silenzio prolungato, anche se non hai
rilasciato: in quel caso l'indicatore smette di dire «in ascolto», perché
mostrare un ascolto che non c'è più sarebbe una bugia.

## Se va storto

Ogni errore ha la sua frase, e sono gli errori veri del riconoscimento, non un
generico «qualcosa è andato storto»:

- **«Permesso microfono negato»** — abilitalo nelle impostazioni del browser per
  questo sito.
- **«Nessuna voce rilevata»** — non è arrivato audio.
- **«Il servizio di riconoscimento vocale non è raggiungibile in questo
  momento»** — è la rete.
- **«Nessun microfono trovato su questo dispositivo»** — manca l'apparecchio.
- **«Voce non disponibile»** — questo browser non espone il riconoscimento
  vocale affatto.

> Verificato in `harness-ui/frontend/src/legacy/app.js`
> (`creaRiconoscimentoVocale`, `lang = 'it-IT'`, i messaggi d'errore per
> `not-allowed` / `no-speech` / `network` / `audio-capture`) e in
> `harness-ui/frontend/src/bridge/legacy-dom.js` (`.talos-composer__mic`).
