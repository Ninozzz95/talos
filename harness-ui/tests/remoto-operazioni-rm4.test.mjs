import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { OPERAZIONI_HTTP, creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * R-M4 (20/10/2026, Mobile: la sessione del PC usata dal telefono) — le voci aggiunte all'elenco chiuso seguendo l'ELENCO-AZIONI §7:
 * ognuna va a UNA rotta fissa, l'id della sessione passa dal suo filtro, i fornitori arrivano RIDOTTI (mai indirizzo né pool di
 * chiavi), e ciò che §7 lascia «solo dal PC» resta fuori. Ogni prova ha il suo verso contrario.
 */
const ATTESE = {
  'session.children': ['GET', '/api/v1/sessions/s-1/children'],
  'session.pending': ['GET', '/api/v1/sessions/s-1/pending'],
  'session.metrics': ['GET', '/api/v1/sessions/s-1/metrics'],
  'session.processes': ['GET', '/api/v1/sessions/s-1/processes'],
  'session.hooks.list': ['GET', '/api/v1/sessions/s-1/hooks'],
  'session.compact': ['POST', '/api/v1/sessions/s-1/compact'],
  'doctor': ['GET', '/api/v1/doctor'],
  'projects.list': ['GET', '/api/v1/projects'],
  'models.list': ['GET', '/api/v1/models'],
  'providers.list': ['GET', '/api/v1/providers'],
};

function banco({ providerStore } = {}) {
  const sessionRegistry = {
    chiamate: [],
    elenca: () => [],
    esiste: (id) => id === 's-1' || id === 'figlia-1',
    iscriviti: (_id, asc, da) => { for (const e of [{ type: 'RunStarted', runId: 'r', _sequenza: 1 }]) if (e._sequenza > da) asc(e); return () => {}; },
    statoCoda: () => ({ voci: [], inPausa: false }),
  };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, providerStore });
  const chiamate = [];
  const chiamaVera = creaChiamataInterna({ httpApp, porta: 4999 });
  const chiama = (richiesta) => { chiamate.push(richiesta); return chiamaVera(richiesta); };
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
  const iscrizioni = new Map();
  const ricevuti = [];
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni, iscrivi: (sub, chiudi) => { iscrizioni.set(sub, chiudi); return async (data) => { ricevuti.push({ sub, data }); }; } };
  return { operazioni, contesto, chiamate, ricevuti, chiamaVera };
}

test('RM4-01 ogni voce nuova va alla SUA rotta col suo metodo, e l\'id passa dal filtro dell\'elenco', () => {
  for (const [nome, [metodo, percorso]] of Object.entries(ATTESE)) {
    const voce = OPERAZIONI_HTTP[nome];
    assert.ok(voce, nome);
    assert.equal(voce.metodo, metodo, nome);
    assert.equal(voce.percorso({ sessionId: 's-1' }), percorso, nome);
    if (percorso.includes('s-1')) assert.throws(() => voce.percorso({ sessionId: '../providers' }), { code: 'BAD_MESSAGE' }, nome);
  }
});

/* 24/10/2026: duplicare ed eliminare una sessione sono usciti da questo elenco — la parità remoto ↔ desktop dell'owner (23/10 sera, punto 2:
   «coda, salta/annulla riassunto, duplica, esporta, processi, deleghe, elimina sessione») supera §7 del 20/10; le prove sono in
   `remoto-operazioni-piccole.test.mjs`. «Esporta» resta fuori: va con lo scambio di file (R5.13), oltre il tetto di 1 MiB di un messaggio. */
test('RM4-02 al contrario: ciò che resta solo dal PC NON è nell\'elenco (export, terminali, albero, politica, cartelle)', async () => {
  const b = banco();
  for (const op of ['session.export', 'session.terminals', 'session.tree', 'session.compaction-policy',
    'workspace.browse', 'session.processes.stop', 'session.hooks.trust', 'providers.key', 'providers.runtime']) {
    await assert.rejects(b.operazioni.esegui(op, { sessionId: 's-1' }, b.contesto), { code: 'UNKNOWN_OPERATION' }, op);
  }
  assert.deepEqual(b.chiamate, [], 'nessuna arriva al gestore');
});

test('RM4-03 i fornitori arrivano RIDOTTI: niente indirizzo, niente pool, niente provenienza della chiave; il PC li ha', async () => {
  const pieno = [{
    id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, modelli: ['a'], modelliDiRiserva: [], supportsOAuth: false,
    execution: 'remote', endpoint: 'https://x.example/v1?token=SEGRETO', endpointConfigured: true, pool: [{ etichetta: 'chiave 1', ultime: 'abcd' }],
    esclusi: ['p'], keySource: 'keyring', timeoutSeconds: 120,
  }];
  const b = banco({ providerStore: { listPublic: () => pieno } });
  const ridotti = await b.operazioni.esegui('providers.list', {}, b.contesto);
  assert.deepEqual(ridotti, { items: [{ id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, modelli: ['a'], modelliDiRiserva: [], supportsOAuth: false, execution: 'remote' }] });
  assert.doesNotMatch(JSON.stringify(ridotti), /SEGRETO|abcd|endpoint|pool|keySource/u);
  // al contrario: la stessa risposta del PC, prima del filtro, porta tutto (il filtro toglie davvero qualcosa)
  const { dati: delPc } = await b.chiamaVera({ metodo: 'GET', percorso: '/api/v1/providers', origine: 'prova' });
  assert.match(JSON.stringify(delPc), /SEGRETO/u);
  assert.equal(b.chiamate.at(-1).percorso, '/api/v1/providers');
});

test('RM4-04 compact: il corpo passa dal validatore (non un oggetto ⇒ BAD_MESSAGE, nessuna chiamata)', async () => {
  const b = banco();
  await assert.rejects(b.operazioni.esegui('session.compact', { sessionId: 's-1', corpo: [1] }, b.contesto), { code: 'BAD_MESSAGE' });
  assert.deepEqual(b.chiamate, []);
});

test('RM4-05 una figlia (sessione del registro con padre) si segue con session.events come il padre', async () => {
  const b = banco();
  assert.deepEqual(await b.operazioni.esegui('session.events', { sessionId: 'figlia-1', after: 0, sub: 'figlia' }, b.contesto), { sub: 'figlia', after: 0 });
  assert.ok(b.ricevuti.some((r) => r.sub === 'figlia' && r.data.type === 'RunStarted'));
  await assert.rejects(b.operazioni.esegui('session.events', { sessionId: 'nessuna', after: 0, sub: 'x' }, b.contesto), { code: 'NOT_FOUND' });
});

test('RM4-06 (revisione A1) il Doctor al telefono: fornitori ridotti e nessun percorso assoluto; il Doctor del PC li ha tutti', async () => {
  const { diagnosi } = await import('../src/doctor.mjs');
  const righe = [{ id: 'custom', label: 'Il mio server', requiresKey: true, keyConfigured: true, endpoint: 'https://llm.example/v1?token=SEGRETO',
    pool: [{ etichetta: 'chiave 1', ultime: 'abcd' }], origineChiave: 'keyring', regione: 'eu', progetto: 'p1' }];
  const sessionRegistry = { elenca: () => [], esiste: () => false };
  const httpApp = createHttpApp({
    staticHandler: async () => null, sessionRegistry, providerStore: { listPublic: () => righe },
    diagnosiFn: async () => diagnosi({ chiaveConfigurata: true, providerRows: righe, providerStoreAvailable: true,
      cartelleProgetto: [{ id: 'p', nome: 'P', percorso: 'C:\\Users\\Mario\\Progetto' }],
      scratch: { percorso: 'C:\\Users\\Mario\\AppData\\Local\\TALOS\\scratch', esiste: true, voci: 0, byte: 0 },
      negozioSessioni: { modalitaIntestazione: 'link', cartella: '\\\\server\\condivisa\\Mario\\sessions' } }),
  });
  const chiamaVera = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama: chiamaVera, sessionRegistry, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  const alTelefono = await operazioni.esegui('doctor', {}, contesto);
  const testo = JSON.stringify(alTelefono);
  assert.doesNotMatch(testo, /SEGRETO|abcd|origineChiave|regione|"pool"|"endpoint"/u, 'niente indirizzo, pool o provenienza della chiave');
  assert.doesNotMatch(testo, /Mario/u, 'nessun nome dell\'utente del PC, in nessuna stringa');
  assert.match(testo, /…\/scratch/u, 'il nome finale resta: si capisce di che cosa si parla');
  assert.deepEqual(alTelefono.providers.items, [{ id: 'custom', label: 'Il mio server', requiresKey: true, keyConfigured: true }]);
  // al contrario: il Doctor del PC, prima del filtro, li ha davvero (il filtro toglie qualcosa)
  const { dati: delPc } = await chiamaVera({ metodo: 'GET', percorso: '/api/v1/doctor', origine: 'prova' });
  assert.match(JSON.stringify(delPc), /SEGRETO/u);
  assert.match(JSON.stringify(delPc), /Mario/u);
});

test('RM4-07 l\'oscuramento dei percorsi: Windows, UNC, POSIX di casa; il resto del testo e gli indirizzi web restano', async () => {
  const { senzaPercorsiAssoluti } = await import('../src/remoto/operazioni.mjs');
  assert.equal(senzaPercorsiAssoluti('Root: C:\\Users\\Mario\\AppData\\scratch.'), 'Root: …/scratch.');
  assert.equal(senzaPercorsiAssoluti('in D:/lavoro/Mario/p e poi'), 'in …/p e poi');
  assert.equal(senzaPercorsiAssoluti('\\\\srv\\share\\Mario\\x'), '…/x');
  assert.equal(senzaPercorsiAssoluti('/home/mario/.cache/talos'), '…/talos');
  assert.equal(senzaPercorsiAssoluti('/mnt/c/Users/Mario/Desktop'), '…/Desktop');
  assert.equal(senzaPercorsiAssoluti('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1', 'un indirizzo web non è un percorso');
  assert.equal(senzaPercorsiAssoluti('3 project folders available.'), '3 project folders available.');
  assert.deepEqual(senzaPercorsiAssoluti({ a: ['C:\\x\\y'], n: 3, b: true, c: null }), { a: ['…/y'], n: 3, b: true, c: null });
});
