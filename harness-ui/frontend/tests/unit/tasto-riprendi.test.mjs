/*
 * Decisione 198 (owner 04/11/2026; 213 D2 a, D4 a) — il ▶ della barra della chat sul PC, e la seconda porta di «Riprova» (Ctrl K).
 * Il server dice `daRiprendere` nella riga; il PC piega gli eventi vivi con la STESSA tabella (`src/da-riprendere.mjs`) e i casi comuni
 * `contracts/da-riprendere.casi.json` (copiati byte per byte dal telefono) passano anche dal cablaggio del PC.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statoDaRiprendereDallaRiga, piegaEventoDaRiprendere, statoTastoRiprendi } from '../../src/components/tasto-riprendi.js';
import { commandById, commandDisabledReason } from '../../src/services/commands/registry.ts';
import { impostaLingua, t } from '../../src/components/lingua.js';

const casi = JSON.parse(readFileSync(new URL('../../../contracts/da-riprendere.casi.json', import.meta.url), 'utf8')).casi;
const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

test('R198-PC-1 the shared cases through the PC wiring: the row opens it, the live events fold it, the same value as the server', () => {
  assert.ok(casi.length >= 10);
  for (const caso of casi) {
    const stato = caso.eventi.reduce(piegaEventoDaRiprendere, statoDaRiprendereDallaRiga(null));
    assert.equal(stato.valore, caso.atteso, caso.nome);
  }
});

test('R198-PC-2 the ▶: on only with something to resume; off while a turn runs, with the contact lost, with the session gone', () => {
  for (const valore of ['fermata', 'errore', 'giri-finiti', 'interrotta']) {
    const stato = statoDaRiprendereDallaRiga({ daRiprendere: valore });
    assert.deepEqual(statoTastoRiprendi({ stato }), { acceso: true, chiaveTitolo: 'modello.chat.resumeReady' }, valore);
    assert.equal(statoTastoRiprendi({ stato, giroAttivo: true }).acceso, false, `${valore}: a turn is running`);
    assert.equal(statoTastoRiprendi({ stato, contattoPerso: true }).acceso, false, `${valore}: the server is not reachable`);
    assert.equal(statoTastoRiprendi({ stato, rigaPresente: false }).acceso, false, `${valore}: the session left the list`);
  }
  // AL CONTRARIO: una risposta finita, un valore sconosciuto, nessuna riga
  for (const riga of [{ daRiprendere: null }, { daRiprendere: 'in-pausa' }, { daRiprendere: 'qualcosa' }, {}, null]) {
    assert.deepEqual(statoTastoRiprendi({ stato: statoDaRiprendereDallaRiga(riga) }), { acceso: false, chiaveTitolo: 'modello.chat.resumeNothing' }, JSON.stringify(riga));
  }
  // un valore sconosciuto non entra nello stato, e se ci entrasse non accende il ▶ (due guardie)
  assert.equal(statoDaRiprendereDallaRiga({ daRiprendere: 'qualcosa' }).valore, null);
  assert.equal(statoTastoRiprendi({ stato: { valore: 'qualcosa' } }).acceso, false);
  // dal vivo: Stop → acceso; giro nuovo → spento; fine buona → spento
  let stato = statoDaRiprendereDallaRiga({ daRiprendere: null });
  stato = piegaEventoDaRiprendere(stato, { type: 'RunStarted', runId: 'r2' });
  assert.equal(statoTastoRiprendi({ stato }).acceso, false);
  stato = piegaEventoDaRiprendere(stato, { type: 'RunError', code: 'fermato' });
  assert.equal(statoTastoRiprendi({ stato }).acceso, true, 'on after Stop');
  stato = piegaEventoDaRiprendere(stato, { type: 'RunStarted', runId: 'r3' });
  stato = piegaEventoDaRiprendere(stato, { type: 'RunFinished' });
  assert.equal(statoTastoRiprendi({ stato }).acceso, false, 'off after a finished answer');
});

test('R198-PC-3 the wiring in the page: the click does nothing when off, only live events fold, the row is the authority', () => {
  assert.match(app, /\$\('#resumeSessionBtn'\)\.addEventListener\('click', \(\) => \{ if \(tastoRiprendiAcceso\(\)\) resumeSession\(\); \}\)/u);
  assert.match(app, /if \(!state\.realSession\.inRigiocata\) \{[^}]*piegaEventoDaRiprendere\(/u, 'the replay does not fold: the row already counted it');
  assert.match(app, /state\.realSession\.statoDaRiprendere = statoDaRiprendereDallaRiga\(impostazioniSessione\)/u, 'the row when the session opens');
  assert.match(app, /rileggiRigaDelTastoRiprendi\(righeDelServer\)/u, 'the row at every list read, before the workflow steps are filtered out');
  assert.match(app, /aggiornaTastoRiprendi\(attivo\)/u, 'the composer sync redraws the ▶');
  const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.match(pagina, /data-tasto-riprendi title="Niente da riprendere: si accende dopo uno Stop, un errore o un’interruzione" aria-label="Riprendi" aria-disabled="true"/u, 'off until the row says otherwise');
  const ponte = readFileSync(new URL('../../src/bridge/legacy-dom.js', import.meta.url), 'utf8');
  assert.match(ponte, /\[data-tasto-riprendi\]'\), \{ id: 'resumeSessionBtn' \}/u, 'the id does not hang on the title, which now changes');
});

test('R198-PC-4 the palette: «resume» follows the ▶, «retry» needs an answer, both said in both languages', () => {
  const idle = { sessionId: 's', running: false };
  assert.equal(commandDisabledReason(commandById('resume'), { ...idle, resumable: false }), 'comandi.reason.nothingToResume');
  assert.equal(commandDisabledReason(commandById('resume'), { ...idle, resumable: true }), null);
  assert.equal(commandDisabledReason(commandById('resume'), idle), null, 'a caller that does not know does not turn it off');
  assert.equal(commandDisabledReason(commandById('retry'), { ...idle, retryable: false }), 'comandi.reason.nothingToRetry');
  assert.equal(commandDisabledReason(commandById('retry'), { ...idle, retryable: true }), null);
  assert.equal(commandDisabledReason(commandById('retry'), { ...idle, running: true, retryable: true }), 'comandi.reason.waitForRun');
  assert.match(app, /case 'retry': \{ const domanda = domandaDaRiprovare\(\); if \(domanda\) void avviaRamo\(domanda\); break; \}/u);
  try {
    impostaLingua('en');
    assert.equal(t('comandi.reason.nothingToResume'), 'Nothing to resume: the last turn finished.');
    assert.equal(t('modello.chat.resumeReady'), 'Resume: pick up the turn where it stopped');
    assert.equal(t('app.approval.wantsRetryAgent'), 'It wants to retry a sub-agent that failed.');
    assert.equal(t('errori.SESSION_NOT_READY.nothing_to_resume'), 'The last turn finished: there is nothing to resume. Write a message, or use Retry on the answer.');
    impostaLingua('it');
    assert.equal(t('comandi.reason.nothingToResume'), 'Niente da riprendere: l’ultimo giro è finito.');
    assert.equal(t('modello.chat.resumeNothing'), 'Niente da riprendere: si accende dopo uno Stop, un errore o un’interruzione');
    assert.equal(t('app.approval.wantsRetryAllAgents'), 'Vuole riprovare tutti i sotto-agenti che non sono riusciti.');
  } finally { impostaLingua('it'); }
  // la carta del permesso di `child_control` «retry» (il kernel tiene il tipo `<azione>_child`)
  assert.match(app, /retry_child: \['app\.approval\.wantsRetryAgent', 'app\.approval\.wantsRetryAllAgents'\]/u);
});
