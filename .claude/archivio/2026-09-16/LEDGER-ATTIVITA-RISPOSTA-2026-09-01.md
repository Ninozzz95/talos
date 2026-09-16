# Ledger a livello di codice — attività risposta percepibile

Data: 2026-09-01  
Stato iniziale: **RED visivo nello screenshot owner**.

## File esatti

### Modificare

- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`

### Creare

- `harness-ui/tests/response-activity-indicator.test.mjs`
- `.claude/DOSSIER-RICERCA-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/LEDGER-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/CONSEGNA-ATTIVITA-RISPOSTA-2026-09-01.md`

### Eliminare

- Nessuno.

## Simboli e compatibilità

- `state.realSession.attesaTimer`: intervallo del solo tempo visivo.
- `state.realSession.attesaAvviataA`: istante monotono di apertura.
- `mostraAttesaRisposta(stato)`: conserva stati/testi esistenti; rende tre
  punti animati e il tempo trascorso, senza una barra concorrente.
- `nascondiAttesaRisposta()`: rimuove nodo e timer sempre, anche se il nodo è
  già stato sostituito da una nuova sessione.
- Classi CSS coinvolte: `.talos-line-loader-node`,
  `.run-activity-elapsed`.
- Keyframe coinvolto: `talosLineNodePulse`.
- Token semantico `--motion-response-activity`, alimentato da
  `--talos-motion-duration-response-progress` in `aggiornaMotionDesktop(safe)`:
  conserva i 1600 ms canonici e segue scala/profilo del motion engine.
- Compatibilità: nessun endpoint, evento, ID DOM, testo di stato o contratto
  del composer cambia.

## RED permanenti

1. `RESPONSE-ACTIVITY-DOTS-08` — esistono esattamente tre punti con animazioni
   infinite basate su token/trasformazioni; barra, testa e shimmer non esistono.
2. `RESPONSE-ACTIVITY-LIFECYCLE-02` — il DOM include i tre punti e il tempo;
   `nascondiAttesaRisposta` cancella l’intervallo.
3. `RESPONSE-ACTIVITY-REDUCED-03` — `prefers-reduced-motion` e
   `.reduce-motion` fermano la pulsazione senza nascondere punti, stato e tempo.
4. `RESPONSE-ACTIVITY-INVERSE-04` — il timer non sopravvive al cambio sessione
   o alla rimozione del loader.

## Gate

- focused Node test del contratto indicatore;
- suite backend completa per verificare che il bundle statico e le route non
  regrediscano;
- pagina reale `4174`: avvio Qwen autorizzato, screenshot durante il silenzio
  pre-token e ispezione completa della pagina;
- prova movimento ridotto: niente shimmer/sweep, testo e tempo leggibili;
- `git diff --check`.

## Rollback

Rimuovere soltanto le tre classi visuali, i due keyframe, i due campi timer e
il test nominato. Il loader a tre nodi e il lifecycle di risposta esistenti
restano intatti.

## Stato 01/09/2026

Implementazione aggiornata ai tre punti; la verifica sintetica e visiva viene
eseguita soltanto dopo la chiusura di tutti i blocchi OpenRouter/switch modello,
come richiesto dall'owner. Il gate Qwen reale resta subordinato al riavvio
autorizzato del backend.
