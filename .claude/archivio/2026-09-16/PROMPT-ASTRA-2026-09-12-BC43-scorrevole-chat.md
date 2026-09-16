# BC-43 — chi chiede lo scorrevole della chat e riceve la colonna

Sei Astra (Codex). Repo `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`, cartella `harness-ui/frontend/` (ramo `lane/harness-desktop`). Rispondi e scrivi SEMPRE in italiano. **Mai `git add`, `git commit`, `git push`**: file su disco, elencati nel rapporto. Altri lavori sono in corso in questo albero su ALTRI file: tocca SOLO quelli elencati sotto. Se non puoi scrivere in `.claude/` alla radice, scrivi il rapporto in `harness-ui/.claude/` e dillo.

## Il difetto (misurato il 12/09 dall'agente di BC-08/10, rapporto `.claude/RAPPORTO-BC08-BC10-BARRA-CONVERSAZIONE-2026-09-12.md` §8.2)
`src/bridge/legacy-dom.js` righe 154-155 dà la **classe** `conversation` allo scorrevole della chat e l'**id** `conversation` alla **colonna** che lo contiene. Conseguenza misurata: lo scroll-spy della barra di navigazione (`cronologia.js`) non è mai partito perché leggeva `#conversation` (`nav.dataset.attivaVera` sempre `undefined`) — curato nel componente. Ma **gli altri chiamanti** di `$('#conversation')` / `document.getElementById('conversation')` / `querySelector('#conversation')` in `src/legacy/app.js` e negli altri componenti non sono stati riguardati: per esempio `app.js` ~riga 14181 (`aggiornaSeparatoreContesto`). Ognuno di quelli che si aspetta lo SCORREVOLE (scrollTop, scrollHeight, scrollTo, listener di scroll, misure di viewport) sta lavorando sulla colonna e quindi non fa ciò che promette.

## Cosa devi fare
1. Ricerca prima del codice (breve, fonte + data): pratiche per separare «contenitore che scorre» e «colonna» in una chat (un solo riferimento allo scorrevole, esposto da un modulo, invece di selettori sparsi), e `scroll-behavior`/`scrollIntoView` rispetto a `prefers-reduced-motion`.
2. **Censimento misurato**: elenca TUTTI i punti del frontend che risolvono `#conversation` o `.conversation` (grep su `frontend/src/`), e per ognuno dichiara: cosa si aspetta (scorrevole o colonna), cosa riceve oggi, e se il comportamento è sbagliato (con la prova: cosa non succede). Metti la tabella nel rapporto.
3. Cura: UN punto solo che espone lo scorrevole e la colonna con nomi chiari (es. in `src/bridge/legacy-dom.js` o un modulo piccolo), e i chiamanti sbagliati che lo usano; niente rinomina dell'id/classe che romperebbe i test di parità e le sonde esistenti (verifica con grep nei test). Ogni chiamante corretto ha la sua riga nel rapporto con prima/dopo.
4. Test nei due versi (`frontend/tests/unit/`): un chiamante corretto lavora sullo scorrevole (scrollTop cambia), e la colonna resta quella per chi la vuole. `npm run test:unit` nel frontend e `tests/parity/nessun-errore-a-runtime.spec.mjs` su un banco TUO (server su porta libera con uno store copiato, oppure `frontend/lab/`; ⛔ mai la porta 4174, mai POST verso di lei; chiudi i server che avvii).
5. Foto prima/dopo (chiaro e scuro, 1440×900) di UN comportamento riparato che si vede (es. il separatore del contesto o l'autoscroll), in `.claude/foto-bc43-2026-09-12/`.

## File che puoi toccare
`frontend/src/legacy/app.js`, `frontend/src/bridge/legacy-dom.js`, i componenti che risolvono `#conversation` (tranne quelli vietati sotto), i tuoi test. **Vietati**: `frontend/src/components/cronologia.js` (già curato: riusa la sua soluzione se è la stessa idea), `frontend/src/components/ricerca*.js`, `frontend/src/components/fonti-modelli.js`, `frontend/index.template.html` (diff nel rapporto se serve), tutto `harness-ui/src/` (backend), `mobile/`, `control-plane/`, `core/`, `docs/`.

## Vincoli
- Niente nomi tecnici a schermo; nessuna durata non misurata; niente segreti.

## Consegna
`.claude/RAPPORTO-BC43-SCORREVOLE-CHAT-2026-09-12.md`: ricerca; la tabella del censimento; le cure riga per riga; test con numeri; foto; cosa NON hai verificato; proposta di testo di commit; chiusura **Cosa deve fare l'owner · Cosa faccio io · Cosa rimane**. Ultimo messaggio: riassunto in dieci righe.
