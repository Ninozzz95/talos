# Dossier — resilienza del server 4174 (02/09/2026)

> Owner, dopo l'incidente `TALOS_OWNER_RUNTIME_MODULE`: *"fai in modo che il
> server si riavvii tutto automaticamente, ricerca web di come fanno i
> migliori."* Fatto misurato che ha aperto la ricerca:
> `.claude/LEDGER-RUNTIME-OWNER-MODULE-2026-09-02.md` — non un crash, un
> processo VIVO che non faceva il suo lavoro per una configurazione mancante,
> rimasto invisibile due giorni perché nessuno l'aveva riavviato.

## Due problemi diversi, non uno solo

1. **Configurazione mancante scoperta tardi** (il caso di oggi): il processo
   non crasha mai, resta "sano" su un controllo superficiale, ma non lavora.
   Nessun supervisore di processo lo intercetta, perché per un supervisore
   quel processo È vivo.
2. **Crash vero**: il processo muore per davvero (eccezione non gestita,
   OOM, ecc.) e va rilanciato.

## Fatto già, per il problema 1

`server.mjs` ora chiama il Doctor (già scritto, mai collegato prima di
oggi — vedi il ledger) UNA volta all'avvio e logga forte se il runtime non
è configurato o se sessioni sono corrotte al ripristino. Stesso principio
di `hermes doctor`/`claude doctor` — verificato oggi: entrambi fanno
esattamente questo, un comando/controllo dedicato che *"checks config
validity, dependency presence... e può tentare riparazioni automatiche con
--fix"* ([Hermes FAQ](https://hermes-agent.nousresearch.com/docs/reference/faq)).
TALOS aveva già il controllo scritto (`doctor.mjs`, con esattamente i campi
`ownerRuntime`/`sessioniPersistenza` che servivano) — mancava solo che
qualcosa lo chiamasse da solo.

## Non fatto — proposta per il problema 2 (crash vero), decisione owner

Node.js best practice 2026, fonti primarie:
- [nodebestpractices — guardprocess](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/production/guardprocess.md):
  un singolo processo Node è un singolo punto di guasto; un supervisore
  esterno (PM2 o systemd) è la pratica raccomandata, non un riavvio scritto
  a mano dentro l'app stessa.
- [LogRocket — PM2](https://blog.logrocket.com/best-practices-nodejs-process-management-pm2/):
  PM2 riavvia SUBITO un processo che crasha, con un tetto ai tentativi
  (es. 5 volte, 3 secondi fra un tentativo e l'altro) per non entrare in un
  ciclo di crash infinito — un dettaglio che un riavvio "a mano" scritto in
  fretta dimentica quasi sempre.
- Pratica condivisa: **health check ≠ processo vivo**. Un health check deve
  verificare che l'app risponda per davvero alle richieste, non solo che il
  processo esista — esattamente il problema 1 sopra, con le stesse parole
  usate dalla ricerca.

### Tre opzioni, non decise qui

| opzione | costo | adatto quando |
|---|---|---|
| **PM2** | una dipendenza nuova (`npm install -g pm2` o locale), configurazione `ecosystem.config.js` | uso da riga di comando, sviluppo continuo |
| **Servizio Windows nativo** (`node-windows`, o un servizio registrato dall'installer futuro) | dipendenza nuova o lavoro dentro l'installer già in programma (vedi `LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md`, punto 4) | quando l'app diventa un installer vero, non più "lanciato a mano" |
| **Script watchdog minimo, zero dipendenze** | poche righe: un processo separato che fa `health` ogni N secondi e rilancia `server.mjs` se non risponde, con lo stesso tetto-tentativi di PM2 | se si vuole restare fedeli al vincolo "zero npm install" già dichiarato in `runtime-owner-adapter.mjs` |

**Non scelgo qui quale delle tre**: la terza rispetta il vincolo già scritto
nel codice di questo repository ("zero npm install"), le prime due sono lo
standard di settore ma aggiungono una dipendenza — è una scelta di
architettura per l'owner, specialmente perché l'app è destinata a un
installer (la terza opzione potrebbe comunque essere temporanea).

## Stato

✅ Problema 1 (configurazione mancante invisibile) risolto oggi, verificato
dal vivo. 🔜 Problema 2 (crash vero) ricercato, non implementato — tre
opzioni con costo dichiarato, decisione owner.
