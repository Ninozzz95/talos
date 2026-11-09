/*
 * Revisione del blocco 25 (S3, R10): `4b7929f88` voleva UNA frase per `TOO_LARGE` («A message cannot exceed 1048576 bytes.», quella del filo e del
 * dizionario del PC, `frontend/src/i18n/testi/errori.js`), ma il ponte ne diceva una terza («This answer is too large for the connection.»,
 * `remoto/servizio.mjs`) e le letture a pezzi una quarta («A piece can be at most 1 MiB.»). Con frasi diverse per lo stesso codice nessun dizionario
 * la traduce. Questa prova legge ogni `TOO_LARGE` scritto con la sua frase in `src/` e la confronta con quella del server.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MESSAGE_BY_CODE } from '../src/http-app.mjs';
import { BYTE_MASSIMI } from '../src/remoto/filo.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
function file(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? file(join(dir, d.name)) : d.name.endsWith('.mjs') ? [join(dir, d.name)] : []));
}
/* `errore('TOO_LARGE', '…')`, `Object.assign(new Error('…'), { code: 'TOO_LARGE' })` non c'è; `code: 'TOO_LARGE', message: '…'` sì */
const FORME = [/['"]TOO_LARGE['"]\s*,\s*(['`])((?:(?!\1).)*)\1/gu, /code:\s*['"]TOO_LARGE['"]\s*,\s*message:\s*(['`])((?:(?!\1).)*)\1/gu];

test('TOO-LARGE-UNA-FRASE: ogni TOO_LARGE scritto con una frase in src/ usa quella del server (e del dizionario)', () => {
  const trovate = [];
  for (const f of file(SRC)) {
    const testo = readFileSync(f, 'utf8');
    /* una frase ha almeno uno spazio: gli elenchi di codici (`'TOO_LARGE', 'BAD_MESSAGE'`) non sono frasi */
    for (const forma of FORME) for (const m of testo.matchAll(forma)) if (m[2].includes(' ')) trovate.push([f.slice(SRC.length), m[2].replaceAll('${BYTE_MASSIMI}', String(BYTE_MASSIMI))]);
  }
  assert.ok(trovate.length >= 4, `controllo positivo: le frasi si trovano (${trovate.length})`);
  const diverse = trovate.filter(([, frase]) => frase !== MESSAGE_BY_CODE.TOO_LARGE);
  assert.deepEqual(diverse, [], `frasi diverse da «${MESSAGE_BY_CODE.TOO_LARGE}»`);
});
