import test from 'node:test';
import assert from 'node:assert/strict';
import { comandoObiettivo, suggerisciComando, righeDellaCarta, frasiDeiLimiti, criterioDalModulo, provaInParole, stessiControlli } from '../../src/components/obiettivo-carta.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { statoSessione } from '../../src/components/session-item.js';

/*
 * ⭐ /goal G6 (owner 15/10/2026) — le funzioni PURE della carta di conferma C1 e del comando `/goal`. La superficie si prova nel
 * browser (sul server di prova).
 */

test('GOAL-CMD-01 — `/goal <testo>` imposta, `/goal` da solo mostra; AL CONTRARIO: niente sottocomandi nascosti, «/goals» e il testo normale non sono il comando', () => {
  assert.deepEqual(comandoObiettivo('/goal fai passare i test'), { tipo: 'imposta', testo: 'fai passare i test' });
  assert.deepEqual(comandoObiettivo('  /goal   righe\nsu due  '), { tipo: 'imposta', testo: 'righe\nsu due' });
  assert.deepEqual(comandoObiettivo('/goal'), { tipo: 'mostra' });
  assert.deepEqual(comandoObiettivo('/goal   '), { tipo: 'mostra' });
  assert.deepEqual(comandoObiettivo('/goal pausa'), { tipo: 'imposta', testo: 'pausa' }, 'niente sottocomandi: la carta lo fa confermare');
  for (const no of ['/goals fai', 'fai /goal x', '/Goalx', '', null, 'goal x', '/ goal x']) assert.equal(comandoObiettivo(no), null, String(no));
});

test('GOAL-CMD-02 — il suggerimento compare solo su «/» e un prefisso di «goal», una parola sola', () => {
  for (const si of ['/', '/g', '/go', '/GOA', '/goal']) assert.equal(suggerisciComando(si), true, si);
  for (const no of ['', 'g', '/goal ', '/goals', '/x', 'ciao /g', '/go al']) assert.equal(suggerisciComando(no), false, no);
});

test('GOAL-CARD-01 — le righe della carta: tipo, frase e come lo prova TALOS (il comando com\'è, il fatto sul file, il giudice)', () => {
  impostaLingua('it');
  const righe = righeDellaCarta([
    { testo: 'I test passano', verifica: { tipo: 'comando', comando: 'npm test -- checkout' } },
    { testo: 'Il README ha la sezione', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'contiene', testo: '## Install' } },
    { testo: 'Il file vecchio non c\'è', verifica: { tipo: 'file', percorso: 'old.js', fatto: 'non-esiste' } },
    { testo: 'I passi funzionano', verifica: { tipo: 'giudizio' } },
  ]);
  assert.deepEqual(righe.map((r) => [r.tipo, r.tipoTesto, r.prova, r.mono]), [
    ['comando', 'Comando', 'npm test -- checkout', true],
    ['file', 'File', 'README.md contiene «## Install»', true],
    ['file', 'File', 'old.js non esiste', true],
    ['giudizio', 'Giudizio', 'Un modello separato legge le prove e decide', false],
  ]);
  assert.deepEqual(righeDellaCarta(null), []);
  assert.equal(provaInParole({ tipo: 'sconosciuto' }), 'Un modello separato legge le prove e decide');
});

test('GOAL-CARD-02 — i limiti dicono i tetti VERI; senza tetto dei token niente token; senza tetti noti solo il revisore', () => {
  impostaLingua('it');
  assert.match(frasiDeiLimiti({ giri: 20, token: null }), /^Si ferma dopo 20 giri\. Prima di dire «fatto», un revisore separato/u);
  assert.match(frasiDeiLimiti({ giri: 30, token: 2_000_000 }), /^Si ferma dopo 30 giri o 2\.000\.000 token\./u);
  assert.match(frasiDeiLimiti({ giri: 1, token: null }), /^Si ferma dopo 1 giro\./u);
  assert.match(frasiDeiLimiti(null), /^Prima di dire «fatto»/u);
  impostaLingua('en');
  assert.match(frasiDeiLimiti({ giri: 20, token: null }), /^It stops after 20 turns\. Before saying «done»/u);
  assert.match(frasiDeiLimiti({ giri: 30, token: 2_000_000 }), /^It stops after 30 turns or 2,000,000 tokens\./u, 'in inglese le migliaia con la virgola, qualunque sia la lingua del sistema');
  impostaLingua('it');
});

test('GOAL-CARD-03 — un controllo scritto a mano diventa la forma del contratto; una riga vuota si ignora; il testo cercato resta com\'è', () => {
  assert.deepEqual(criterioDalModulo({ testo: ' I test passano ', tipo: 'comando', comando: ' npm test ' }), { testo: 'I test passano', verifica: { tipo: 'comando', comando: 'npm test' } });
  assert.deepEqual(criterioDalModulo({ testo: 'Sezione', tipo: 'file', percorso: 'README.md', fatto: 'contiene', cerca: ' ## Install' }),
    { testo: 'Sezione', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'contiene', testo: ' ## Install' } });
  assert.deepEqual(criterioDalModulo({ testo: 'Niente', tipo: 'file', percorso: 'x.js', fatto: 'esiste', cerca: 'ignorato' }), { testo: 'Niente', verifica: { tipo: 'file', percorso: 'x.js', fatto: 'esiste' } }, 'il testo cercato solo per contiene/non contiene');
  assert.deepEqual(criterioDalModulo({ testo: 'Bello', tipo: 'giudizio' }), { testo: 'Bello', verifica: { tipo: 'giudizio' } });
  assert.equal(criterioDalModulo({ testo: '  ', tipo: 'comando', comando: '' }), null, 'una riga vuota non è un controllo');
  // AL CONTRARIO: un fatto sconosciuto non passa così com'è — e la forma vera la giudica il server (contratto.mjs)
  assert.equal(criterioDalModulo({ testo: 'x', tipo: 'file', percorso: 'a', fatto: 'boh' }).verifica.fatto, 'esiste');
});

test('GOAL-FERMA-UI-01 — una chat nata ferma si legge «in attesa del primo messaggio»; AL CONTRARIO una conclusa vera resta col suo esito', () => {
  impostaLingua('it');
  assert.equal(statoSessione({ conclusa: true, primoMessaggioAtteso: true }).classe, 'pendente');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).classe, 'successo');
  assert.equal(statoSessione({ conclusa: true }).classe, 'ignoto', 'senza il segno del server niente cambia');
  assert.equal(statoSessione({ conclusa: true, primoMessaggioAtteso: true, interrotta: true }).classe, 'interrotto', 'interrotta vince');
});

test('GOAL-CARD-04 (G6UI-REV-03) — i controlli del contratto e quelli rifatti dal modulo SENZA modifiche sono gli stessi; AL CONTRARIO una modifica vera, o un\'uscita persa, no', () => {
  const delModello = [
    { testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test', uscita: 0 } },
    { testo: 'README exists', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'esiste' } },
    { testo: 'reads well', verifica: { tipo: 'giudizio' } },
  ];
  const dalModulo = [
    criterioDalModulo({ testo: 'runs npm test', tipo: 'comando', comando: 'npm test' }),
    criterioDalModulo({ testo: 'README exists', tipo: 'file', percorso: 'README.md' }),
    criterioDalModulo({ testo: 'reads well' }),
  ];
  assert.equal(stessiControlli(dalModulo, delModello), true, 'aprire e chiudere la modifica non è modificare');
  assert.equal(stessiControlli(dalModulo.map((c, i) => (i === 0 ? { ...c, verifica: { ...c.verifica, comando: 'npm run test' } } : c)), delModello), false, 'un comando cambiato è una modifica');
  assert.equal(stessiControlli(dalModulo.slice(1), delModello), false, 'un controllo tolto è una modifica');
  assert.equal(stessiControlli(dalModulo, delModello.map((c, i) => (i === 0 ? { ...c, verifica: { ...c.verifica, uscita: 1 } } : c))), false, 'un uscita attesa diversa è un controllo diverso');
  // la riga si ricorda l'uscita del controllo originale: rifatto senza cambiare niente, è lo stesso controllo (revisione 15/10)
  const conUscita = [{ testo: 'fails on purpose', verifica: { tipo: 'comando', comando: 'npm run check-broken', uscita: 1 } }];
  const rifatto = [criterioDalModulo({ testo: 'fails on purpose', tipo: 'comando', comando: 'npm run check-broken', uscita: 1 })];
  assert.deepEqual(rifatto[0].verifica, { tipo: 'comando', comando: 'npm run check-broken', uscita: 1 }, 'the expected exit is kept');
  assert.equal(stessiControlli(rifatto, conUscita), true, 'unchanged after Edit: not a modification');
});
