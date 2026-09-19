# Ripresa: avvio della chat e comandi File

Owner: TALOS UI. Nessun commit, nessuna modifica al mockup o al backend. Revisione root separata dall'implementazione, non indipendente.

## Riscontro e ricerca primaria
La baseline 817a21a9 riproduce BACKGROUND-MOTION-COMPOSITOR-02 e FILE-EXPLORER-TOOLBAR-05. Lettura corrente: mountStage prepara il canvas dopo ResizeObserver ma non riarma schedule; una chat inizialmente hidden può restare ferma. La toolbar File viene sincronizzata soltanto nel reset da una sessione o dopo il controllo di identità nell'albero: a freddo i comandi sono abilitati senza destinazione.
Ricerca verificata 19/09/2026: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver ; https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame ; https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled . requestAnimationFrame è one-shot; ResizeObserver notifica la variazione di dimensione, non riavvia il loop applicativo. disabled nativo impedisce attivazione e focus dei button.
Decisione: adattare primitive native già usate, conservando runtime TALOS e Playwright 1.62.1/esbuild 0.28.2; nessuna nuova dipendenza/engine. Non importare un framework animazioni per riarmare il loop esistente.

## File esatti e simboli
- harness-ui/frontend/src/motion/desktop-background.js: callback ResizeObserver di mountStage, riarmare schedule dopo prepare se stage ancora registrato. Invariati initTalosDesktopBackground, status/refresh/destroy, stageShouldAnimate, reduced-motion, off/static e budget.
- harness-ui/frontend/src/legacy/app.js: bootstrap prima di setInspectorTab, chiamare syncFileTreeToolbar per stato corrente; renderizzaAlberoRealeUnaVolta sincronizza anche prima di uscire per assenza di destinazione. Invariati comandi/id/API tree e autorizzazioni, stato anteprima.
- harness-ui/frontend/tests/browser/baseline-shell.spec.mjs: conservare RED esistenti e aggiungere RIPRESA-SFONDO-RIAPERTURA con fotogrammi PNG decodificati, riapertura via navigazione, reduced-motion e hit-test composer a viewport desktop/mobile. Nessuna modifica delle altre asserzioni.
- .claude/LEDGER-RIPRESA-COLD-START-2026-09-19.md: presente ledger/prove.
- .claude/RIPRESA-OPERATIVA-2026-09-19.md e .claude/MATRICE-RIPRESA-PARITA-2026-09-19.md: stato ed evidenze.
- harness-ui/public/app.js, harness-ui/public/build-manifest.json: soli derivati di build consegnati con script esistente e backup; se il manifest asset varia includere harness-ui/public/asset-manifest.json.

## Gate
RED: due scenari baseline precedenti, nuova riproduzione immutabile completa 40382865 in corso; nuovo scenario prima di edit prodotto. Atteso: frames immobili al ritorno nella chat, toolbar enabled senza sessione.
GREEN: node scripts/ripresa-run.mjs browser baseline-shell.spec.mjs --grep 'BACKGROUND-MOTION|RIPRESA-SFONDO|FILE-EXPLORER'; poi unit completa e suite baseline-shell completa. Un solo runner alla volta. Il giro completo già in corso resta prova del sorgente PRE correzione, mai attribuirlo al sorgente successivo.
Prova visibile: pixel superficie fissa prima/durante/dopo, canvas visibile e running, hit-test composer, uscita/ritorno tramite controlli reali; reduced-motion ferma il loop. Le prove su canvas non certificano provider reali. Consegna 4174 senza riavvio e confronto mockup/4174 finale con script esistenti.
Rollback: patch inversa SOLO di questo lotto confrontata con snapshot 40382865, preservando tutte le modifiche precedenti; bundle public dal backup della consegna. Nessun git reset/revert.

Caratterizzazione RED già eseguita prima degli edit: 817a21a9. Hash desktop-background.js identico in 817a21a9 e 40382865: 2a98f1593fc16925980275b36aa185a330bcc0fcd88a30a478039fdd8b168f8d; spec baseline-shell originale identica 250c0d510bec0f506be88365a898fad731f1e31f37bcac6cac5bd1eecd3079f6. Nuova prova pixel aggiunta prima degli edit ma non ancora eseguita, non qualificata come RED osservato. La suite completa in corso conserva lo snapshot precedente alle correzioni.


Estensione durante gate finale: LAG-INTERACTION-DIALOG-38 resta RED riproducibile in 40382865, d713b57c e 9afafa66. File esatti aggiuntivi già nel lotto: frontend/src/legacy/app.js (syncBackgroundDialogPause, apriVeloMockup, chiudiVeloMockup), frontend/tests/browser/baseline-shell.spec.mjs (LAG-INTERACTION-DIALOG-38: verificare anche renderer fermo/ripreso, non solo classi). Causa: sync considera solo due dialog legacy; le modali reali sono overlay-layer. Decisione: riusare l’adapter pause esistente e sincronizzare apertura/chiusura includendo tutti gli overlay aperti. Non introdurre polling o dipendenze.
Ricerca primaria 19/09: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API (nascondere con CSS non genera visibilitychange) e https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (contenuto sottostante modale inerte). La pausa decorativa è scelta prodotto già contrattualizzata dal test, non obbligo inventato W3C. Pin invariati. GREEN: scena attiva → modale → renderer stopped → chiusura → running; snapshot/bundle con suite cold-start e regressioni. Rollback delta dei tre simboli, nessuna riscrittura dei monoliti.
