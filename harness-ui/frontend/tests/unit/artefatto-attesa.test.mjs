/*
 * 0.2.1-ART D3 (owner 09/11/2026 19:55): la riga dell'attrezzo «Artefatto: …» sopra la carta se ne va, e il suo stato («Sto
 * creando…») passa nella carta. La riga nasce come sempre ma nascosta; la carta nasce in attesa e la riempie l'evento
 * `ArtifactCreated`. Se l'attrezzo finisce senza artefatto (rifiuto, errore, giro interrotto) la carta se ne va e la riga torna,
 * col suo esito: un errore non si perde mai.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';

const url = new URL('../../src/components/artefatto-attesa.js', import.meta.url);
const api = await import(url.href).catch((e) => { if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return {}; throw e; });

function scena() {
  assert.equal(typeof api.creaAttesaArtefatti, 'function', 'il modulo dell\'attesa esiste');
  const doc = documento();
  const batch = { card: doc.createElement('div'), contenitore: doc.createElement('div') };
  batch.card.append(batch.contenitore); doc.body.append(batch.card);
  const carte = [];
  const creaCarta = (attesa) => {
    const card = doc.createElement('div'); doc.body.append(card);
    const c = { card, attesa, titoli: [], riempita: null, titolo(testo) { this.titoli.push(testo); }, riempi(evento) { this.riempita = evento; } };
    carte.push(c); return c;
  };
  const riga = (testo = 'Artefatto: Bilancio') => { const r = doc.createElement('div'); r.textContent = testo; batch.contenitore.append(r); return r; };
  return { doc, batch, carte, creaCarta, riga, attesa: api.creaAttesaArtefatti() };
}

test('ART-RIGA-01: the tool row «Artefatto: …» is not shown; a waiting card takes its place and the event fills it', () => {
  const s = scena(); const r = s.riga();
  assert.equal(s.attesa.inizia('t1', { nome: 'artifact_create', riga: r, batch: s.batch, creaCarta: s.creaCarta }), true);
  assert.equal(r.hidden, true, 'la riga non si vede'); assert.equal(s.batch.card.hidden, true, 'e nemmeno il suo contenitore vuoto');
  assert.equal(s.carte.length, 1); assert.deepEqual(s.carte[0].attesa, { tipo: 'creating', titolo: '' });
  const evento = { type: 'ArtifactCreated', titolo: 'Bilancio' };
  const carta = s.attesa.prendi(); assert.equal(carta, s.carte[0]); carta.riempi(evento);
  s.attesa.finisci('t1');
  assert.equal(r.hidden, true, 'riuscito: la riga resta via, la carta dice tutto'); assert.equal(s.carte[0].card.isConnected, true);
  assert.equal(s.attesa.prendi(), null, 'una carta si riempie una volta');
});

test('ART-RIGA-02: the title arrives while the model writes — read once, from the head of the partial arguments', () => {
  const s = scena(); s.attesa.inizia('t1', { nome: 'artifact_create', riga: s.riga(), batch: s.batch, creaCarta: s.creaCarta });
  s.attesa.argomenti('t1', '{"tito'); assert.deepEqual(s.carte[0].titoli, []);
  s.attesa.argomenti('t1', '{"titolo":"Bilancio \\"di casa\\" \\u00e8'); assert.deepEqual(s.carte[0].titoli, [], 'una stringa non chiusa non è un titolo');
  s.attesa.argomenti('t1', '{"titolo":"Bilancio \\"di casa\\" \\u00e8 qui","html":"<h1>'); assert.deepEqual(s.carte[0].titoli, ['Bilancio "di casa" è qui']);
  s.attesa.argomenti('t1', '{"titolo":"Bilancio \\"di casa\\" \\u00e8 qui","html":"<h1>x</h1>","titolo":"altro"}'); assert.equal(s.carte[0].titoli.length, 1, 'una volta sola');
  s.attesa.argomenti('ignoto', '{"titolo":"x"}');
  const lungo = scena(); lungo.attesa.inizia('t1', { nome: 'artifact_create', riga: lungo.riga(), batch: lungo.batch, creaCarta: lungo.creaCarta });
  lungo.attesa.argomenti('t1', `{"html":"${'a'.repeat(700)}","titolo":"in fondo"}`); assert.deepEqual(lungo.carte[0].titoli, [], 'non si rilegge un artefatto intero a ogni pezzo');
});

test('ART-RIGA-03: a tool that ends without an artifact gives the row back, with its outcome, and the waiting card goes away', () => {
  const s = scena(); const r = s.riga();
  s.attesa.inizia('t1', { nome: 'artifact_create', riga: r, batch: s.batch, creaCarta: s.creaCarta });
  s.attesa.finisci('t1');
  assert.equal(r.hidden, false, 'l\'errore dell\'attrezzo si vede sulla sua riga'); assert.equal(s.batch.card.hidden, false);
  assert.equal(s.carte[0].card.isConnected, false); assert.equal(s.attesa.prendi(), null);
  s.attesa.finisci('t1'); s.attesa.finisci('mai visto');
});

test('ART-RIGA-04: other tools keep their rows; the activity card hides only while every row in it is hidden', () => {
  const s = scena(); const lettura = s.riga('Letto: a.txt');
  assert.equal(s.attesa.inizia('t0', { nome: 'leggi', riga: lettura, batch: s.batch, creaCarta: s.creaCarta }), false);
  assert.equal(lettura.hidden, false); assert.equal(s.carte.length, 0); assert.equal(s.batch.card.hidden, false);
  const r = s.riga(); s.attesa.inizia('t1', { nome: 'artifact_update', riga: r, batch: s.batch, creaCarta: s.creaCarta });
  assert.equal(r.hidden, true); assert.equal(s.batch.card.hidden, false, 'c\'è un\'altra riga da mostrare');
  assert.equal(s.carte[0].attesa.tipo, 'updating');
  const solo = scena(); const a = solo.riga();
  solo.attesa.inizia('t1', { nome: 'artifact_create', riga: a, batch: solo.batch, creaCarta: solo.creaCarta }); assert.equal(solo.batch.card.hidden, true);
  solo.attesa.inizia('t2', { nome: 'leggi', riga: solo.riga('Letto'), batch: solo.batch, creaCarta: solo.creaCarta });
  assert.equal(solo.batch.card.hidden, false, 'un attrezzo che arriva dopo riaccende il contenitore');
});

test('ART-RIGA-04b: in the real page every row is followed by its detail box, which is never `hidden` — the activity card still hides', () => {
  /* Foto del 09/11/2026 sul server di prova: sopra la carta «Creating…» restava la testa «Creating an artifact… · 1s». Nella pagina
     vera ogni riga ha dopo di sé il suo corpo (`pre.talos-tool-row__body`), chiuso dal CSS e non da `hidden`: contato come una riga
     ancora a schermo, teneva acceso il contenitore. */
  const s = scena(); const r = s.riga();
  /* il corpo nasce subito dopo la sua riga, come in `creaRigaAttrezzo` */
  const corpo = (scena_ = s) => { const c = scena_.doc.createElement('pre'); c.className = 'talos-tool-row__body tool-note-detail'; scena_.batch.contenitore.append(c); return c; };
  const corpoArtefatto = corpo();
  s.attesa.inizia('t1', { nome: 'artifact_create', riga: r, batch: s.batch, creaCarta: s.creaCarta });
  assert.equal(r.hidden, true); assert.equal(corpoArtefatto.hidden, false, 'il corpo resta com\'è: lo chiude il CSS della riga');
  assert.equal(s.batch.card.hidden, true, 'niente testa dell\'attività sopra la carta in attesa');
  const lettura = s.riga('Letto: a.txt'); corpo();
  s.attesa.inizia('t2', { nome: 'leggi', riga: lettura, batch: s.batch, creaCarta: s.creaCarta });
  assert.equal(s.batch.card.hidden, false, 'una riga vera da mostrare la riaccende');
  const t = scena(); const q = t.riga(); corpo(t);
  t.attesa.inizia('t1', { nome: 'artifact_create', riga: q, batch: t.batch, creaCarta: t.creaCarta }); t.attesa.finisci('t1');
  assert.equal(q.hidden, false); assert.equal(t.batch.card.hidden, false, 'finito senza artefatto: riga e testa tornano');
});

test('ART-RIGA-05: first in, first filled; cards that left the page are skipped; a new chat starts clean', () => {
  const s = scena();
  s.attesa.inizia('t1', { nome: 'artifact_create', riga: s.riga(), batch: s.batch, creaCarta: s.creaCarta });
  s.attesa.inizia('t2', { nome: 'artifact_create', riga: s.riga(), batch: s.batch, creaCarta: s.creaCarta });
  assert.equal(s.attesa.prendi(), s.carte[0]); assert.equal(s.attesa.prendi(), s.carte[1]); assert.equal(s.attesa.prendi(), null);
  const t = scena();
  t.attesa.inizia('t1', { nome: 'artifact_create', riga: t.riga(), batch: t.batch, creaCarta: t.creaCarta });
  t.attesa.inizia('t2', { nome: 'artifact_create', riga: t.riga(), batch: t.batch, creaCarta: t.creaCarta });
  t.carte[0].card.remove(); assert.equal(t.attesa.prendi(), t.carte[1], 'la carta di una chat ridisegnata non si riempie');
  const u = scena(); u.attesa.inizia('t1', { nome: 'artifact_create', riga: u.riga(), batch: u.batch, creaCarta: u.creaCarta });
  u.attesa.azzera(); assert.equal(u.attesa.prendi(), null);
});

test('ART-RIGA-06: the app hides the row at the tool start, fills the waiting card at the event and settles at the result or the interruption', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  /* il ramo della chat viva (rientro di sei spazi): l'esportazione in Markdown ha rami con gli stessi nomi, più rientrati */
  const caso = (nome) => { const da = app.indexOf(`\n      case '${nome}': {`); assert.ok(da > 0, nome); return app.slice(da, app.indexOf('\n      case \'', da + 10)); };
  assert.match(caso('ToolCallStart'), /attesaArtefatti\.inizia\(evento\.toolCallId, \{ nome: evento\.toolCallName, riga: bubble\.article, batch,/);
  assert.match(caso('ToolCallArgs'), /attesaArtefatti\.argomenti\(evento\.toolCallId, info\.argomenti\)/);
  assert.match(caso('ToolCallResult'), /attesaArtefatti\.finisci\(evento\.toolCallId\)/);
  assert.match(caso('ArtifactCreated'), /attesaArtefatti\.prendi\(\)/);
  const interrotti = app.slice(app.indexOf('function chiudiAttrezziInterrotti()'), app.indexOf('function chiudiBatchTool()'));
  assert.match(interrotti, /attesaArtefatti\.finisci\(id\)/);
});
