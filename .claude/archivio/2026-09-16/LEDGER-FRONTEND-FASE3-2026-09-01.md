# Ledger esecutivo — Frontend desktop Fase 3

Data: 2026-09-01  
Stato: implementato e verificato; chiusura subordinata alla review indipendente.  
Perimetro: Design system Calm e primitive nel frontend modulare isolato.  
Ricerca: `.claude/DOSSIER-RICERCA-FRONTEND-FASE3-2026-09-01.md`.

## File esatti

### Da creare

- `.claude/DOSSIER-RICERCA-FRONTEND-FASE3-2026-09-01.md`
- `.claude/LEDGER-FRONTEND-FASE3-2026-09-01.md`
- `.claude/CONSEGNA-FRONTEND-FASE3-2026-09-01.md`
- `harness-ui/frontend/src/design-system/token-contract.js`
- `harness-ui/frontend/src/design-system/button.js`
- `harness-ui/frontend/src/design-system/badge.js`
- `harness-ui/frontend/src/design-system/switch.js`
- `harness-ui/frontend/src/design-system/tabs.js`
- `harness-ui/frontend/src/design-system/floating-position.js`
- `harness-ui/frontend/src/design-system/menu-button.js`
- `harness-ui/frontend/src/design-system/tooltip.js`
- `harness-ui/frontend/src/design-system/sheet.js`
- `harness-ui/frontend/src/design-system/index.js`
- `harness-ui/frontend/src/styles/tokens.css`
- `harness-ui/frontend/src/styles/primitives.css`
- `harness-ui/frontend/lab/routes/design-system.js`
- `harness-ui/frontend/tests/unit/design-token-contract.test.mjs`
- `harness-ui/frontend/tests/component/design-system.spec.mjs`

### Da modificare

- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE/2026-08-31-harness-desktop-frontend-refactor-review-plan.md`
- `harness-ui/frontend/src/styles/index.css`
- `harness-ui/frontend/lab/main.js`
- `harness-ui/frontend/package.json`
- `harness-ui/frontend/package-lock.json`
- `harness-ui/frontend/scripts/copy-vendored-assets.mjs`
- `harness-ui/frontend/scripts/verify.mjs`
- `harness-ui/frontend/tests/contract/package-shape.test.mjs`
- `harness-ui/frontend/tests/contract/vendored-assets.test.mjs`
- `harness-ui/frontend/playwright.lab.config.mjs`

### Da eliminare

- Nessuno.

### Esplicitamente invariati

- `harness-ui/public/index.html`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/server.mjs`
- ogni file sotto `mobile/`

## Simboli pubblici nuovi

- Token: `TALOS_DESIGN_TOKEN_GROUPS`, `TALOS_REQUIRED_DESIGN_TOKENS`,
  `assertTalosDesignTokens`.
- Button: `createButton`, `createIconButton`.
- Badge: `createBadge`.
- Switch: `createSwitch`.
- Tabs: `createTabs`.
- Floating adapter: `createFloatingPositioner`.
- Menu: `createMenuButton`.
- Tooltip: `createTooltip`.
- Sheet: `createSheet`.
- Barrel: tutti gli export precedenti da `src/design-system/index.js`.

Ogni factory restituisce una superficie con `element`, `update` e `destroy`
idempotente secondo `defineComponent`; le superfici apribili espongono inoltre
solo i metodi necessari (`open`, `close`, `focus`) senza stato globale.

## RED nominati

- `PHASE3-TOKEN-CONTRACT-01`: gruppi colore/tipografia/spazio/raggio/motion/
  focus mancanti e valori raw presenti fuori dal foglio token.
- `PHASE3-BUTTON-02`: button/icon button non hanno varianti, nome accessibile,
  hit area 36/40 px, disabled reason e teardown.
- `PHASE3-BADGE-03`: badge di stato non distingue testo/stato dal solo colore.
- `PHASE3-TABS-04`: mancano ruoli, roving tabindex, frecce, Home/End,
  Enter/Space, panel e attivazione controllata.
- `PHASE3-SWITCH-05`: manca switch controllato con nome stabile e stato
  `aria-checked`.
- `PHASE3-MENU-06`: mancano focus iniziale, navigazione, Escape/Tab, focus
  return, posizionamento e teardown senza doppi handler.
- `PHASE3-TOOLTIP-07`: manca associazione `aria-describedby`, hover/focus,
  Escape e posizionamento entro viewport.
- `PHASE3-SHEET-08`: manca sheet basato sul manager Fase 2 con background
  inerte, focus trap, close visibile e ritorno focus.
- `PHASE3-MOTION-COLORS-09`: reduced-motion e forced-colors non garantiscono
  rispettivamente motion ridotto e bordi/focus percepibili.
- `PHASE3-OWNER-IMMUTABLE-10`: hash dei tre file `public` e health `4174`
  devono restare invariati.
- `PHASE3-VERIFICATION-EVIDENCE-11`: l'attestato finale deve dichiarare Fase 3
  e non lasciare metadati della fase precedente nel gate corrente.
- `PHASE3-TABS-FOCUS-12`: un update controllato non deve perdere il focus
  della tab attiva prima che `Home`/`End` ricevano il comando successivo.
- `PHASE3-MOTION-SPECIFICITY-13`: il tema Calm non deve prevalere sul token
  motion ridotto per maggiore specificità del selettore.
- `PHASE3-VISUAL-BALANCE-14`: l'ultimo gruppo del laboratorio non deve lasciare
  una colonna vuota priva di significato alla larghezza desktop.
- `PHASE3-SHEET-MOTION-15`: il passaggio dello sheet deve avere durata reale,
  stato intermedio visibile, hit-test valido e pixel differenti prima/durante/
  dopo; reduced-motion resta un contratto separato.
- `PHASE3-MENU-VIEWPORT-16`: il menu aperto deve essere interamente contenuto
  nel viewport corrente; una cattura `fullPage` non è prova di raggiungibilità.

## RED attesi

1. `design-token-contract.test.mjs`: import mancanti.
2. `design-system.spec.mjs`: route `DesignSystem` non supportata.
3. `package-shape.test.mjs`: Floating UI non pin­nato e attestato non Fase 3.
4. `vendored-assets.test.mjs`: licenze Floating UI assenti dal manifest.

## GREEN focalizzati

- `rtk node --test tests/unit/design-token-contract.test.mjs`
- `rtk node --test tests/contract/package-shape.test.mjs tests/contract/vendored-assets.test.mjs`
- `rtk npx playwright test tests/component/design-system.spec.mjs --config=playwright.lab.config.mjs`
- `rtk npm run verify`

## Regressioni finali

- `rtk npm test`
- `rtk npm run test:browser`
- `rtk node --test harness-ui/tests/*.test.mjs`
- `rtk git diff --check`
- `GET http://127.0.0.1:4174/` uguale a `200` prima e dopo.
- SHA-256 di `harness-ui/public/index.html`, `app.js`, `styles.css` identici
  alla baseline Fase 2.

Nessuna chiamata reale a provider è richiesta. Il laboratorio usa stato locale
e non espone capability decorative nella produzione owner.

## Prova visiva

Route lab `?component=DesignSystem`, Chrome del progetto:

- 1440×900, 1280×800, 1024×800;
- tastiera completa per tabs/menu/switch/sheet/tooltip;
- reduced motion;
- forced colors;
- screenshot interi in `harness-ui/frontend/artifacts/phase-03/`;
- ispezione di overflow, clipping, focus, spaziatura, densità, contrasto,
  z-index, motion, console e rete.

## Rollback

Rimuovere esclusivamente design-system, fogli token/primitive, route/test lab e
dipendenza Floating UI; ripristinare gli import e gli script elencati. Nessun
formato sessione, endpoint, public owner o file mobile cambia.

## Esito dell'esecuzione

- Unit/contract frontend: `57/57`.
- Matrice focalizzata Design system: `27/27` su tre viewport.
- Laboratorio browser completo: `42/42` su tre viewport.
- Backend Harness canonico dalla radice del worktree: `1259/1259`.
- Browser prodotto: `76` passati, `2` opt-in reali saltati intenzionalmente.
- `npm run verify`: GREEN; attestato `phase-03-verification.json`, fase `3`.
- Server owner `4174`: sempre `200` e mai riavviato.
- Hash dei tre file pubblici: identici alla baseline Fase 2.
- Provider: nessuna nuova chiamata.

Il primo comando backend era stato eseguito dalla directory `harness-ui/` con
il prefisso `harness-ui/tests`, producendo quattro file-not-found per directory
duplicata. Non è un difetto del prodotto; il comando canonico dalla radice è
verde `1259/1259`.

## Regressioni permanenti aggiunte durante GREEN

- `PHASE3-TABS-FOCUS-12`: preservazione del focus dopo update controllato.
- `PHASE3-MOTION-SPECIFICITY-13`: reduced motion non sovrascritto dal tema.
- `PHASE3-VISUAL-BALANCE-14`: nessuna colonna vuota finale nel laboratorio.
- `PHASE3-SHEET-MOTION-15`: prova strumentata prima/durante/dopo dello sheet.
- `PHASE3-MENU-VIEWPORT-16`: contenimento geometrico nel viewport reale.

## Review indipendente

In corso in sola lettura. La fase non passa a `chiusa` e la roadmap non viene
promossa finché ogni finding bloccante non è trasformato in RED permanente,
corretto e nuovamente verificato.
