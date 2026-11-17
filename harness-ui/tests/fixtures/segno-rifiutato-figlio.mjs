/*
 * Il «server» finto di SEGNO-SRV-07 (`computer-use-segno-dal-guscio.test.mjs`): parte dietro `desktop/child-bootstrap.mjs` (precaricato con `--import`) come il server
 * vero, e usa l'aiutante della macchina (`aiutantePerMacchina`, che legge `process.env`) con un processo in memoria: nessun processo vero, nessuno schermo.
 * Al guscio risponde: `apri` (apre e comincia un compito), `stato` (vivo e argomenti di ogni avvio), `chiama` (una chiamata dell'attrezzo, il passo dopo);
 * `chiudi-aiutante` lo spegne come a riposo (giro 5, SEGNO-SRV-10: il server dice `segno-aiutante` al guscio da solo).
 */
import { aiutantePerMacchina } from '../../src/computer-use/aiutante-mcp.mjs';
import { createHash } from 'node:crypto';
import { processoAiutanteInMemoria } from './processo-aiutante-in-memoria.mjs';

const BYTE = Buffer.from('aiutante finto del filo intero');
const avvii = [];
const aiutante = aiutantePerMacchina({ exe: 'C:/finto/filo/cua-driver.exe', improntaAttesa: createHash('sha256').update(BYTE).digest('hex'), leggi: async () => BYTE,
  avvia: (_exe, args) => { avvii.push(args); return processoAiutanteInMemoria(); }, registro: () => {} });

process.on('message', async (messaggio) => {
  if (messaggio?.tipo === 'apri') { const esito = await aiutante.apri(); aiutante.compito(); process.send({ tipo: 'aperto', esito, avvii }); }
  if (messaggio?.tipo === 'stato') process.send({ tipo: 'stato', vivo: aiutante.stato().vivo, avvii });
  if (messaggio?.tipo === 'chiama') { const r = await aiutante.chiama('list_windows', {}); process.send({ tipo: 'chiamato', ok: r.ok, avvii }); }
  if (messaggio?.tipo === 'chiudi-aiutante') aiutante.chiudi(); // giro 5 (SEGNO-SRV-10): l'aiutante si spegne a riposo
});
process.send({ tipo: 'pronto' });
