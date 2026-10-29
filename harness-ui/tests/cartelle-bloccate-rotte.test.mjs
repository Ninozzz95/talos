/*
 * Owner 27/10/2026 — CARTELLE BLOCCATE, tappa B: le ROTTE dicono al registro quale dispositivo ha mandato il messaggio (contratto
 * CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, revisione 1). Il dispositivo viene SOLO dall'origine remota attaccata in processo
 * (`remoto/chiamata-interna.mjs`, un simbolo che non viaggia sulla rete): un campo del corpo non lo può dire. Dal PC: `null`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';

function banco() {
  const chiamate = [];
  const sessionRegistry = {
    elenca: () => [], esiste: () => true,
    avviaLibero: (richiesta) => { chiamate.push(['avviaLibero', richiesta.dispositivoDelGiro]); return { sessionId: 's-nuova' }; },
    resume: (sessionId, testo, immagini, opzioni) => { chiamate.push(['resume', opzioni?.dispositivoDelGiro]); return { sessionId }; },
    reindirizza: (sessionId, testo, opzioni) => { chiamate.push(['reindirizza', opzioni?.dispositivoDelGiro]); return { ok: true, redirectId: 'r' }; },
    accodaMessaggio: (sessionId, testo, immagini, opzioni) => { chiamate.push(['accodaMessaggio', opzioni?.dispositivoDelGiro]); return { ok: true, voci: [] }; },
  };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  return { chiama, chiamate };
}
const DAL_PAD = { origine: 'telefono:pad-1', origineRemota: { tipo: 'telefono', nome: 'Pad', dispositivoId: 'pad-1' } };

test('BLOC-H-01 resume, redirect e coda dal dispositivo portano il SUO id; dal PC portano null', async () => {
  for (const [percorso, nome] of [['/api/v1/sessions/s1/resume', 'resume'], ['/api/v1/sessions/s1/redirect', 'reindirizza'], ['/api/v1/sessions/s1/queue', 'accodaMessaggio']]) {
    const b = banco();
    await b.chiama({ metodo: 'POST', percorso, corpo: { messaggio: 'ciao' }, ...DAL_PAD }).catch((e) => assert.fail(`${percorso}: ${e.code} ${e.message}`));
    await b.chiama({ metodo: 'POST', percorso, corpo: { messaggio: 'ciao' }, origine: 'pc' }).catch((e) => assert.fail(`${percorso} dal PC: ${e.code} ${e.message}`));
    assert.deepEqual(b.chiamate, [[nome, 'pad-1'], [nome, null]], percorso);
  }
});

test('BLOC-H-02 una sessione aperta dal dispositivo nasce del dispositivo; dal PC senza', async () => {
  const b = banco();
  await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { cartellaId: 'p1', consegna: 'x' }, ...DAL_PAD });
  await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { cartellaId: 'p1', consegna: 'x' }, origine: 'pc' });
  assert.deepEqual(b.chiamate, [['avviaLibero', 'pad-1'], ['avviaLibero', undefined]]);
});

test('BLOC-H-03 un client non può dichiararsi dispositivo dal corpo: il campo nel corpo non arriva al registro', async () => {
  const b = banco();
  await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: { messaggio: 'ciao', dispositivoDelGiro: 'falso' }, origine: 'pc' }).catch(() => {});
  assert.notEqual(b.chiamate[0]?.[1], 'falso');
});
