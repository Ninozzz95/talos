import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const radice = new URL('../../../', import.meta.url);
const leggi = (percorso) => readFileSync(new URL(percorso, radice), 'utf8');

test('R05A-TESTO-UFFICIALE — LICENSE contiene il documento GNU integrale senza modifiche', () => {
  const testo = leggi('LICENSE');
  assert.deepEqual(testo.split('\n').slice(0, 2).map(riga => riga.trim()), [
    'GNU AFFERO GENERAL PUBLIC LICENSE',
    'Version 3, 19 November 2007',
  ]);
  assert.equal(
    createHash('sha256').update(readFileSync(new URL('LICENSE', radice))).digest('hex'),
    '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0',
    'SHA-256 del testo ufficiale GNU acquisito il 13/09/2026',
  );
});

for (const percorso of [
  'harness-ui/package.json',
  'harness-ui/frontend/package.json',
  'harness-ui/benchmarks/autocompact/package.json',
  'artifact-worker/package.json',
  'browser-worker/package.json',
  'validator/package.json',
  'context-engine/package.json',
  'harness-ui/desktop/package.json',
]) {
  test(`R05A-MANIFESTI — ${percorso} dichiara solo AGPL v3`, () => {
    assert.equal(JSON.parse(leggi(percorso)).license, 'AGPL-3.0-only');
  });
}

test('R05A-README — licenza coerente e assenza di telemetria dichiarata', () => {
  const testo = leggi('README.md');
  let livelloTerzeParti = null;
  const righeProgetto = testo.split('\n').filter(riga => {
    const titolo = /^(#{1,6})\s+(.+)$/.exec(riga);
    if (titolo) {
      if (livelloTerzeParti !== null && titolo[1].length <= livelloTerzeParti) livelloTerzeParti = null;
      if (/^(?:third[- ]party(?: notices| components)?|terze parti)\s*$/i.test(titolo[2])) livelloTerzeParti = titolo[1].length;
    }
    return livelloTerzeParti === null;
  }).join('\n');
  assert.doesNotMatch(righeProgetto, /\bApache\b/i);
  assert.match(testo, /<a href="LICENSE"><img src="https:\/\/img\.shields\.io\/badge\/license-AGPL--3\.0-blue\.svg"/);
  assert.match(testo, /AGPL-3\.0-only/);
  assert.match(testo, /Telemetria: nessuna/);
});

test('R05A-CHANGELOG — la prima versione desktop è dichiarata non rilasciata', () => {
  assert.match(leggi('harness-ui/desktop/CHANGELOG.md'), /^## desktop-v0\.1\.0 — non rilasciata\s*$/m);
});

test('R05A-RIFERIMENTI-CHANGELOG — le fonti locali sono raggiungibili dal documento', () => {
  const documento = new URL('harness-ui/desktop/CHANGELOG.md', radice);
  const riferimenti = [...readFileSync(documento, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  assert.ok(riferimenti.length > 0, 'Il changelog deve rimandare alle evidenze della release');
  for (const [, riferimento] of riferimenti) {
    const destinazione = new URL(riferimento, documento);
    if (destinazione.protocol === 'file:') assert.doesNotThrow(() => readFileSync(destinazione), riferimento);
  }
});
