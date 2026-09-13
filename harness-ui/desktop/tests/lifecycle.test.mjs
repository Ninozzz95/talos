import assert from 'node:assert/strict';
import test from 'node:test';

import { BACKOFF_MS_DEFAULT, creaCicloDiVita } from '../lifecycle.mjs';

test('R01-CICLO-ORFANO — salute fallita elimina il figlio prima di ripartire', async () => {
  const { ciclo, chiamate } = armatura({ saluteSeq: [false] });
  await ciclo.avvia();
  assert.deepEqual(chiamate.uccisioni, [101]);
});

test('R01-CICLO-CHIUSURA-AVVIO — anche il figlio consegnato dopo chiudi viene ucciso', async () => {
  let consegna; const morti = [];
  const ciclo = creaCicloDiVita({ avviaFiglio: () => new Promise(r => { consegna = r; }), uccidiFiglio: h => morti.push(h.pid), attendiSalute: async () => true });
  const avvio = ciclo.avvia(); ciclo.chiudi(); consegna({ pid: 99, exitCode: null }); await avvio;
  assert.deepEqual(morti, [99]); assert.equal(ciclo.stato(), 'chiuso');
});

test('R01-CICLO-RIPROVA — dopo arreso il tentativo esplicito può guarire', async () => {
  let sano = false;
  const ciclo = creaCicloDiVita({ avviaFiglio: () => ({ exitCode: null }), uccidiFiglio: () => {}, attendiSalute: async () => sano, tentativiMassimi: 0 });
  await ciclo.avvia(); assert.equal(ciclo.stato(), 'arreso');
  sano = true; assert.equal(await ciclo.riprova(), 'pronto');
});

test('R01-CICLO-RISVEGLIO-TARDIVO — una salute tardiva non riapre dopo la chiusura', async () => {
  let consegna; let risveglio = false;
  const ciclo = creaCicloDiVita({ avviaFiglio: () => ({ exitCode: null }), uccidiFiglio: () => {}, attendiSalute: () => risveglio ? new Promise(r => { consegna = r; }) : Promise.resolve(true) });
  await ciclo.avvia(); ciclo.sospendi(); risveglio = true;
  const p = ciclo.riprendi(); ciclo.chiudi(); ciclo.figlioUscito(0); consegna(true); await p;
  assert.equal(ciclo.stato(), 'chiuso');
});

/*
 * ⭐⭐⭐ 04/9 — W2-13, la macchina a stati del figlio Node, provata senza
 * Electron e senza timer veri (`pianifica` iniettata: i riavvii differiti si
 * eseguono a mano, così il test vede OGNI passo).
 */
function armatura({ saluteSeq = [true], exitCode = null } = {}) {
  const chiamate = { avvii: 0, uccisioni: [], avvisi: [], stati: [], differiti: [] };
  let n = 0;
  const ciclo = creaCicloDiVita({
    avviaFiglio: async () => { chiamate.avvii += 1; return { pid: 100 + chiamate.avvii, exitCode }; },
    uccidiFiglio: (h) => { chiamate.uccisioni.push(h.pid); },
    attendiSalute: async () => { const v = saluteSeq[Math.min(n, saluteSeq.length - 1)]; n += 1; return v; },
    onStato: (s, d) => chiamate.stati.push(s),
    onAvviso: (m) => chiamate.avvisi.push(m),
    pianifica: (fn, ms) => chiamate.differiti.push({ fn, ms }),
    backoffMs: [10, 20, 40],
    tentativiMassimi: 3,
  });
  return { ciclo, chiamate };
}

test('CICLO-01 — il verso giusto: fermo → avvio → pronto; chiudi() → in-chiusura → (exit) → chiuso, e l\'uscita NON è un crash', async () => {
  const { ciclo, chiamate } = armatura();
  assert.equal(ciclo.stato(), 'fermo');
  assert.equal(await ciclo.avvia(), 'pronto');
  assert.equal(chiamate.avvii, 1);
  ciclo.chiudi();
  assert.equal(ciclo.stato(), 'in-chiusura');
  assert.deepEqual(chiamate.uccisioni, [101]);
  ciclo.figlioUscito(0);
  assert.equal(ciclo.stato(), 'chiuso');
  assert.deepEqual(chiamate.stati, ['avvio', 'pronto', 'in-chiusura', 'chiuso']);
  assert.equal(chiamate.avvisi.length, 0, 'una chiusura chiesta da noi non produce avvisi');
  assert.equal(chiamate.differiti.length, 0, 'nessun riavvio pianificato');
});

test('CICLO-02 — AL CONTRARIO: un\'uscita inattesa da pronto è un crash, avvisa, pianifica il riavvio col backoff, e un riavvio riuscito azzera il contatore', async () => {
  const { ciclo, chiamate } = armatura();
  await ciclo.avvia();
  ciclo.figlioUscito(1);
  assert.equal(ciclo.stato(), 'crash');
  assert.equal(chiamate.avvisi.length, 1);
  assert.match(chiamate.avvisi[0], /tentativo 1 di 3/);
  assert.equal(chiamate.differiti.length, 1);
  assert.equal(chiamate.differiti[0].ms, 10);
  await chiamate.differiti[0].fn(); // il timer scatta
  await new Promise((r) => setImmediate(r));
  assert.equal(ciclo.stato(), 'pronto');
  assert.equal(chiamate.avvii, 2);
  assert.equal(ciclo.riavviiConsecutivi(), 0, 'riavvio riuscito ⇒ contatore azzerato');
});

test('CICLO-03 — crash separati da riavvii RIUSCITI restano ognuno un primo tentativo (10 ms, contatore azzerato); una catena che NON guarisce scala 10/20/40 e poi si ARRENDE senza altri timer', async () => {
  // (a) tre crash, ma ogni riavvio riesce: nessuna scalata, il contatore si azzera ogni volta — un server che cade una volta al giorno non deve pagare il backoff di uno che cade tre volte al secondo.
  const { ciclo, chiamate } = armatura();
  await ciclo.avvia();
  const attese = [];
  for (let i = 0; i < 3; i += 1) {
    ciclo.figlioUscito(137);
    assert.equal(ciclo.stato(), 'crash');
    const d = chiamate.differiti.pop();
    attese.push(d.ms);
    await d.fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(ciclo.stato(), 'pronto');
  }
  assert.deepEqual(attese, [10, 10, 10]);
  assert.equal(ciclo.riavviiConsecutivi(), 0);

  // (b) AL CONTRARIO: un figlio che dopo il primo crash NON diventa mai sano — backoff crescente, poi «arreso».
  const b = armatura({ saluteSeq: [true, false, false, false, false] });
  await b.ciclo.avvia();
  b.ciclo.figlioUscito(1);
  const scalata = [];
  for (let i = 0; i < 4; i += 1) {
    const d = b.chiamate.differiti.pop();
    if (!d) break;
    scalata.push(d.ms);
    await d.fn();
    await new Promise((r) => setImmediate(r));
  }
  assert.deepEqual(scalata, [10, 20, 40], 'tre tentativi consecutivi falliti ⇒ backoff crescente, poi basta');
  assert.equal(b.ciclo.stato(), 'arreso');
  assert.match(b.chiamate.avvisi.at(-1), /non lo riavvio più/);
  assert.equal(b.chiamate.differiti.length, 0, 'da «arreso» non parte nessun altro timer');
});

test('CICLO-04 — sospensione: sospendi() solo da pronto; riprendi() SONDA la salute — sana ⇒ pronto senza riavvio; morta ⇒ crash con riavvio', async () => {
  const a = armatura({ saluteSeq: [true, true] });
  await a.ciclo.avvia();
  assert.equal(a.ciclo.sospendi(), 'sospeso');
  assert.equal(await a.ciclo.riprendi(), 'pronto');
  assert.equal(a.chiamate.avvii, 1, 'figlio sano ⇒ nessun riavvio');

  const b = armatura({ saluteSeq: [true, false] });
  await b.ciclo.avvia();
  b.ciclo.sospendi();
  assert.equal(await b.ciclo.riprendi(), 'crash');
  assert.equal(b.chiamate.differiti.length, 1, 'figlio morto nel sonno ⇒ riavvio pianificato');
  assert.equal(b.ciclo.sospendi(), 'crash', 'sospendi() fuori da pronto non cambia stato');
});

test('CICLO-05 — un avvio che non raggiunge mai la salute è trattato come crash (mai un «pronto» finto); chiudi() durante l\'avvio vince', async () => {
  const a = armatura({ saluteSeq: [false] });
  assert.equal(await a.ciclo.avvia(), 'crash');
  assert.equal(a.chiamate.differiti.length, 1);

  const b = armatura({ saluteSeq: [true] });
  let sblocca;
  const lento = creaCicloDiVita({
    avviaFiglio: () => new Promise((r) => { sblocca = () => r({ pid: 7, exitCode: null }); }),
    uccidiFiglio: () => {},
    attendiSalute: async () => true,
    pianifica: () => {},
  });
  const p = lento.avvia();
  lento.chiudi();
  sblocca();
  await p;
  assert.equal(lento.stato(), 'chiuso', 'la chiusura chiesta durante l\'avvio non viene sovrascritta da un «pronto» tardivo');
  assert.ok(b);
  assert.deepEqual([...BACKOFF_MS_DEFAULT], [500, 1000, 2000, 4000, 8000]);
});
