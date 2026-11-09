/*
 * The rules of the engine bench (`scripts/banco-regole.mjs`): the thresholds the owner wrote on 01/11/2026, each one tried on the side that must fail.
 * The bench decides what goes on by default: a rule that passes on what was not measured is the worst defect it can have.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { riepiloga } from '../scripts/banco-riepilogo.mjs';
import { esitiDelVerdetto, famigliaEVersione, promozioneDiSerie, regolaEsperti, regolaHip, regolaHipFamiglie, regolaMtp, regolaParole, regolaPosti, rinominaRiuscita } from '../scripts/banco-regole.mjs';

test('family and version come from the file name, and a name with no version does not count as one', () => {
  assert.deepEqual(famigliaEVersione('C:\\modelli\\Qwen3.8-27B-UD-Q4_K_M.gguf'), { famiglia: 'Qwen3.8-27B', versione: 'Q4_K_M' });
  assert.deepEqual(famigliaEVersione('a/b/Qwen3.8-27B-UD-Q3_K_XL.gguf'), { famiglia: 'Qwen3.8-27B', versione: 'Q3_K_XL' });
  assert.deepEqual(famigliaEVersione('DeepSeek-V4-Flash-Q5_K_M-00001-of-00003.gguf'), { famiglia: 'DeepSeek-V4-Flash', versione: 'Q5_K_M' });
  assert.deepEqual(famigliaEVersione('gemma-4-BF16.gguf'), { famiglia: 'gemma-4', versione: 'BF16' });
  assert.deepEqual(famigliaEVersione('lfm3.gguf'), { famiglia: 'lfm3', versione: null });
});

const versioni = (famiglia, passa = true) => ['Q3_K_XL', 'Q4_K_M', 'Q5_K_M'].map((v) => ({ modello: `${famiglia}-${v}.gguf`, passa }));

test('«5 famiglie per 3 versioni»: promoted with five full families, and only then', () => {
  const cinque = ['a', 'b', 'c', 'd', 'e'].flatMap((f) => versioni(f));
  assert.equal(promozioneDiSerie(cinque).promossa, true);
  assert.equal(promozioneDiSerie(cinque).famiglieComplete, 5);
  assert.equal(promozioneDiSerie(cinque.slice(0, 12)).promossa, false, 'four families');
  assert.equal(promozioneDiSerie(cinque.slice(0, 14)).promossa, false, 'the fifth with two versions');
  assert.equal(promozioneDiSerie([]).promossa, false, 'nothing measured promotes nothing');
});

test('a version that fails fails its family, whatever a later run says', () => {
  const quattro = ['a', 'b', 'c', 'd'].flatMap((f) => versioni(f));
  const rossa = [...quattro, ...versioni('e'), { modello: 'e-Q4_K_M.gguf', passa: false }];
  assert.equal(promozioneDiSerie(rossa).promossa, false);
  const dopo = [...quattro, { modello: 'e-Q4_K_M.gguf', passa: false }, ...versioni('e')];
  assert.equal(promozioneDiSerie(dopo).promossa, false, 'in any order');
  const quattroVersioni = [...quattro, ...versioni('e'), { modello: 'e-Q8_0.gguf', passa: false }];
  assert.equal(promozioneDiSerie(quattroVersioni).promossa, false, 'three green and a fourth red is not a full family');
  assert.equal(promozioneDiSerie([...quattro, ...versioni('e').map((v) => ({ ...v, passa: 'si' }))]).promossa, false, 'only a true passes');
});

test('a file with no version is not a version', () => {
  const r = promozioneDiSerie([{ modello: 'lfm3.gguf', passa: true }]);
  assert.deepEqual(r.righe, []);
});

const mtp = (finestra, serie, conMtp, extra = {}) => serie.flatMap((s, i) => [{ caso: 'serie', finestra, genTs: s }, { caso: 'mtp', finestra, genTs: conMtp[i], controlliOk: true, ...extra }]);
const tutte = (a, b) => [4000, 16000, 64000].flatMap((f) => mtp(f, a, b));

test('MTP: at least +15%, three out of three, on every window', () => {
  assert.equal(regolaMtp(tutte([10, 10, 10], [11.5, 12, 13])).esito, 'passa');
  assert.equal(regolaMtp(tutte([10, 10, 10], [11.4, 12, 13])).esito, 'non passa', 'one of three under the line');
  const una = [...mtp(4000, [10, 10, 10], [12, 12, 12]), ...mtp(16000, [10, 10, 10], [12, 12, 12]), ...mtp(64000, [10, 10, 10], [10.5, 12, 12])];
  assert.equal(regolaMtp(una).esito, 'non passa', 'a window under the line');
});

test('MTP: a crash or worse answers close it, whatever the speed', () => {
  const crash = [...mtp(4000, [10, 10, 10], [20, 20, 20]), ...mtp(16000, [10, 10, 10], [20, 20, 20]), ...mtp(64000, [10, 10], [20, 20]), { caso: 'mtp', finestra: 64000, errore: 'il motore è uscito' }];
  assert.equal(regolaMtp(crash).esito, 'non passa');
  assert.equal(regolaMtp(crash).perFinestra[2].motivo, 'crash');
  const peggiori = [...mtp(4000, [10, 10, 10], [20, 20, 20], { controlliOk: false }), ...mtp(16000, [10, 10, 10], [20, 20, 20]), ...mtp(64000, [10, 10, 10], [20, 20, 20])];
  assert.equal(regolaMtp(peggiori).esito, 'non passa');
  assert.equal(regolaMtp(peggiori).perFinestra[0].motivo, 'risposte peggiori');
});

test('MTP: what was not measured never passes', () => {
  assert.equal(regolaMtp([]).esito, 'non misurato');
  assert.equal(regolaMtp([], { finestre: [] }).esito, 'non misurato', 'no window at all is not three out of three');
  assert.equal(regolaMtp(mtp(4000, [10, 10, 10], [20, 20, 20])).esito, 'non misurato', 'one window out of three');
  assert.equal(regolaMtp(tutte([10, 10], [20, 20])).esito, 'non misurato', 'two repetitions');
  assert.equal(regolaMtp(tutte([10, 10, 0], [20, 20, 20])).esito, 'non misurato', 'a zero is not a measure');
  assert.equal(regolaMtp(tutte([10, 10, 10], [20, 20, 20]).map((r, i) => (i === 0 ? { ...r, errore: 'x' } : r))).esito, 'non misurato', 'the reference fell');
});

const hip = (vulkan, conHip) => vulkan.flatMap((v, i) => [{ caso: 'vulkan', ...v }, { caso: 'hip', ...conHip[i] }]);
const v = (primaParolaMs, genTs = 30) => ({ primaParolaMs, genTs });

test('HIP: at least 25% on the first word three out of three, with no loss in writing', () => {
  assert.equal(regolaHip(hip([v(1000), v(1000), v(1000)], [v(750), v(700), v(600)])).esito, 'passa');
  assert.equal(regolaHip(hip([v(1000), v(1000), v(1000)], [v(751), v(700), v(600)])).esito, 'non passa', 'one under');
  assert.equal(regolaHip(hip([v(1000), v(1000), v(1000)], [v(700), v(700), v(700, 29.9)])).esito, 'non passa', 'it writes less');
  assert.equal(regolaHip(hip([v(1000), v(1000)], [v(700), v(700)])).esito, 'non misurato');
  assert.equal(regolaHip(hip([v(1000), v(1000), v(null)], [v(700), v(700), v(700)])).esito, 'non misurato');
  assert.equal(regolaHip([]).esito, 'non misurato');
});

test('HIP: three families, three out of three', () => {
  const si = { esito: 'passa' };
  assert.equal(regolaHipFamiglie([si, si, si]).esito, 'passa');
  assert.equal(regolaHipFamiglie([si, si]).esito, 'non misurato');
  assert.equal(regolaHipFamiglie([si, si, { esito: 'non passa' }]).esito, 'non passa');
  assert.equal(regolaHipFamiglie([si, si, { esito: 'non misurato' }]).esito, 'non misurato');
});

const posto = (caso, ms, genTs = 30) => ({ caso, ms, giroSolo: { genTs } });

test('a second slot: 30% less on the delegates, the normal turn not worse', () => {
  const uno = [100, 100, 100].map((ms) => posto('un-posto', ms));
  assert.equal(regolaPosti([...uno, ...[70, 70, 70].map((ms) => posto('due-posti', ms))]).esito, 'passa');
  assert.equal(regolaPosti([...uno, ...[71, 71, 71].map((ms) => posto('due-posti', ms))]).esito, 'non passa');
  assert.equal(regolaPosti([...uno, ...[60, 60, 60].map((ms) => posto('due-posti', ms, 29))]).esito, 'non passa', 'the normal turn got worse');
  assert.equal(regolaPosti([...uno, posto('due-posti', 60), posto('due-posti', 60)]).esito, 'non misurato');
  assert.equal(regolaPosti([...uno, ...[60, 60, 60].map((ms) => ({ ...posto('due-posti', ms), errore: 'x' }))]).esito, 'non misurato');
});

test('forced words: 25% and 10%, and the three answers meet exactly on the line', () => {
  assert.equal(regolaParole(0.25), 'si fa');
  assert.equal(regolaParole(0.2499), 'decide l\'owner');
  assert.equal(regolaParole(0.1), 'decide l\'owner');
  assert.equal(regolaParole(0.0999), 'si chiude');
  assert.equal(regolaParole(0), 'si chiude');
  for (const niente of [null, undefined, Number.NaN, -1, '0.3']) assert.equal(regolaParole(niente), 'non misurato');
});

const VERSIONI = ['Q3_K_XL', 'Q4_K_M', 'Q5_K_M'];
const corsaDi = (nome, famiglia, { valida = true, passa = true, salto = 'passa', tenuta = 'passa', router = 'passa', braccioRouter = true } = {}) => ({ nome, righe: [
  { etichetta: 'verdetto', bracci: VERSIONI.flatMap((v) => [{ braccio: `${famiglia}-${v}.gguf|nuovo`, passa }, { braccio: `${famiglia}-${v}.gguf|vecchio`, passa: !passa }, { braccio: `${famiglia}-${v}.gguf|router`, passa: braccioRouter }]),
    regole: { perModello: VERSIONI.map((v) => ({ modello: `${famiglia}-${v}.gguf`, salto: { esito: salto }, tenuta: { esito: tenuta }, router: { esito: router } })), cambi: { esito: 'passa' }, mescolamento: { esito: 'passa' } } },
  { etichetta: 'controllo-scheda', quando: 'fine', corsaValida: valida },
] });

test('fourth review D4: a verdict that says no promotes nothing, across runs too', () => {
  const cinque = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f, { salto: f === 'e' ? 'non passa' : 'passa' }))).promozione.promossa, false, 'over 5% on the jump');
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f, { tenuta: f === 'e' ? 'non passa' : 'passa' }))).promozione.promossa, false, 'a collapse');
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f, { tenuta: f === 'e' ? 'non misurato' : 'passa' }))).promozione.promossa, false, 'not measured is not a yes');
  const rutter = riepiloga(cinque.map((f) => corsaDi(f, f, { router: f === 'e' ? 'non passa' : 'passa' })));
  assert.equal(rutter.promozione.promossa, true, 'the engine stands on its own');
  assert.equal(rutter.promozioneRouter.promossa, false, 'the router does not come along');
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f))).promozioneRouter.promossa, true);
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f, { braccioRouter: f !== 'e' }))).promozioneRouter.promossa, false, 'the arm of the router, not the one of the engine');
  const senzaCambi = corsaDi('a', 'a').righe[0];
  assert.equal(esitiDelVerdetto({ ...senzaCambi, regole: { ...senzaCambi.regole, cambi: { esito: 'non misurato' } } }).router.every((e) => e.passa === false), true);
  assert.equal(esitiDelVerdetto({ ...senzaCambi, regole: { ...senzaCambi.regole, mescolamento: { esito: 'non misurato' } } }).router.every((e) => e.passa === false), true);
  assert.equal(esitiDelVerdetto({ bracci: senzaCambi.bracci }).motore.every((e) => e.passa === false), true, 'no rules, no promotion');
});

test('fourth review D2: the rename, read on the name and not on a piece of it', () => {
  assert.equal(rinominaRiuscita('export function scratchFolder(p) {}\nexport async function cartellaScratchAttesa() {}'), true, 'the other function keeps its name');
  assert.equal(rinominaRiuscita('export function scratchFolder() {}\ncartellaScratch();'), false, 'one left behind');
  assert.equal(rinominaRiuscita('export function cartellaScratch() {}'), false);
  assert.equal(rinominaRiuscita('myscratchFolderx'), false);
  assert.equal(rinominaRiuscita(undefined), false);
});

test('across runs: the arm that counts is the new engine, and a run the card declared void counts for nothing', () => {
  const cinque = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(riepiloga(cinque.map((f) => corsaDi(f, f))).promozione.promossa, true);
  const senzaUna = riepiloga(cinque.map((f) => corsaDi(f, f, { valida: f !== 'e' })));
  assert.equal(senzaUna.promozione.promossa, false);
  assert.deepEqual(senzaUna.scartate, ['e']);
  const rossa = riepiloga(cinque.map((f) => corsaDi(f, f, { passa: f !== 'e' })));
  assert.equal(rossa.promozione.promossa, false, 'the green arm of the old engine does not stand in');
  const senzaControllo = riepiloga(cinque.map((f) => ({ nome: f, righe: corsaDi(f, f).righe.slice(0, 1) })));
  assert.deepEqual(senzaControllo.scartate, cinque, 'a run that never checked the card is not a valid one');
});

test('across runs: HIP is read by family', () => {
  const righeHip = (f, guadagna) => ['vulkan', 'hip', 'hip', 'vulkan', 'vulkan', 'hip'].map((caso) => ({ etichetta: 'hip', modello: `${f}-Q4_K_M.gguf`, caso, primaParolaMs: caso === 'hip' && guadagna ? 500 : 1000, genTs: 30 }));
  const corse = (fam) => fam.map(([f, g]) => ({ nome: f, righe: righeHip(f, g) }));
  assert.equal(riepiloga(corse([['a', true], ['b', true], ['c', true]])).hip.esito, 'passa');
  assert.equal(riepiloga(corse([['a', true], ['b', true], ['c', false]])).hip.esito, 'non passa');
  assert.equal(riepiloga(corse([['a', true], ['b', true]])).hip.esito, 'non misurato');
});

test('the experts: the official switch first, the copy only when it is not enough', () => {
  const coppie = (a, b) => a.flatMap((x, i) => [{ caso: 'senza', genTs: x }, { caso: 'con', genTs: b[i] }]);
  assert.equal(regolaEsperti(coppie([10, 10, 10], [11, 11, 12])).esito, 'basta l\'interruttore');
  assert.equal(regolaEsperti(coppie([10, 10, 10], [11, 10.9, 12])).esito, 'si guarda la copia');
  assert.equal(regolaEsperti([]).esito, 'non misurato');
  assert.equal(regolaEsperti(coppie([10, 0], [11, 11])).esito, 'non misurato');
});
