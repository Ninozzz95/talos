import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { trovaIstruzioniDiProgetto, testoIstruzioniDiProgetto } from '../src/istruzioni-di-progetto.mjs';
import { analizzaSezioniIstruzioni, creaIniettoreSezioni, rimuoviCommentiHtml } from '../src/sezioni-istruzioni.mjs';
import { contestoDelProgetto } from '../src/contesto-del-progetto.mjs';
import { discoNode } from '../src/kernel/talosHarness.mjs';
import { RADICE, FILE_ISTRUZIONI, leggiPrima, misuraCatene } from './fixtures/bc48-b-misure.mjs';

const righe = testo => testo.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const nonVuote = testo => new Set(testo.split(/\r?\n/).map(r => r.trim()).filter(Boolean));
const leggi = nome => readFile(join(RADICE, nome), 'utf8');
const sorgenti = async () => Object.fromEntries(await Promise.all(FILE_ISTRUZIONI.map(async nome => [nome, await leggi(nome)])));
const titoliSempre = ['Non-Negotiable User Rule', 'Architecture Boundaries', 'Before Coding', 'Tool Routing', 'No fake feature rule', 'Error Handling', 'Security And Policy', 'Verification'];
const titoliIndice = ['Persistent Lanes And Delegation', 'Code-Level Planning Ledger', 'Standards-First Engineering', 'Direct Open-Source Integration', 'Regression Prevention', 'State And Context Discipline'];

test('BC48-B-ORIGINALE: la fixture conserva i byte originali certificati da A', async () => {
  const { originale, originaleSha256 } = await leggiPrima();
  assert.equal(createHash('sha256').update(originale).digest('hex'), 'd7b56001cc35767f889d4aa4f40decb2a3cebab78fcc97c11eb929ba9493b9ac');
  assert.equal(originaleSha256, createHash('sha256').update(originale).digest('hex'));
  assert.equal(Buffer.byteLength(originale), 11480);
  assert.equal(righe(originale).length, 172);
  assert.equal(righe(originale).filter(r => r.startsWith('## ')).length, 17);
});

for (const [cwd, vietato, proprio] of [
  ['harness-ui', 'control-plane/AGENTS.md', 'Respect the existing design system'],
  ['control-plane', 'harness-ui/AGENTS.md', '`/chat` is the dedicated low-noise chat surface'],
]) {
  test(`BC48-B-CATENA-${cwd}: radice e file proprio intero, nessun file fratello`, async () => {
    const cartella = join(RADICE, cwd);
    const trovati = await trovaIstruzioniDiProgetto(cartella);
    assert.deepEqual(trovati.map(f => f.etichetta), ['AGENTS.md', `${cwd}/AGENTS.md`]);
    assert.deepEqual(trovati.map(f => f.lettura), ['../AGENTS.md', 'AGENTS.md']);
    const resa = testoIstruzioniDiProgetto(trovati);
    assert.deepEqual(resa.usati, ['AGENTS.md', `${cwd}/AGENTS.md`]);
    assert.deepEqual(resa.omessi, []);
    assert.deepEqual(resa.indicizzati, ['AGENTS.md']);
    assert.ok(resa.testo.includes(proprio));
    assert.ok(resa.testo.endsWith(await leggi(`${cwd}/AGENTS.md`)));
    assert.ok(!resa.testo.includes(`### ${vietato}`));
    assert.doesNotMatch(resa.testo, cwd === 'harness-ui' ? /php artisan test|shadcn-vue|`\/dashboard`/ : /Calm theme|npm run test:kernel/);
    assert.equal(await discoNode({ radice: cartella }).leggi('../AGENTS.md'), await leggi('AGENTS.md'));
    const preambolo = await contestoDelProgetto({ cartella, deps: { eseguiGit: async () => null } });
    assert.ok(preambolo.testo.startsWith(resa.testo));
    assert.deepEqual(preambolo.blocchi.istruzioni.usati, resa.usati);
    assert.deepEqual(preambolo.blocchi.istruzioni.sezioniSempre, resa.sezioniSempre);
  });
}

test('BC48-B-ALTRE-CATENE: radice senza figli; core e validator col solo file locale', async () => {
  for (const cwd of ['.', 'core', 'validator']) {
    const trovati = await trovaIstruzioniDiProgetto(join(RADICE, cwd));
    assert.deepEqual(trovati.map(f => f.etichetta), cwd === '.' ? ['AGENTS.md'] : ['AGENTS.md', `${cwd}/AGENTS.md`]);
    const resa = testoIstruzioniDiProgetto(trovati);
    assert.deepEqual(resa.omessi, []);
    assert.deepEqual(resa.indicizzati, ['AGENTS.md']);
    if (cwd !== '.') assert.ok(resa.testo.endsWith(await leggi(`${cwd}/AGENTS.md`)));
  }
});

test('BC48-B-SEMPRE: tutte e sole le otto sezioni approvate entrano intere', async () => {
  const raw = await leggi('AGENTS.md');
  const sezioni = analizzaSezioniIstruzioni(raw).sezioni;
  const resa = testoIstruzioniDiProgetto(await trovaIstruzioniDiProgetto(RADICE));
  assert.deepEqual(resa.sezioniSempre.map(s => s.titolo), titoliSempre);
  assert.deepEqual(sezioni.filter(s => !s.sempre).map(s => s.titolo), titoliIndice);
  for (const s of sezioni.filter(s => s.sempre)) assert.ok(resa.testo.includes(s.testo), s.titolo);
  const architettura = sezioni.find(s => s.titolo === 'Architecture Boundaries');
  assert.equal(architettura.testo.split('\n').filter(r => r.startsWith('- ')).length, 3);
  const verifica = sezioni.find(s => s.titolo === 'Verification');
  assert.deepEqual([...nonVuote(verifica.testo)], ['## Verification', 'Report failures honestly and do not claim a feature is done without fresh evidence.']);
  assert.doesNotMatch(resa.testo, /<!--|talos: sempre|talos: paths/);
  assert.ok(Buffer.byteLength(raw) < 11480);
});

test('BC48-B-INDICE-RIGHE: sei sezioni su richiesta con righe e byte fisici dopo lo spostamento', async () => {
  const raw = await leggi('AGENTS.md');
  const fisiche = righe(raw);
  const titoli = fisiche.flatMap((r, i) => r.startsWith('## ') ? [{ titolo: r.slice(3).trim(), da: i + 1 }] : []);
  const resa = testoIstruzioniDiProgetto(await trovaIstruzioniDiProgetto(join(RADICE, 'harness-ui')));
  assert.equal(resa.testo.split('\n').filter(r => /^## .* · righe \d+-\d+ · \d+ byte · /.test(r)).length, 6);
  for (const titolo of titoliIndice) {
    const i = titoli.findIndex(s => s.titolo === titolo);
    assert.notEqual(i, -1, titolo);
    const da = titoli[i].da;
    const a = (titoli[i + 1]?.da ?? fisiche.length + 1) - 1;
    const segmento = fisiche.slice(da - 1, a).join('');
    assert.ok(resa.testo.includes(`## ${titolo} · righe ${da}-${a} · ${Buffer.byteLength(segmento)} byte · `), titolo);
    assert.ok(!resa.testo.includes(rimuoviCommentiHtml(segmento).trim()), `La sezione ${titolo} deve restare su richiesta`);
  }
  assert.ok(resa.testo.includes('`../AGENTS.md` alle righe indicate'));
});

test('BC48-B-RICONCILIAZIONE: nessuna riga non vuota originale manca, salvo due riscritture dichiarate', async () => {
  const { originale } = await leggiPrima();
  const file = await sorgenti();
  // Eccezioni chiuse: sezione 3 approvata (19-32) e viewport desktop/mobile (97).
  const attese = new Set(righe(originale).flatMap((r, i) => ((i + 1 >= 19 && i + 1 <= 32) || i + 1 === 97) ? [] : [r.trim()]).filter(Boolean));
  const unione = nonVuote(Object.values(file).join('\n'));
  assert.deepEqual([...attese].filter(r => !unione.has(r)), []);
  assert.doesNotMatch(Object.values(file).join('\n'), /Persistent Three-Lane Collaboration|Fable owns|Kimi owns|desktop and mobile viewports/);
});

test('BC48-B-DESTINAZIONI: ogni dettaglio originale si trova nella cartella approvata', async () => {
  const { originale } = await leggiPrima();
  const originali = righe(originale);
  const file = await sorgenti();
  const mappa = {
    'AGENTS.md': [[1, 9], [34, 40], [42, 90], [92, 96], [98, 108], [111, 113], [126, 130], [140, 144], [155, 160], [172, 172]],
    'core/AGENTS.md': [[13, 13], [17, 17], [122, 124], [132, 138], [162, 166], [170, 170]],
    'validator/AGENTS.md': [[14, 14], [132, 136], [162, 164], [167, 167], [170, 170]],
    'control-plane/AGENTS.md': [[15, 16], [109, 109], [115, 120], [146, 153], [162, 164], [168, 170]],
  };
  for (const [nome, intervalli] of Object.entries(mappa)) {
    const presenti = nonVuote(file[nome]);
    for (const [da, a] of intervalli) for (const r of nonVuote(originali.slice(da - 1, a).join(''))) assert.ok(presenti.has(r), `${nome}: manca ${r}`);
  }
  assert.ok(!file['AGENTS.md'].includes('## Typed Tool Response Parsing'));
  assert.ok(!file['AGENTS.md'].includes('## UI Product Rules'));
  assert.ok(!file['AGENTS.md'].includes('For TALOS specifically:'));
});

test('BC48-B-APPROVATI: sezione 3 e testo desktop copiati verbatim', async () => {
  const { approvati } = await leggiPrima();
  assert.ok((await leggi('AGENTS.md')).includes(approvati.sezione3));
  assert.ok((await leggi('harness-ui/AGENTS.md')).startsWith(approvati.desktop));
});

test('BC48-B-VIEWPORT: regola UI conserva tutti i controlli con entrambe le dimensioni desktop', async () => {
  const { originale } = await leggiPrima();
  const desktop = await leggi('harness-ui/AGENTS.md');
  const attesa = righe(originale)[96].trim().replace('representative desktop and mobile viewports', 'desktop viewports of 1024×800 and 1440×900');
  assert.ok(desktop.includes(attesa));
  assert.ok(!desktop.includes('desktop and mobile viewports'));
});

for (const cwd of ['harness-ui', 'core', 'control-plane', 'validator']) {
  test(`BC48-B-PATH-${cwd}: stato e contesto si attiva solo nelle tre cartelle approvate, anche dopo reload`, async () => {
    const file = await trovaIstruzioniDiProgetto(join(RADICE, cwd));
    const sezioni = analizzaSezioniIstruzioni(file[0].contenuto).sezioni;
    assert.deepEqual(sezioni.filter(s => s.paths.length).map(s => [s.titolo, s.paths]), [['State And Context Discipline', ['core/**', 'control-plane/**', 'harness-ui/**']]]);
    assert.deepEqual(sezioni.find(s => s.titolo === 'Regression Prevention').paths, []);
    const crea = () => creaIniettoreSezioni({ file, cartella: join(RADICE, cwd), radice: RADICE });
    const messaggi = [
      { role: 'assistant', tool_calls: [{ id: 'lettura', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'src/prova.mjs' }) } }] },
      { role: 'tool', tool_call_id: 'lettura', content: 'Contenuto di prova, nessuna lettura o scrittura effettiva.' },
    ];
    const prima = structuredClone(messaggi);
    crea()(messaggi);
    assert.deepEqual(messaggi.slice(0, 2), prima);
    assert.equal(messaggi.length, cwd === 'validator' ? 2 : 3);
    if (cwd !== 'validator') {
      assert.match(messaggi[2].content, /State And Context Discipline/);
      assert.match(messaggi[2].content, /Do not assume hidden state exists across requests/);
      assert.doesNotMatch(messaggi[2].content, /<!--|Regression Prevention/);
    }
    const dopo = structuredClone(messaggi);
    crea()(messaggi);
    assert.deepEqual(messaggi, dopo);
  });
}

test('BC48-B-MISURE: blocchi salvati riproducibili, mappa e scheda uguali nei due versi', async () => {
  const prima = await leggiPrima();
  const dopo = JSON.parse(await readFile(new URL('./fixtures/bc48-b-dopo.json', import.meta.url), 'utf8'));
  const attuale = await misuraCatene({ desktopStabile: prima.desktopStabile });
  assert.deepEqual(attuale, dopo);
  for (const cwd of ['.', 'harness-ui', 'core', 'control-plane']) {
    const etichetta = 'AGENTS.md';
    const lettura = cwd === '.' ? 'AGENTS.md' : '../AGENTS.md';
    const ricostruito = testoIstruzioniDiProgetto([{ contenuto: prima.originale, etichetta, lettura }]);
    assert.equal(ricostruito.testo, prima.catene[cwd].testo);
  }
  assert.deepEqual(dopo.desktopStabile, prima.desktopStabile);
});
