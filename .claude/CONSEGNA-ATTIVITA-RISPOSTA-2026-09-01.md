# Consegna — indicatore di attività della risposta

Data: 2026-09-01  
Stato: **implementazione e verifica locale GREEN; gate Qwen reale in attesa del
riavvio autorizzato di `4174`**.

## Cosa cambia per l’owner

La riga di attesa usa un solo segnale: tre punti TALOS che pulsano in sequenza,
più il tempo trascorso. La barra, la testa luminosa, lo sweep e lo shimmer
introdotti in precedenza sono stati rimossi. Gli stati esistenti —
elaborazione, ragionamento, preparazione e reindirizzamento — restano gli
stessi. Il primo testo o comando reale rimuove la riga.

Con movimento ridotto il moto si ferma, ma etichetta e tempo restano visibili.
Il timer viene sempre cancellato a fine risposta, cambio sessione e smontaggio
dell’app.

## File toccati

- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/tests/response-activity-indicator.test.mjs`
- `.claude/DOSSIER-RICERCA-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/LEDGER-ATTIVITA-RISPOSTA-2026-09-01.md`
- questo documento

## Evidenza fresca

- contratto dedicato: 4/4 pass;
- suite backend completa: 1252/1252 pass;
- browser desktop completo: 71/71 pass, un opt-in reale saltato;
- screenshot normali/riduzione movimento generati ex novo e ispezionati:
  `harness-ui/frontend/artifacts/visual-audit-2026-09-01/response-activity-dots-1440x900.png`
  e `response-activity-reduced-1440x900.png`;
- nel frame normale un solo punto è in fase attiva; in reduced motion tutti e
  tre restano visibili, uniformi e statici;
- barra, testa, sweep e shimmer: zero nodi e zero regole residue;
- `git diff --check`: pulito.

Le vecchie prove della barra non sono riutilizzate come evidenza del nuovo
componente.

## Riepilogo semplice

Il segnale è stato semplificato ai tre punti richiesti, senza uno spinner o una
barra estranei. Resta la verifica finale mentre Qwen risponde davvero, da fare
insieme al gate di ripresa e cambio modello dopo il riavvio autorizzato.
