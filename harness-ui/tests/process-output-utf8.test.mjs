import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {eseguiComando, eseguiComandoSandboxato} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-utf8-'));
  t.after(() => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rimuoviCartellaDiProva(root);
  });
  return root;
}
async function controlled(t, kind, chunks, {end = true, onPezzo} = {}) {
  const pieces = [], child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
  const mocked = t.mock.method(childProcess, 'spawn', () => {
    queueMicrotask(() => {
      for (const [stream, bytes] of chunks) child[stream].emit('data', Buffer.from(bytes));
      if (end) {child.stdout.emit('end'); child.stderr.emit('end');}
      child.emit('close', 0);
    });
    return child;
  });
  syncBuiltinESMExports();
  try {
    const callback = piece => {pieces.push(piece); onPezzo?.(piece);};
    const result = kind === 'direct'
      ? await eseguiComando('fixture', [], {onPezzo: callback})
      : await eseguiComandoSandboxato('fixture', fixture(t), {dove: 'windows', onPezzo: callback});
    return {result, pieces, combined: kind === 'direct' ? result.insieme : result.testo};
  } finally {mocked.mock.restore(); syncBuiltinESMExports();}
}
for (const kind of ['direct', 'windows']) {
  const options = {skip: kind === 'windows' && process.platform !== 'win32'};
  test(`OUTPUT10-SPLIT-${kind}: every UTF8 byte boundary preserves complete streamed characters`, options, async t => {
    const original = 'a€🙂漢éZ';
    const {result, pieces, combined} = await controlled(t, kind, [...Buffer.from(original)].map(b => ['stdout', [b]]));
    assert.equal(result.fuori, original);
    assert.equal(combined, original);
    assert.equal(pieces.map(p => p.testo).join(''), original);
    assert.ok(pieces.every(p => p.testo.length > 0 && p.testo.isWellFormed() && !p.testo.includes('\uFFFD')));
  });
  test(`OUTPUT10-INTERLEAVE-${kind}: independent streams cannot splice bytes into each other's character`, options, async t => {
    const {result, pieces, combined} = await controlled(t, kind, [
      ['stdout', [0xe2]], ['stderr', [0xf0]], ['stdout', [0x82]],
      ['stderr', [0x9f, 0x99]], ['stdout', [0xac]], ['stderr', [0x82]],
    ]);
    assert.equal(result.fuori, '€'); assert.equal(result.errori, '🙂');
    assert.equal(combined, '€🙂', 'order of complete text availability, not an invented cross-pipe byte order');
    assert.deepEqual(pieces, [{flusso: 'fuori', testo: '€'}, {flusso: 'errori', testo: '🙂'}]);
  });
  for (const end of [true, false]) test(`OUTPUT10-END-${kind}-${end}: flush an incomplete final sequence exactly once`, options, async t => {
    const {result, pieces, combined} = await controlled(t, kind, [['stdout', [0xe2, 0x82]]], {end});
    assert.equal(result.fuori, '\uFFFD'); assert.equal(combined, '\uFFFD');
    assert.deepEqual(pieces, [{flusso: 'fuori', testo: '\uFFFD'}]);
  });
  test(`OUTPUT10-CALLBACK-THROWS-${kind}: a failed observer cannot corrupt or stop capture`, options, async t => {
    const original = '€A';
    const {result, pieces} = await controlled(t, kind, [...Buffer.from(original)].map(b => ['stdout', [b]]), {onPezzo: () => {throw Error('observer failed');}});
    assert.equal(result.codice, 0); assert.equal(result.fuori, original);
    assert.equal(pieces.map(p => p.testo).join(''), original);
  });
  test(`OUTPUT10-EMPTY-${kind}: empty streams emit no synthetic output`, options, async t => {
    const {result, pieces, combined} = await controlled(t, kind, []);
    assert.equal(result.codice, 0); assert.equal(combined, ''); assert.deepEqual(pieces, []);
  });
  test(`OUTPUT10-ASCII-ORDER-${kind}: complete ASCII chunks retain observed arrival order`, options, async t => {
    const {result, combined} = await controlled(t, kind, [['stdout', Buffer.from('A')], ['stderr', Buffer.from('B')], ['stdout', Buffer.from('C')]]);
    assert.equal(result.fuori, 'AC'); assert.equal(result.errori, 'B'); assert.equal(combined, 'ABC');
  });
}

for (const kind of ['direct', 'windows']) test(`OUTPUT10-REAL-${kind}: a real process preserves UTF8 in both streams and deltas`, {skip: kind === 'windows' && process.platform !== 'win32'}, async t => {
  const root = fixture(t), out = 'città € 🙂 漢字\n', err = 'errore é 🙂\n', pieces = [];
  writeFileSync(join(root, 'producer.cjs'), `const out=Buffer.from(${JSON.stringify(out)}),err=Buffer.from(${JSON.stringify(err)});let i=0;const timer=setInterval(()=>{if(i<out.length)process.stdout.write(out.subarray(i,i+1));if(i<err.length)process.stderr.write(err.subarray(i,i+1));if(++i>=Math.max(out.length,err.length))clearInterval(timer);},5);`);
  const onPezzo = piece => pieces.push(piece);
  const result = kind === 'direct'
    ? await eseguiComando(process.execPath, ['producer.cjs'], {cwd: root, onPezzo})
    : await eseguiComandoSandboxato(`"${process.execPath}" producer.cjs`, root, {dove: 'windows', onPezzo});
  assert.equal(result.codice, 0);
  assert.equal(result.fuori, kind === 'direct' ? out : out.trim());
  assert.equal(result.errori, kind === 'direct' ? err : err.trim());
  assert.equal(pieces.filter(p => p.flusso === 'fuori').map(p => p.testo).join(''), out);
  assert.equal(pieces.filter(p => p.flusso === 'errori').map(p => p.testo).join(''), err);
  assert.doesNotMatch(kind === 'direct' ? result.insieme : result.testo, /\uFFFD/);
});
