import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaRegistro } from '../log.mjs';

test('R01-LOG — nessun segreto intero o diviso fra chunk nel registro', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r01-log-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'registro.log');
  const token = 'abc123'.repeat(11);
  const registro = creaRegistro(file, [token, 'chiave-privata']);
  const canale = registro.canale();
  canale.scrivi(`url /?token=${token.slice(0, 20)}`);
  canale.scrivi(`${token.slice(20)} chiave-privata\n`);
  canale.fine();
  const testo = readFileSync(file, 'utf8');
  assert.ok(!testo.includes(token));
  assert.ok(!testo.includes('chiave-privata'));
  assert.match(testo, /omesso/);
});
