# Desktop -> Mobile Delta Template

Obbligatorio per ogni feature desktop creata o modificata dopo l'avvio
dell'implementazione mobile (parallel feature governance, MREG-010: una
feature desktop non puo chiudersi senza decisione delta mobile).

Compilare una copia di questo template per cambio e collegarla al ledger di
parita (`mobile/docs/feature-parity.json`).

```text
Delta ID:              DELTA-YYYY-NNN
Data:
Autore/agente:
Feature ID (parity):   <feature_id esistente o nuovo snake_case>
Cambio desktop:        <file/simboli/comportamento toccati, commit di riferimento>

1. Decisione mobile
   [ ] nessun impatto (motivo: ...)
   [ ] impatta superficie mobile esistente -> task mobile collegato: ...
   [ ] nuova capability -> nuova voce parity ledger (questo file + JSON)

2. Contratto condiviso
   [ ] nessun cambio di contratto
   [ ] contratto aggiornato una sola volta in: <path schema/envelope>
   schema_version: <n>  fixture valide/invalide aggiornate: <path>

3. Execution location mobile
   [ ] local_mobile  [ ] trusted_node  [ ] remote_provider  [ ] unavailable
   capability richieste: <lista>
   classificazione dati: <pubblici/privati/segreti>

4. Sync/conflitto (se la feature sincronizza)
   comportamento: <append-only/merge tipizzato/draft-only/escluso>
   conflitto: <oggetto conflitto visibile/merge automatico/na>

5. Stato offline e fallback
   comportamento airplane mode:
   stato controllato quando la capability manca (mai fake success):

6. Test
   desktop RED/GREEN: <test id>
   mobile RED/GREEN:  <test id o "bloccato: gate ...">
   parita semantica:  <fixture/test che prova lo stesso esito>

7. Gate
   desktop visual/human: <evidenza>
   mobile physical/human: <evidenza o blocco esplicito>
   stato globale promosso solo quando entrambe le superfici passano.

8. Rollback
   come si inverte senza rompere l'altra superficie:
```

Note:

- Una voce `verified` nel parity ledger richiede test eseguibili reali su
  entrambe le superfici; un mock non chiude la capability.
- Se il cambio desktop tocca un contratto condiviso, il parity ledger e i
  consumer (PHP/Zod/TS/Rust) vanno aggiornati nella stessa decisione, mai in
  silenzio.
