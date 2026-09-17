# Banco UI di Talos Desktop — correzioni mirate

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. Questo banco importa tre moduli reali (connessione, ridimensionamento dialoghi, motion) oppure i loro originali immutabili in `baseline/`. Non e una nuova shell, una demo del backend o la chiusura dell'audit di tutto il frontend.

## Avvio senza dipendenze aggiuntive

Dalla radice del repository, con Node:

```sh
node harness-ui/frontend/showcase/serve.mjs
```

Aprire `http://127.0.0.1:5189/showcase/`. Prima/Dopo seleziona i sorgenti. Porta alternativa: `--port=5190`. Nessuna chiave, account o variabile d'ambiente necessaria. Il banco non chiama provider, non crea sessioni, non serve il workspace. Il server espone soltanto una lista chiusa di file. I font non sono distribuiti: vengono usati i fallback di sistema.

## Casi

Connessione: burst di eventi sani, risposta tardiva, caduta, ripresa e retry. Dialoghi: dimensioni salvate, frecce (16 px), Home, doppio clic, trascinamento e annullamento. Movimento: cambio preferenza durante una transizione e preferenza di sistema. I token Calm sono letti senza modificarli: questo non prova la cascata CSS della UI distribuita. La finestra del banco usa un dialog nativo e una gestione focus propria: non qualifica il gestore modale dell'app.

## Test e build del repository

```sh
cd harness-ui/frontend
node --test tests/unit/ui-experience-regression.test.mjs tests/unit/connessione.test.mjs tests/unit/dialoghi.test.mjs
npm ci
npm run test:unit
npm run build
npm run test:componenti
```

Usare la versione Node dichiarata in `package.json` (>=24.18.0 <27). I primi tre file sono indipendenti dalle dipendenze npm. La build prepara `frontend/dist`; non sostituisce automaticamente `harness-ui/public` e non pubblica un installer. Nessun cutover in questa proposta.

## Evidenza e limiti della sessione del 17/09/2026

Verificati localmente: 28/28 regressioni nuove e 6/6 test originali su Node 22.16.0. Sui moduli originali, 19 delle 28 nuove regressioni falliscono. In Chromium, 45 controlli superati nel banco isolato (8 osservazioni avverse sugli originali), inclusi 8 viewport da 320 a 1920 px e stress a 240 px. Server del banco: 8 verifiche HTTP superate.

Clone e archivio completi non ottenuti per restrizioni di rete. Le copie dei moduli e dei test originali sono state confrontate con i rispettivi Git blob SHA. Il browser dell'ambiente blocca HTTP locale: la verifica browser ha caricato offline gli stessi byte dei moduli via data URL, con CSS del banco e storage simulato. Non e una prova di CSP o navigazione HTTP in Chromium.

Non eseguiti: build integrale, suite completa, Node 24, Electron Windows, screen reader, tutte le schermate, profiling e cutover degli asset. La proposta deve restare draft finche questi controlli non sono completati. Nessuna dichiarazione di conformita WCAG globale.

## Decisioni

- Connessione: epoca per invalidare risposte superate e un callback per caduta. API, stati, parole e backoff invariati; un segnale esplicito puo riattivare dopo `ferma()`.
- Dialoghi: il limite deve rispettare lo spazio disponibile; Home equivale al reset; pointercancel/lostcapture/Escape non salvano un gesto interrotto; storage indisponibile non blocca.
- Motion: controllare anche il cambio preferenza durante la transizione, cancellando solo animazioni possedute da questo helper. Gli osservatori esistono solo mentre ci sono animazioni attive. Nessuna regola CSS globale o modifica allo sfondo Canvas.

Riferimenti consultati: [W3C Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [W3C Animation from Interactions (AAA)](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [MDN pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event), [MDN MediaQueryList change](https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event).
