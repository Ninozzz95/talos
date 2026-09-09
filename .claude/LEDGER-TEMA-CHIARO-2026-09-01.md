# Ledger esecutivo — tema chiaro leggibile

Data: 2026-09-01
Stato iniziale: RED visivo e strumentato. Stato finale: **GREEN**.

## File

### Creare

- `.claude/DOSSIER-RICERCA-TEMA-CHIARO-2026-09-01.md`
- `.claude/LEDGER-TEMA-CHIARO-2026-09-01.md`

### Modificare

- `harness-ui/public/app.js`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/CONSEGNA-FRONTEND-PHASE0-2026-08-31.md`

### Eliminare

- Nessuno.

## Simboli e compatibilità

- `applicaThemeDesktop(safe)`: firma invariata; deve assegnare anche i token
  semantici derivati `--talos-code-bg`, `--talos-panel-soft`, `--talos-card`,
  `--talos-window-bg`, `--talos-assistant-text`,
  `--talos-border-strong`, `--talos-accent-hover`,
  `--talos-accent-soft`, `--talos-accent-border`, `--talos-accent-text`,
  `--talos-secondary`, `--talos-success`, `--talos-success-soft`,
  `--talos-success-border`, `--talos-danger`, `--talos-danger-soft`,
  `--talos-info`, `--talos-ring` e `--talos-ring-soft`.
- `TALOS_THEME_TOKENS`: forma pubblica interna invariata; i valori base dei
  preset restano la fonte e i token secondari vengono derivati dal modo colore.
- Nessun formato persistito, endpoint o contratto mobile viene modificato.

## RED permanente

- `VISUAL-CONTRAST-LIGHT-ASSISTANT-01`: in modalità chiara una risposta
  assistente reale/sintetica visibile usa il token runtime
  `--talos-assistant-text`, non il fallback Calm scuro; il contrasto calcolato
  tra foreground e fondale è almeno 4.5:1. Lo stesso test verifica che pannello
  soft, card e border forte non abbiano i fallback scuri standalone.

## Sequenza

1. Aggiungere il test browser e osservarlo fallire con `#d6d2ca`.
2. Completare i token in `applicaThemeDesktop()` senza aggiungere un secondo
   store o valori fuori dal theme engine.
3. Eseguire il test focused, poi suite browser e backend complete.
   Se il gate di estrazione segnala soltanto hash/byte/righe diversi per asset
   intenzionalmente modificati, aggiornare quei tre metadati lasciando invariati
   globali, storage, eventi, asset pubblici, endpoint e frame terminale.
4. Acquisire screenshot stabile 1440x900 della sessione Qwen persistita, senza
   nuove chiamate modello, e ispezionarlo per intero.
5. Controllare salute e risorse del processo `4174`, `git diff --check` e
   aggiornare consegna/QA.

## Gate e rollback

- Focused GREEN: scenario browser nominato.
- Regressioni: suite browser completa e test backend completi.
- Prova umana: testo finale, tool summary, meta, composer e rail leggibili nel
  tema chiaro; nessun pannello scuro spurio.
- Rollback: rimuovere esclusivamente le nuove assegnazioni token e il test. Le
  preferenze persistite restano compatibili perché schema e valori non cambiano.

## Evidenza finale

- RED osservato: `--talos-assistant-text` assente e risposta calcolata come
  `rgb(214, 210, 202)` sul fondale chiaro.
- GREEN focused: `VISUAL-CONTRAST-LIGHT-ASSISTANT-01`, 1/1.
- Contrasto misurato sulla risposta reale persistita: **12:1**.
- Backend completo: **1253/1253**.
- Browser completo: **73 pass, 2 gate reali opt-in skipped**.
- `npm run verify`: build, contratti, determinismo e laboratorio GREEN.
- `git diff --check`: pulito.
- Screenshot ispezionato per intero:
  `harness-ui/frontend/artifacts/real-qwen-gate-2026-09-01/06-qwen-light-tokens-fixed-1440x900.png`.
