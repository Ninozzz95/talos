import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * RA-03 della revisione del Mobile (20/10/2026 notte, ALTA) — dal telefono una sessione nuova si apre solo in una cartella ammessa
 * (`cartellaId`, da `projects.list`): `cartellaLibera` (qualunque percorso del PC) e `workspaceLaunchId` restano del PC. Due cancelli:
 * l'operazione del telefono e la rotta per l'origine remota. Ogni prova ha il suo verso contrario: dal PC la stessa richiesta passa.
 */
function banco() {
  const avviate = [];
  const sessionRegistry = { elenca: () => [], esiste: () => false, avviaLibero: (richiesta) => { avviate.push(richiesta); return { sessionId: `s${avviate.length}` }; } };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  return { operazioni, contesto, chiama, avviate };
}
const LANCIO = 'a'.repeat(32);

test('RA03-01 session.start dal telefono: cartellaLibera e workspaceLaunchId rifiutati NOT_ALLOWED_REMOTELY, niente avviato', async () => {
  const b = banco();
  for (const corpo of [{ cartellaLibera: '/etc', consegna: 'x' }, { workspaceLaunchId: LANCIO, consegna: 'x' },
    { cartellaLibera: undefined, workspaceLaunchId: LANCIO, consegna: 'x' }]) {
    await assert.rejects(b.operazioni.esegui('session.start', { corpo }, b.contesto), { code: 'NOT_ALLOWED_REMOTELY' }, JSON.stringify(corpo));
  }
  assert.equal(b.avviate.length, 0);
  // AL CONTRARIO: con una cartella ammessa si arriva al registro
  const r = await b.operazioni.esegui('session.start', { corpo: { cartellaId: 'progetto-1', consegna: 'ciao' } }, b.contesto);
  assert.deepEqual(r, { sessionId: 's1' });
  assert.equal(b.avviate[0].cartellaId, 'progetto-1');
});

test('RA03-02 il cancello vero è la rotta: con l\'origine remota cartellaLibera è 403 NOT_ALLOWED_REMOTELY anche saltando l\'operazione', async () => {
  const b = banco();
  const origineRemota = { tipo: 'telefono', nome: 'Pad' };
  for (const corpo of [{ cartellaLibera: '/home/mario', consegna: 'x' }, { workspaceLaunchId: LANCIO, consegna: 'x' }]) {
    await assert.rejects(b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo, origine: 'telefono:d', origineRemota }),
      (e) => e.code === 'NOT_ALLOWED_REMOTELY' && e.stato === 403, JSON.stringify(corpo));
  }
  assert.equal(b.avviate.length, 0);
  // AL CONTRARIO: la stessa richiesta dal PC (senza origine remota) arriva al registro
  const { dati } = await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { cartellaLibera: '/home/mario', consegna: 'x' }, origine: 'pc' });
  assert.deepEqual(dati, { sessionId: 's1' });
  assert.equal(b.avviate[0].cartellaLibera, '/home/mario');
});

test('RA03-03 il primo cancello da solo: l\'operazione rifiuta PRIMA di chiamare la rotta (un server che accetterebbe tutto non viene chiamato)', async () => {
  const chiamate = [];
  const chiama = async (richiesta) => { chiamate.push(richiesta); return { stato: 200, dati: { sessionId: 'x' } }; };
  const operazioni = creaOperazioni({ chiama, sessionRegistry: { elenca: () => [], esiste: () => false }, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  // revisione del 21/10 (S4): anche dal primo cancello lo stato 403, che il servizio porta al telefono (RA-04)
  await assert.rejects(operazioni.esegui('session.start', { corpo: { cartellaLibera: '/etc', consegna: 'x' } }, contesto), { code: 'NOT_ALLOWED_REMOTELY', stato: 403 });
  await assert.rejects(operazioni.esegui('session.start', { corpo: { workspaceLaunchId: LANCIO, consegna: 'x' } }, contesto), { code: 'NOT_ALLOWED_REMOTELY', stato: 403 });
  assert.equal(chiamate.length, 0, '⛔ la rotta è stata chiamata');
  // AL CONTRARIO: con una cartella ammessa la chiamata parte, col corpo intatto
  await operazioni.esegui('session.start', { corpo: { cartellaId: 'p1', consegna: 'x' } }, contesto);
  assert.deepEqual(chiamate.map((c) => c.corpo), [{ cartellaId: 'p1', consegna: 'x' }]);
});
