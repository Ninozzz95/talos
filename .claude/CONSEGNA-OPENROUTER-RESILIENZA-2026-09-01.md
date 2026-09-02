# Consegna — OpenRouter resiliente e cambio modello

Data: 2026-09-01  
Stato: **GREEN sintetico, visivo e reale con Qwen 3.8 Flash**.

## Obiettivo owner

- Qwen non deve morire mentre OpenRouter sta ancora elaborando.
- Un provider realmente fermo deve fallire con un errore utile e ritentabile,
  senza tenere l'utente appeso all'infinito.
- Il cambio modello nella stessa chat deve mantenere conversazione, comandi,
  risultati, permessi e impostazioni anche dopo ricarica.
- Ogni risposta deve dichiarare il modello realmente usato in quel turno.
- I tre punti devono comunicare attività; la barra introdotta va rimossa.

## Evidenza iniziale

Il problema è riprodotto nei dati reali: timeout fisso a 180 secondi per Qwen
e richiesta Gemini rifiutata perché ha ereditato `reasoning:none`. Il server
`4174` resta acceso e non verrà riavviato senza autorizzazione fresca.

## Implementazione completata

- Il timeout OpenRouter è ora un limite di inattività: chunk, commenti
  keepalive e output rinnovano l'attesa. Non è più un cronometro totale che
  interrompe una risposta viva.
- Gli errori SSE prima del primo output possono seguire il percorso di retry;
  dopo testo o strumenti chiudono il giro senza duplicarlo. Lo stop owner resta
  immediato e distinto da un timeout.
- `eventsource-parser@4.1.0` (MIT) è integrato dietro l'adapter TALOS; il runtime
  proprietario e il dominio sessione non dipendono dal formato OpenRouter.
- Il catalogo espone le capacità di ragionamento. Il cambio modello salva in
  un'unica operazione modello ed effort compatibile: un modello che richiede
  ragionamento non eredita più `none`.
- Ogni `RunStarted` conserva modello e reasoning del giro. La UI e l'export
  attribuiscono ogni risposta al modello realmente usato, anche dopo switch e
  replay; messaggi e risultati strumenti restano nella stessa cronologia.
- L'indicatore è tornato a un unico segnale: tre punti animati. La barra e lo
  shimmer introdotti in precedenza sono stati eliminati.

## Evidenza fresca

- focused runtime/sessione: 409/409;
- focused browser switch/trace/indicatore: 5/5, poi 4/4 con catture;
- suite backend completa dalla radice corretta: 1252/1252;
- suite browser completa: 71/71, uno scenario reale opt-in saltato;
- `git diff --check`: pulito;
- health del server owner non riavviato: HTTP 200;
- screenshot ispezionati per intero:
  - `harness-ui/frontend/artifacts/visual-audit-2026-09-01/model-switch-reasoning-1440x900.png`;
  - `model-switch-turn-attribution-1440x900.png`;
  - `response-activity-dots-1440x900.png`;
  - `response-activity-reduced-1440x900.png`.

`npm audit --omit=dev` segnala due advisory high preesistenti nel ramo
`pptxgenjs@4.0.1 -> image-size`. Il fix suggerito richiede un downgrade
breaking e non è stato applicato. `eventsource-parser@4.1.0` non è il pacchetto
coinvolto.

Il backend aggiornato non è ancora caricato sul server `4174`; farlo richiede
un'autorizzazione fresca al riavvio. Senza quel passaggio non dichiariamo
risolto il timeout sulla rete reale.

## Aggiornamento autorizzazione processo — 2026-09-01

L'owner ha trasformato l'autorizzazione al riavvio in una regola permanente
per il solo server desktop `127.0.0.1:4174`. Non va più richiesta a ogni
riavvio. Restano vincolanti identificazione esatta di PID/command line/cartella
di lavoro, health prima e dopo, e tutela assoluta dei processi estranei.

## Chiusura reale autoritativa

Il server aggiornato è stato caricato su `4174`. La sessione reale
`a6f6bd06-cbc7-4a51-8d1a-9e1359aca756` ha completato due turni con il solo
modello autorizzato `qwen/qwen3.8-flash`, tre tool call (`cerca`, `elenca`,
`leggi`) e due `RunFinished success`. Gemini 3.7 Flash è stato usato soltanto
per verificare salvataggio e reload della scelta, senza inviare richieste.

La prova ha scoperto e corretto anche `RUN-MODEL-RESUME-RACE-10`: il modello
del follow-up poteva apparire generico quando il vecchio stream riceveva il
nuovo `RunStarted` durante la POST. Dopo la correzione entrambi i turni mostrano
Qwen anche dopo reload. Screenshot ed evidenza sono in
`harness-ui/frontend/artifacts/real-qwen-gate-2026-09-01/`.

## Riepilogo semplice dello step

Le tre cause sono state corrette senza cambiare conversazione: TALOS aspetta
finché il provider dimostra attività, adatta il ragionamento alle capacità del
modello scelto e registra quale modello ha prodotto ogni turno. Tutti i test e
gli screenshot locali sono verdi; resta soltanto la prova reale dopo riavvio.
