# Cosa legge il modello prima del tuo messaggio

## Cosa fa

Prima ancora che tu scriva, TALOS consegna al modello un preambolo: poche cose,
scelte, in ordine da quella che cambia meno a quella che cambia di più.

1. **Le istruzioni del motore** — chi è, come si comporta. Non si toccano.
2. **Le istruzioni del tuo progetto** — il contenuto dei file `AGENTS.md` o
   `CLAUDE.md` che trova nella cartella su cui lavori. È il posto dove scrivi le
   regole che valgono per il tuo progetto.
3. **La mappa delle cartelle** — la forma del progetto, non l'elenco di tutti i
   file.
4. **La scheda di lavoro** — lo stato del versionamento, il permesso attivo, il
   modello, come si verifica il lavoro.

È il meccanismo che rende possibile far leggere **documenti** al modello senza
inventare niente di nuovo: un file di istruzioni nella cartella del progetto
arriva al modello a ogni invio.

## Cosa non fa

- ⛔ **Non manda l'elenco di tutti i file.** Fino all'11/09/2026 lo faceva, e su
  un progetto grande costava circa 17.000 parole-macchina per mostrare **il 30%**
  dei file — cioè si pagava molto per un elenco incompleto, e si diceva al
  modello di non fidarsene. Ora al posto dell'elenco c'è la mappa delle cartelle,
  e i file si cercano quando servono.
- **Le istruzioni di progetto hanno un tetto in byte: 24.000** di serie. Oltre
  quel tetto il testo viene tagliato — ma il taglio è **dichiarato**, e dice dove
  riprendere. Un file omesso per intero viene nominato. Il taglio avviene sui
  **byte**, non sui caratteri, e si ritaglia all'a-capo più vicino per non
  spezzare una riga a metà parola.
- **In una cartella vale un solo file**, cercato nell'ordine `AGENTS.md` poi
  `CLAUDE.md`. ⛔ Non si risale **mai** sopra la radice del progetto: un
  `AGENTS.md` nella tua cartella personale non viene letto.
- **Il contenuto della Libreria non entra da solo nel contesto.** Oggi il
  desktop ha una sola modalità: il modello legge un documento della Libreria
  **solo** se lo cerca o lo apre esplicitamente. Le altre modalità (iniezione
  automatica, ampia o selettiva) non esistono qui, e chiederle produce un
  rifiuto onesto invece di un silenzio.

## Come si usa

- Metti un file `AGENTS.md` (o `CLAUDE.md`) nella radice del progetto con le
  regole che vuoi che l'agente rispetti sempre.
- Puoi metterne uno anche in una sottocartella: vale per quella parte del
  progetto, e vince su quello più in alto.
- Tienili corti. Le istruzioni si pagano a **ogni** messaggio, non una volta
  sola.

## Se va storto

- **Le tue regole sembrano ignorate** — controlla che il file sia nella cartella
  della sessione, e che non sia oltre il tetto: in quel caso il preambolo lo
  dichiara.
- **La conversazione costa più del previsto** — il preambolo è la parte fissa
  che si paga sempre. Un file di istruzioni lungo è la causa più comune.

> Verificato in `harness-ui/src/contesto-del-progetto.mjs`, che nel titolo
> dichiara i **quattro** blocchi e il loro ordine, e riporta la misura dell'elenco
> file tolto l'11/09/2026 (17.149 token per il 30% dei percorsi). Il tetto delle
> istruzioni è `TETTO_BYTE_PREDEFINITO = 24_000` in
> `harness-ui/src/istruzioni-di-progetto.mjs:85`; i candidati, nell'ordine, sono
> `NOMI_CANDIDATI = ['AGENTS.md', 'CLAUDE.md']` (riga 88); il taglio si ritaglia
> all'a-capo più vicino (righe 180-181 per la testa, 183-184 per la coda) e i file omessi vengono nominati (righe 210-211,
> campo `omessi` e l'avviso che li elenca; restituito alla riga 214). Che non si risalga mai sopra la radice del progetto è dichiarato alla riga 48 —
> ⚠ in un **commento**, non in codice eseguito: il limite che morde davvero è
> `RISALITA_MASSIMA` (riga 91).
