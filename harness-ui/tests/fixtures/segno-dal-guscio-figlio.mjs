/*
 * Il «server» finto della prova `computer-use-segno-dal-guscio.test.mjs`: parte come il server vero dietro `desktop/child-bootstrap.mjs` (precaricato con
 * `--import`), e a ogni `{ tipo: 'leggi' }` del guscio prova ad avviare l'aiutante del computer use con l'ambiente del processo, com'è in quel momento
 * (`aiutantePerMacchina` non passa `ambiente`: vale `process.env`). L'avvio è finto e non crea nessun processo: si guardano solo gli argomenti scelti.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { creaAiutanteMcp } from '../../src/computer-use/aiutante-mcp.mjs';

const exe = fileURLToPath(import.meta.url);
const improntaAttesa = createHash('sha256').update(readFileSync(exe)).digest('hex');
let argomenti = null;
const aiutante = creaAiutanteMcp({ exe, improntaAttesa, avvia: (_exe, args) => { argomenti = args; throw new Error('nessun processo nella prova'); } });

process.on('message', async (messaggio) => {
  if (messaggio?.tipo !== 'leggi') return;
  argomenti = null;
  const esito = await aiutante.apri();
  process.send({ tipo: 'letto', argomenti, esito });
});
process.send({ tipo: 'pronto' });
