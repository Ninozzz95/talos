# Ledger tecnico — debiti mobile post-Codice — 2026-08-25

Owner: Antonino  
Sottosistema proprietario: TALOS UI mobile (`mobile/`)

## Regole di avanzamento

- Un debito alla volta, nell'ordine DEBT-MOBILE-001…009.
- Ogni debito: riproduzione, ricerca primaria, ledger emendato, RED, GREEN,
  regressioni, build, Pad reale e aggiornamento consegna.
- Ogni regressione scoperta riceve nome stabile e test automatico.
- Ogni APK installato sul Pad viene copiato anche in
  `C:\Users\Antonino\Downloads` con hash SHA-256 registrato.

## DEBT-MOBILE-001 — Safe area del viewer Markdown

### Perimetro file esatto

Creare:

- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

Modificare:

- `.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `mobile/src/components/talos/library/TalosMobileMarkdownViewer.vue`
- `mobile/tests/unit/components/TalosMobileMarkdownViewer.test.ts`

Eliminare: nessun file.

### Simboli e contratti

- `TalosMobileMarkdownViewer`: restano stabili le prop pubbliche `fileId`,
  `nome` e l'evento `chiudi`.
- Nessuna nuova funzione, classe, interfaccia, schema, migrazione o dipendenza.
- Modifica prevista: la testata dell'overlay applica
  `pt-[max(0.75rem,env(safe-area-inset-top))]`, mantenendo invariati sfondo,
  contenuto e safe area inferiore.

### RED

- Test: `DEBT-MOBILE-001 tiene nome e chiusura sotto la status bar` in
  `mobile/tests/unit/components/TalosMobileMarkdownViewer.test.ts`.
- Fallimento atteso: la testata non contiene la classe canonica
  `pt-[max(0.75rem,env(safe-area-inset-top))]`.
- Comando:
  `cd mobile && npx vitest run tests/unit/components/TalosMobileMarkdownViewer.test.ts`.

### GREEN e regressioni

- GREEN focalizzato: stesso comando RED.
- Percorso scheda generata:
  `npx vitest run tests/unit/components/TalosMobileSchedaAzione.test.ts`.
- Percorso Libreria/media:
  `npx vitest run tests/unit/chat/chatMediaPanel.test.ts`.
- Regressione di sottosistema: `npm run typecheck`, `npx vitest run`,
  `npm run build`, `git diff --check`.

### Gate reale e prova umana

- Build debug Android e installazione su Pad `2ea6573c`.
- Confronto dei due ingressi reali: scheda Markdown appena generata e Libreria.
- Screenshot da ispezionare per intero in tablet portrait/landscape e forma
  telefono portrait/landscape; nome e X devono restare fuori dalle system bar.
  Tablet landscape e telefono landscape sono stati verificati sul Pad
  fisicamente landscape; le due forme portrait richiedono rotazione fisica del
  Pad e non si chiudono con un semplice scambio `wm size`.
- Prova inversa: chiusura, scroll lungo e riapertura dalla Libreria non devono
  cambiare comportamento.

### Rollback

- Revert del commit dedicato DEBT-MOBILE-001. La modifica comportamentale è
  confinata a una classe della testata del viewer e al relativo test.

## DEBT-MOBILE-002…009

Perimetri da compilare uno alla volta dopo l'ispezione locale e la ricerca
primaria specifica. I requisiti owner restano nel registro
`.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`.

## DEBT-MOBILE-002 — Verifica GPU senza stato/esito

### Perimetro file esatto

Modificare:

- `mobile/src/stores/chatController.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue`
- `mobile/src/i18n/locales/it.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/lib/localEngineProbeRun.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Nessun file nativo, schema, migrazione o dipendenza nuova: il ponte reale
`TalosLlamaPlugin.qualifyBackend` resta invariato.

Emendamento dopo il primo GREEN: la build ha rifiutato il bundle iniziale
`614.684 / 614.000` byte. L'orchestrazione del toast non resta quindi inline in
`chatController.ts`: viene collocata nel già esistente e già lazy
`localEngineProbeRun.ts`. Motivo: mantenere invariato il budget iniziale senza
alzare la soglia e senza introdurre un modulo o una dipendenza nuova.

### Contratti e simboli

- `decideLocalEngineProbeConsent`: mantiene chiusura immediata della modale e
  avvio in background, ma pubblica un toast globale persistente `running`;
  alla conclusione lo sostituisce con l'esito reale, oppure con un errore
  leggibile. Il sondaggio non viene duplicato e non parte due volte.
- `runLocalEngineProbeFromSettings`: conserva il bottone disabilitato durante
  la corsa e aggiunge il ramo di errore visibile; `finally` continua a liberare
  il busy flag.
- `talosRunLocalEngineProbeWithNotice`: nuova funzione lazy nel modulo già
  proprietario della corsa; invoca una sola qualificazione e chiude sempre il
  toast di running in `finally`.
- Chiavi i18n nuove: `privacyPermissions.localEngineProbe.error` in italiano e
  inglese. Nessun testo hard-coded nella UI.

### RED

- Aggiornare `mobile/tests/unit/chat/chatController.test.ts` con una Promise
  differita: dopo «Sì, verifica ora» il toast deve dire `running`; dopo
  `resolve` deve sparire il running ed esporre l'esito. Un secondo scenario
  rifiuta il ponte e pretende un toast d'errore senza unhandled rejection.
- Fallimento atteso prima della modifica: nessun toast di running/esito e
  nessuna cattura del rifiuto.
- Comando RED: `cd mobile && npx vitest run tests/unit/chat/chatController.test.ts`.

### GREEN e regressioni

- GREEN: stesso test focalizzato.
- Regresso locale/privacy: `npx vitest run tests/unit/lib/localEngineProbeRun.test.ts`
  e la suite completa `npx vitest run`.
- Gate statico: `npm run typecheck`, `npm run build`, `git diff --check`.

### Gate Pad e prova umana

- Build/install debug sul Pad `2ea6573c`; copiare sempre l'APK in
  `C:\Users\Antonino\Downloads` con SHA-256.
- Prima scelta di un modello locale: il foglio si chiude, sopra il composer
  compare «In corso…», poi compare l'esito o l'errore; cambiare schermata non
  deve trasformare una corsa in silenzio.
- Impostazioni → Privacy e autorizzazioni: durante il comando il bottone resta
  disabilitato e leggibile; successo, temperatura e ponte rifiutato hanno tutti
  una frase distinta. Screenshot intero della scheda prima/durante/dopo.

### Rollback

Revert del commit DEBT-MOBILE-002: rimuove solo stato/toast/error handling UI,
senza toccare la qualificazione nativa già esistente.
## Emendamento DEBT-MOBILE-002 — stato effettivo dopo il gate statico

La lista effettiva dei file di prodotto modificati è:

- `mobile/src/stores/chatController.ts`
- `mobile/src/services/localEngine.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue`
- `mobile/tests/unit/chat/chatController.test.ts`

`mobile/src/i18n/locales/it.ts` e `mobile/src/i18n/locales/en.ts` non risultano
modificati nel diff finale: il messaggio d'errore riusa `rejectGeneric`.

Il tentativo inline è stato respinto dal gate iniziale (`614.684` byte); la
versione finale riusa `talosLocalEngineLazy()` e il modulo motore già lazy,
mantenendo il budget a `<= 614.000` senza modificare la soglia.
