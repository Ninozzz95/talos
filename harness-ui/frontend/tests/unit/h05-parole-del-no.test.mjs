/*
 * H-05 (red-team degli attrezzi, ZIP dell'owner del 02/10/2026; owner «Voglio il +1»): il kernel non dice più REFUSED per tutto.
 *   REFUSED resta a sicurezza e permessi; NOT FOUND, AMBIGUOUS e INVALID sono gli altri «no»; NO CHANGE non è un no.
 *   L'interfaccia deve: (1) non dipingere mai di verde un NOT FOUND, un AMBIGUOUS o un INVALID; (2) spiegarli in italiano, con le
 *   frasi già tradotte che valevano per REFUSED (l'HTML vuoto); (3) non trattare NO CHANGE come un guasto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { spiegaRifiutoAttrezzo } from '../../src/components/errori.js';
import { esitoDichiaraFallimento } from '../../src/components/esito-comando.js';

test('H-05: NOT FOUND, AMBIGUOUS e INVALID sono un esito fallito, come REFUSED; NO CHANGE no', () => {
  assert.equal(esitoDichiaraFallimento('file_edit', 'NOT FOUND. Nothing was changed: `old_string` does not appear in a.mjs, not even once.'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'AMBIGUOUS. Nothing was changed: `old_string` appears 2 times in a.mjs'), true);
  assert.equal(esitoDichiaraFallimento('artifact_create', 'INVALID. Empty html: nothing was created.'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'REFUSED. Nothing was changed: a.bin is a binary file'), true);
  assert.equal(esitoDichiaraFallimento('file_edit', 'NO CHANGE. The edit looks already applied: `new_string` is already in a.mjs (line 1)'), false);
  assert.equal(esitoDichiaraFallimento('leggi', 'testo di un file che PARLA di NOT FOUND. dentro'), false, 'solo in testa');
});

test('H-05: ogni «no» del kernel si spiega con le sue parole, e le traduzioni di prima valgono ancora', () => {
  const nonTrovato = spiegaRifiutoAttrezzo('NOT FOUND. That Library id does not exist.');
  assert.deepEqual([nonTrovato.rifiutato, nonTrovato.tipo], [true, 'non-trovato']);
  assert.match(nonTrovato.detto, /non c’è/u);
  const ambiguo = spiegaRifiutoAttrezzo('AMBIGUOUS. Nothing was changed: `old_string` appears 3 times');
  assert.deepEqual([ambiguo.rifiutato, ambiguo.tipo], [true, 'ambiguo']);
  const vuoto = spiegaRifiutoAttrezzo('INVALID. Empty html: nothing was created.');
  assert.equal(vuoto.tipo, 'non-valido');
  assert.equal(vuoto.detto, 'L’HTML era vuoto: non è stato creato niente.', 'la traduzione di prima, ora sotto INVALID');
  const rifiuto = spiegaRifiutoAttrezzo('REFUSED. the person did not allow it. Nothing was written.');
  assert.deepEqual([rifiuto.rifiutato, rifiuto.tipo, rifiuto.detto], [true, 'rifiuto', 'Lo strumento ha rifiutato la richiesta.']);
  const nessuno = spiegaRifiutoAttrezzo('NO CHANGE. The edit looks already applied');
  assert.deepEqual([nessuno.rifiutato, nessuno.tipo], [false, null], '«già applicata» non è un no');
});

/* Tester R2-R4 (03/11/2026): il no della persona arriva come DECLINED; l'interfaccia lo dice come una scelta sua, non come un rifiuto dello strumento */
test('H05-DECLINED il no della persona si spiega «Hai detto di no»; AL CONTRARIO REFUSED resta un rifiuto', async () => {
  const { spiegaRifiutoAttrezzo } = await import('../../src/components/errori.js');
  const no = spiegaRifiutoAttrezzo('DECLINED. The person said no to this. Do not ask again for it, by a card or a question, unless the person brings it up. Go on without it, or say in one line what you can do instead. Nothing was written.');
  assert.equal(no.rifiutato, true);
  assert.equal(no.tipo, 'detto-no');
  const rifiuto = spiegaRifiutoAttrezzo('REFUSED. "x" is inside a folder the person blocked.');
  assert.equal(rifiuto.tipo, 'rifiuto');
});

/*
 * Uscita 0.2.2 (owner sì, giudice v1961-v1962, 16/11): il via `no-della-persona-nel-giro` del nucleo (talosHarness.mjs:15712) dice al
 *   modello che la PERSONA ha già detto no a quella stessa chiamata in questo giro e che non le è stato chiesto di nuovo. La riga
 *   dell attrezzo diceva «Lo strumento ha rifiutato la richiesta.», cioè dava la colpa allo strumento. Il testo qui sotto è copiato dal
 *   sorgente del nucleo (motivo di :15712 dentro la forma di :20533, il ramo MCP), mai inventato.
 */
const NO_GIA_DETTO_NEL_GIRO = 'REFUSED. the person already said no to this same call in this turn: it was not asked again. Do not retry it: tell the person what you need. The tool "query" of the MCP server "db" was not called.';

test('H05-GIA-DETTO-NO: un no della persona già dato in questo giro si dice come suo, nelle due lingue; AL CONTRARIO un rifiuto di sicurezza resta generico', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  try {
    impostaLingua('en');
    const en = spiegaRifiutoAttrezzo(NO_GIA_DETTO_NEL_GIRO);
    assert.equal(en.rifiutato, true);
    assert.equal(en.detto, 'You had already said no to this same request in this turn, so you were not asked again.');
    assert.equal(en.tecnico, NO_GIA_DETTO_NEL_GIRO, 'il testo del nucleo resta intero nel riquadro tecnico');
    impostaLingua('it');
    const it = spiegaRifiutoAttrezzo(NO_GIA_DETTO_NEL_GIRO);
    assert.equal(it.detto, 'In questo giro avevi già detto di no a questa stessa richiesta, quindi non ti è stato chiesto di nuovo.');
    assert.doesNotMatch(it.detto, /strumento/u, 'non è lo strumento ad aver rifiutato');
    const sicurezza = spiegaRifiutoAttrezzo('REFUSED. "x" is inside a folder the person blocked for the device that sent this turn. Nothing was searched;');
    assert.equal(sicurezza.detto, 'Lo strumento ha rifiutato la richiesta.', 'un rifiuto di sicurezza non diventa un no della persona');
  } finally { impostaLingua('it'); }
});

/* Revisore della cura 0.2.2 (giudice v1971): due mutanti vivi. (1) La regola sta IN TESTA: un server che si chiama «too large db» non deve
   far dire «troppo grande». (2) Il ponte delle chiamate scritte come testo (talosHarness.mjs:17467, testo copiato) resta generico. */
test('H05-GIA-DETTO-NO-BORDI: la regola vince sulle altre anche col nome del server; il ponte del testo resta generico', () => {
  const conNomeTroppoGrande = NO_GIA_DETTO_NEL_GIRO.replace('"db"', () => '"too large db"');
  assert.equal(spiegaRifiutoAttrezzo(conNomeTroppoGrande).detto, 'In questo giro avevi già detto di no a questa stessa richiesta, quindi non ti è stato chiesto di nuovo.');
  const ponte = spiegaRifiutoAttrezzo('REFUSED. The person already said no twice in this turn; no more cards are shown. Nothing was done. Go on without it, or say in one line what you can do instead.');
  assert.deepEqual([ponte.rifiutato, ponte.tipo, ponte.detto], [true, 'rifiuto', 'Lo strumento ha rifiutato la richiesta.']);
});
