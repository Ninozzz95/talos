# TALOS Mobile

Android-first, iOS-ready TALOS Sovereign Node. Questa directory e di proprieta
esclusiva della lane Kimi K3 secondo il charter
`docs/superpowers/plans/2026-07-18-kimi-k3-mobile-program-charter-and-ledger.md`.

## Confini

- `mobile/` e un'applicazione Vue + Capacitor dedicata. Non incorpora Laravel,
  non impacchetta la workspace desktop in una WebView, non copia la UI desktop.
- Desktop TALOS e mobile sono peer: il desktop definisce i contratti di
  prodotto, non la disponibilita runtime del mobile.
- La fonte di verita del nodo mobile e un database locale cifrato (M2).
- Nessuna funzionalita mock presentata come reale: una capability assente
  dichiara il suo stato controllato e la dipendenza mancante.

## Stato attuale (M0, 2026-07-18)

Completato il parity ledger e i package condivisi di contratto:

```text
mobile/
  README.md                              questo file
  docs/
    feature-parity.json                  inventario desktop/mobile (20 feature)
    desktop-mobile-delta-template.md     template obbligatorio delta mobile
    upstream-provenance.md               pin, licenze, provenance, rollback
  packages/
    contracts/                           envelope versionati + parity entry (TS)
    design-tokens/                       identita tema condivisa, no renderer desktop
  scripts/
    verify-parity-ledger.mjs             verificatore CLI zero-dipendenze
    verify-parity-ledger.test.mjs        sua suite di test
```

La shell Capacitor (M1), `mobile/android`, il core Rust (M2) e ogni altra fase
successiva sono **bloccati** finche i gate del charter non vengono superati.

## Verifica (zero installazioni)

Richiede solo Node >= 22.18 (type stripping nativo; sviluppato su Node 24.18).
Nessuna dipendenza da installare: i package M0 non ne hanno.

```bash
node --test mobile/scripts/verify-parity-ledger.test.mjs
cd mobile/packages/contracts && npm test
cd ../design-tokens && npm test
node mobile/scripts/verify-parity-ledger.mjs mobile/docs/feature-parity.json
```

## Regole di parita

- Ogni feature desktop ha una voce in `docs/feature-parity.json` con owner,
  superficie mobile, execution location, capability, evidence, stato e test.
- `verified` solo con evidenza eseguibile reale; oggi nessuna voce lo e.
- Ogni modifica desktop successiva all'avvio mobile richiede un delta mobile
  documentato con `docs/desktop-mobile-delta-template.md` (regola MREG-010).
- Il verificatore CLI fallisce se una feature attesa manca, se gli owner
  escono dagli enum chiusi, se ci sono duplicati o `verified` senza test.
- Envelope e payload rifiutano campi sconosciuti; il discriminatore viene
  verificato prima del payload e ogni feature deve avere la stessa revisione
  desktop dello snapshot.
- Il package `design-tokens` accetta la forma portabile canonica
  `TalosThemeIdentity` V6: palette semantiche light/dark, tipografia e
  provenance, densita/raggio, poster locale, motion intent e accessibilita.
  Le configurazioni Canvas/DOM/FPS/DPR non appartengono al contratto mobile.
