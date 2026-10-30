/* Revisione avversaria del blocco 8 (27/10/2026), portata nel repo con le cure C-R1 (il percorso scritto vince su quello vero),
   C-R2 (radice di sistema solo con la lettera del disco) e C-R3 (l'etichetta dalla colonna della SID). Originale in
   handoff/revisione-blocco-8-prove-2026-10-27/C-consensi-b8.test.mjs. */
/*
 * Revisione blocco 8 (27/10/2026) — pezzo C, `fix/cartelle-giunzione-elevazione` b3f01366b (E-R1) ed e7b73d6d0 (elevazione).
 * Modulo VERO delle cartelle dei dispositivi (`creaCartelleDeiDispositivi`), cartelle e giunzioni vere sotto TEMP, nessuna porta.
 * `R4=<cartella harness-ui>` (di serie: r4-giunzione).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');
const { creaCartelleDeiDispositivi } = await imp('src/remoto/cartelle-dispositivi.mjs');
const { rilevaElevazione, etichettaObbligatoria } = await imp('src/remoto/elevazione.mjs');
const BS = '\x5c';

function ambiente(t) {
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'rev-b8-cd-')));
  const giunzioni = [];
  t.after(async () => { for (const g of giunzioni) { try { rmdirSync(g); } catch { /* già tolta */ } } await rimuoviCartellaDiProva(radice); });
  const dati = join(radice, 'dati');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p; };
  const giunzione = (verso, ...parti) => { const p = join(radice, ...parti); symlinkSync(verso, p, 'junction'); giunzioni.push(p); return p; };
  const nuovo = () => creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry: { cartellePiuUsate: () => [] }, cartelleAmmesse: [], cartelleEscluse: [dati], clock: () => Date.parse('2026-10-27T08:00:00.000Z') });
  return { radice, crea, giunzione, nuovo };
}

/* Due consensi i cui percorsi veri si scontrano: X e Y consentiti quando erano due cartelle vere; poi Y è stata sostituita da una giunzione
   verso X (una cartella spostata e lasciata come passaggio). La persona revoca «Y» col suo percorso. */
async function scontro(t, ordine) {
  const a = ambiente(t);
  const x = a.crea('X'); const y = a.crea('Y');
  const c = a.nuovo();
  for (const p of ordine === 'XY' ? [x, y] : [y, x]) await c.consentiInAnticipo('disp', p);
  await rimuoviCartellaDiProva(y); a.giunzione(x, "Y");
  const trovato = await c.consensoDi('disp', y);
  await c.revoca('disp', trovato.cartellaId);
  const restano = (await c.consensiDi('disp')).map((v) => v.percorso);
  return { x, y, trovato, restano, ancoraInY: await c.consentita('disp', y), ancoraInX: await c.consentita('disp', x) };
}

test('REV-B8-C1 percorsi veri che si scontrano, X consentita per prima: revocare «Y» (testo uguale a un consenso) toglie invece il consenso a X', async (t) => {
  const s = await scontro(t, 'XY');
  t.diagnostic(`trovato ${s.trovato.percorso}; restano ${JSON.stringify(s.restano)}; ancora in Y ${s.ancoraInY}, in X ${s.ancoraInX}`);
  assert.equal(s.trovato.percorso, s.y, `la persona ha scritto il percorso ESATTO di un consenso (${s.y}), e consensoDi ha preso quello di ${s.trovato.percorso} perché il suo percorso vero coincide`);
});

test('REV-B8-C2 lo stesso scontro con Y consentita per prima: si revoca Y, ma il dispositivo lavora ancora in «Y» (attraverso X): «revocata» e resta consentita', /* owner 27/10/2026: il nega vince, la cartella diventa bloccata (tests/remoto-cartella-bloccata.test.mjs) */ async (t) => {
  const s = await scontro(t, 'YX');
  t.diagnostic(`trovato ${s.trovato.percorso}; restano ${JSON.stringify(s.restano)}; ancora in Y ${s.ancoraInY}, in X ${s.ancoraInX}`);
  assert.equal(s.ancoraInY, false, 'dopo la revoca di «Y» il dispositivo può ancora scrivere in Y (è la cartella X, ancora consentita): nessuno lo dice');
});

test('REV-B8-C3 (controllo) una revoca toglie UN consenso solo, e una giunzione verso una cartella consentita si revoca col suo percorso (CD-10)', async (t) => {
  const a = ambiente(t);
  const x = a.crea('X'); const z = a.crea('Z');
  const c = a.nuovo();
  const g = a.giunzione(x, 'G');
  await c.consentiInAnticipo('disp', g); await c.consentiInAnticipo('disp', z);
  const trovato = await c.consensoDi('disp', g);
  assert.equal(trovato?.percorso, x);
  await c.revoca('disp', trovato.cartellaId);
  assert.deepEqual((await c.consensiDi('disp')).map((v) => v.percorso), [z]);
  assert.equal(await c.consentita('disp', g), false);
  /* maiuscole diverse (Windows) e la forma \\?\ */
  await c.consentiInAnticipo('disp', x);
  assert.equal((await c.consensoDi('disp', g.toUpperCase()))?.percorso, x);
  assert.equal((await c.consensoDi('disp', `${BS}${BS}?${BS}${g}`))?.percorso, x);
});

test('REV-B8-C4 (misura) UNC: una cartella consentita come C:\\… non si trova col suo percorso \\\\localhost\\C$\\… (realpath lascia la forma UNC)', async (t) => {
  const a = ambiente(t);
  const x = a.crea('X');
  const c = a.nuovo();
  await c.consentiInAnticipo('disp', x);
  const unc = `${BS}${BS}localhost${BS}${x.replace(':', '$')}`;
  let trovato = 'non provato';
  try { realpathSync.native(unc); trovato = await c.consensoDi('disp', unc); } catch (e) { trovato = `UNC non raggiungibile: ${e.code}`; }
  t.diagnostic(`consensoDi(${unc}) ⇒ ${JSON.stringify(trovato)}; il dispositivo in X: ${await c.consentita('disp', x)}`);
});

test('REV-B8-C5 elevazione: con ogni SystemRoot strano il file eseguito è un percorso assoluto con la lettera del disco', async (t) => {
  const visti = [];
  const run = async (file, argomenti, ambiente) => { visti.push({ file, ambiente }); return '"Mandatory Label\\High Mandatory Level","Label","S-1-16-12288",""'; };
  for (const systemRoot of [undefined, '', 'Windows', '.\\Windows', 'C:Windows', `${BS}Windows`, `${BS}${BS}server${BS}share`, '/Windows']) {
    await rilevaElevazione({ piattaforma: 'win32', systemRoot, run });
  }
  for (const v of visti) t.diagnostic(`${v.file}`);
  const senzaDisco = visti.filter((v) => !/^[A-Za-z]:\\/u.test(v.file));
  assert.deepEqual(senzaDisco.map((v) => v.file), [], 'un SystemRoot «radicato» senza disco (\\Windows) o UNC passa come assoluto: whoami si cerca sul disco della cartella corrente o in rete');
});

test('REV-B8-C6 elevazione: CSV con forme inattese', async (t) => {
  const r = (csv) => rilevaElevazione({ piattaforma: 'win32', systemRoot: 'C:\\Windows', run: async () => csv });
  const righe = {
    'localizzato (italiano)': '"Etichetta obbligatoria\\Livello obbligatorio alto","Etichetta","S-1-16-12288",""',
    'Medium': '"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192",""',
    'vuoto': '',
    'senza virgolette': 'Mandatory Label\\High Mandatory Level,Label,S-1-16-12288,',
    'CRLF e BOM': '\uFEFF"BUILTIN\\Users","Alias","S-1-5-32-545","Mandatory group"\r\n"Mandatory Label\\High Mandatory Level","Label","S-1-16-12288",""\r\n',
    'nome di gruppo che contiene una SID alta fra virgolette, prima dell\'etichetta Medium': '"DOM\\""S-1-16-12288""","Group","S-1-5-21-1-2-3-1111",""\r\n"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192",""',
    'Untrusted prima': '"Mandatory Label\\Untrusted Mandatory Level","Label","S-1-16-0",""',
  };
  const esiti = {};
  for (const [nome, csv] of Object.entries(righe)) esiti[nome] = await r(csv);
  t.diagnostic(JSON.stringify(esiti));
  assert.equal(esiti['localizzato (italiano)'], true);
  assert.equal(esiti.Medium, false);
  assert.equal(esiti.vuoto, false);
  assert.equal(esiti['CRLF e BOM'], true);
  assert.equal(esiti['nome di gruppo che contiene una SID alta fra virgolette, prima dell\'etichetta Medium'], false, 'il nome di un gruppo (CSV con "" raddoppiate) fa dire «High» a un token Medium');
});

test('REV-B8-C7 elevazione vera su questo PC (whoami di sistema, ambiente ridotto): risponde e non lancia', async (t) => {
  const inizio = Date.now();
  const elevato = await rilevaElevazione();
  t.diagnostic(`elevato ${elevato} in ${Date.now() - inizio} ms`);
  assert.equal(typeof elevato, 'boolean');
  assert.equal(etichettaObbligatoria('"x","Label","S-1-16-8192",""'), 'S-1-16-8192');
});
