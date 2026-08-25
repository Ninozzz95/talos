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
