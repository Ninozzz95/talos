import assert from 'node:assert/strict';
import test from 'node:test';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { motivoPerIlTelefono } from '../src/remoto/servizio.mjs';

/*
 * D-RM4-5 (Mobile, 20/10/2026): il telefono mostrava solo «Configurazione non valida» perché la risposta d'errore del remoto portava
 * solo code e message; la finestra del PC sceglie la frase dal MOTIVO (`reason`, `params`). Ora viaggiano, ripuliti.
 */
const appCheRifiuta = (busta, stato = 400) => (_req, res) => {
  res.statusCode = stato;
  res.setHeader?.('content-type', 'application/json');
  res.end(JSON.stringify(busta));
};

test('RMOT-01 la chiamata interna porta il motivo e i parametri della busta; senza, l\'errore resta com\'era', async () => {
  const chiama = creaChiamataInterna({ httpApp: appCheRifiuta({ ok: false, error: { code: 'CONFIG_INVALID', message: 'Invalid configuration',
    reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } } }), porta: 4999 });
  await assert.rejects(chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: {} }),
    (e) => e.code === 'CONFIG_INVALID' && e.reason === 'provider-key-missing-named' && e.params.provider === 'OpenRouter');
  const senza = creaChiamataInterna({ httpApp: appCheRifiuta({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } }, 404), porta: 4999 });
  await assert.rejects(senza({ metodo: 'GET', percorso: '/api/v1/sessions' }), (e) => e.code === 'NOT_FOUND' && !('reason' in e) && !('params' in e));
});

test('RMOT-02 al telefono passa un motivo corto e parametri semplici, coi percorsi oscurati; il resto no', () => {
  assert.deepEqual(motivoPerIlTelefono({ reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } }),
    { reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } });
  const pulito = motivoPerIlTelefono({ reason: 'folder-missing', params: {
    cartella: 'C:\\Users\\Mario\\progetti\\app', lungo: 'x'.repeat(500), n: 3, si: true,
    oggetto: { a: 1 }, lista: [1], 'chiave strana': 'v', nan: Number.NaN } });
  assert.deepEqual(pulito, { reason: 'folder-missing', params: { cartella: '…/app', lungo: 'x'.repeat(200), n: 3, si: true } });
  // al contrario: un motivo che non è un identificatore non passa, e con lui nemmeno i parametri
  assert.deepEqual(motivoPerIlTelefono({ reason: 'C:\\Users\\Mario oops', params: { a: 'b' } }), {});
  assert.deepEqual(motivoPerIlTelefono({ reason: 42 }), {});
  assert.deepEqual(motivoPerIlTelefono({}), {});
  assert.deepEqual(motivoPerIlTelefono({ reason: 'solo-motivo' }), { reason: 'solo-motivo' });
});
