/*
 * PANNELLO v2 — la scheda GIT, le AGGIUNTE pure (MAPPA §3.5, G-05): il conto sulla scheda, i +/− e «di chi è la modifica». La scheda
 * di oggi (`creaSchedaGithub`) non si tocca; il disegno delle aggiunte sopra di lei si prova nel browser (`pannello-git.spec.mjs`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { contoGit, modelloAggiunteGit, diChi } from '../../src/components/pannello/git.js';

const voce = (percorso, x, y, tipo, extra = {}) => ({ percorso, x, y, tipo, staged: x !== ' ' && x !== '?', nonStaged: y !== ' ', conflitto: x === 'U' || y === 'U', cartella: false, repoAnnidato: false, da: null, ...extra });

test('PNGIT-01 — il conto sulla scheda: i file da salvare una volta sola (preparato e modificato insieme), il pallino coi conflitti', () => {
  impostaLingua('it');
  assert.deepEqual(contoGit({}), { numero: null, attenzione: 0, descrizione: '' }, 'senza stato: niente numero, niente frase');
  const c = contoGit({ stato: { voci: [voce('a.js', 'M', 'M', 'modificato'), voce('b.js', ' ', 'M', 'modificato'), voce('n.txt', '?', '?', 'nonTracciato')] } });
  assert.equal(c.numero, 3, 'a.js preparato E modificato conta una volta');
  assert.equal(c.attenzione, 0);
  assert.match(c.descrizione, /3/u);
  const conflitto = contoGit({ stato: { voci: [voce('x.js', 'U', 'U', 'conflitto')] } });
  assert.equal(conflitto.attenzione, 1, 'un conflitto accende il pallino');
});

test('PNGIT-02 — i +/− arrivano dai conti del server; un file senza numeri resta senza (niente «+0» inventato)', () => {
  const conti = new Map([['src/a.js', { aggiunte: 3, rimozioni: 1 }], ['img.png', { aggiunte: null, rimozioni: null }]]);
  const m = modelloAggiunteGit({ conti });
  assert.deepEqual([m.get('src/a.js').aggiunte, m.get('src/a.js').rimozioni], [3, 1]);
  assert.deepEqual([m.get('img.png').aggiunte, m.get('img.png').rimozioni], [null, null]);
  assert.equal(m.has('nuovo.txt'), false);
  assert.equal(modelloAggiunteGit({}).size, 0, 'dati vuoti: nessuna voce');
  assert.equal(modelloAggiunteGit({ conti: 'non una mappa', scritti: 'nemmeno', agenti: null }).size, 0, 'dati storti: nessuna eccezione, nessuna voce');
});

test('PNGIT-03 — «di chi è»: il giro della conversazione, gli agenti (nomi lunghi accorciati, doppioni una volta), e niente se TALOS non l’ha scritto', () => {
  impostaLingua('it');
  const lungo = `Agente con un nome lunghissimo ${'x'.repeat(80)}`;
  const m = modelloAggiunteGit({
    scritti: [{ path: 'src/a.js', giro: 12 }, { path: 'src/b.js', giro: null }],
    agenti: [
      { nome: lungo, attivita: { file: [{ percorso: 'src/a.js', scritto: true }, { percorso: 'src/c.js', letto: true }] } },
      { nome: 'Revisore', attivita: { file: [{ percorso: 'src/a.js', creato: true }, { percorso: 'src/a.js', scritto: true }] } },
    ],
  });
  const a = diChi(m.get('src/a.js'));
  assert.equal(a.breve, 'giro 12');
  assert.match(a.frase, /giro 12/u);
  assert.match(a.frase, /Revisore/u);
  assert.equal((a.frase.match(/Revisore/gu) || []).length, 1, 'lo stesso agente una volta sola');
  assert.ok(!a.frase.includes('x'.repeat(80)), 'il nome lungo si accorcia');
  const b = diChi(m.get('src/b.js'));
  assert.ok(b, 'scritto in questa conversazione senza giro: si dice lo stesso');
  assert.equal(m.has('src/c.js'), false, 'un file solo LETTO da un agente non è suo');
  assert.equal(diChi(undefined), null);
  assert.equal(diChi({ giro: null, agenti: [], aggiunte: 1, rimozioni: 0 }), null, 'con i soli numeri non si attribuisce a nessuno');
});

test('PNGIT-04 — in inglese le stesse frasi, nella lingua dell’interfaccia', () => {
  impostaLingua('en');
  try {
    const v = { giro: 4, agenti: ['Reviewer'], aggiunte: null, rimozioni: null };
    const chi = diChi(v);
    assert.match(chi.breve, /turn 4/u);
    assert.match(chi.frase, /^Written /u);
    assert.match(contoGit({ stato: { voci: [voce('a.js', ' ', 'M', 'modificato')] } }).descrizione, /1 file to save/u);
  } finally { impostaLingua('it'); }
});
