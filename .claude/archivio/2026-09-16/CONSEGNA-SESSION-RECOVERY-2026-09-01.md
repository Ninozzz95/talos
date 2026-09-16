# Consegna — ripresa robusta delle sessioni

Data: 2026-09-01  
Stato: **codice e review indipendente GREEN; applicazione sul server owner in
attesa di riavvio esplicito**.

## Cosa è stato chiuso

- Le sessioni concluse con errore e quelle interrotte da un riavvio possono
  ricevere un nuovo messaggio sullo stesso ID.
- Il contesto ripristinato contiene soltanto input utente e risposte complete;
  ragionamento, tool e testo assistant incompleto non vengono promossi.
- Il nuovo input è salvato prima del runtime in un checkpoint versionato.
- Snapshot tardivi, checkpoint fra due giri, rigetti Promise e resume
  concorrenti non possono perdere testo o classificare male la sessione.
- Anche un giro avviato da Reindirizza conserva durevolmente la correzione.
- Il boundary HTTP accetta solo il body previsto e rende pubblico un errore di
  salvataggio ritentabile con stato 503.

## File toccati

- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/http-routes-sessions.test.mjs`
- `.claude/DOSSIER-RICERCA-SESSION-RECOVERY-2026-09-01.md`
- `.claude/LEDGER-SESSION-RECOVERY-2026-09-01.md`
- questo documento

## Evidenza fresca

- scenari nominati `SESSION-RECOVERY`: **23/23 pass**;
- suite interessata session registry + HTTP: **323/323 pass** nella review
  indipendente, **327/327 pass** includendo il contratto UI dell’attività;
- suite backend completa: **1242/1242 pass**;
- `git diff --check`: pulito;
- la re-review indipendente ha dichiarato chiusi entrambi gli HIGH residui.

## Gate ancora aperto

Il processo `4174` carica ancora la versione precedente del backend. Non è
stato riavviato durante l’implementazione. Dopo autorizzazione owner serve un
solo riavvio breve, poi: health 200, elenco coerente, resume della sessione
`b9d67958-93fb-4f44-b06a-12e584b5c513`, messaggio reale esclusivamente con
`qwen/qwen3.8-flash`, reload e controllo della stessa cronologia.

## Riepilogo semplice

Il difetto non viene aggirato creando una chat nuova: TALOS conserva ciò che è
stato realmente accettato e riapre la stessa conversazione senza duplicarla.
Il codice è verificato; manca soltanto caricarlo nel server già aperto e
provare una risposta reale, operazione che richiede il consenso al riavvio.
