/*
 * 13/10/2026 (bugfixer, lotto 3, SECONDA PASSATA) — `e511b2dde`: la storia segue l'agente, non il posto del nodo.
 * Attacco (a) del coordinatore: un cambio di struttura DURANTE una lettura della storia già in volo. Dalla sorgente vera
 * (`creaFonte`) e dal client vero delle deleghe. `[REGGE]` / `[DIFETTO]` come nelle altre prove di revisione.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFonte } from '../../src/components/grafo/fonte.js';
import { creaClientDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });
const finita = (id, nascita, fine, extra = {}) => figlia(id, nascita, { conclusa: true, conclusaAlle: at(fine), esitoDelega: 'concluso', ...extra });
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: 'madre', seq, at: at(secondi), coverage: 'complete', event, node });
const cancello = () => { let apri; const attesa = new Promise((r) => { apri = r; }); return { attesa, apri }; };

function scena() {
  const a = finita('a', 60, 420); const b = finita('b', 70, 200);
  const record = [registrato(1, 0, { ...madre }, 'created'), registrato(2, 60, { ...figlia('a', 60) }, 'created'), registrato(3, 70, { ...figlia('b', 70) }, 'created'), registrato(4, 200, { ...b }), registrato(5, 420, { ...a })];
  const stato = { fermo: null, letture: 0 };
  const leggiCronologia = async ({ after = 0, through = record.length } = {}) => {
    stato.letture += 1;
    if (stato.fermo) await stato.fermo.attesa;
    const items = record.filter((r) => r.seq > after && r.seq <= through);
    return { schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage: 'complete', persisted: true, through, next: null, items };
  };
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [a, b] }), leggiCronologia });
  return { client, stato };
}
const campataDi = (fonte) => (id) => { const t = fonte.tentativi().get(id)?.at(-1); return t ? [t.da - T0, t.a === null ? null : t.a - T0] : null; };
const DI_A = [60_000, 420_000]; const DI_B = [70_000, 200_000];

/* ⚠️ ADATTATA dal coordinatore il 13/10/2026 sera (la prova è del revisore; l'attacco è intatto). La cura di SECONDA-POSIZIONE-03
   ha legato gli id dei nodi alla SESSIONE: la premessa «b ha preso l'id di a» non può più avverarsi, e con lei l'esito «b mostra i
   tentativi di a». Il difetto della sorgente però c'era lo stesso (una lettura partita sotto la struttura di prima, e applicata
   dopo): l'esito ora non dipende dagli id — la storia TENUTA è quella che si legge riaprendo il diagramma nello stesso momento. */
test('SECONDA-STORIA-01 [DIFETTO] — la struttura cambia mentre una lettura della storia è in volo: finita QUELLA lettura, la storia tenuta è quella della struttura di ADESSO (e «b» non ha i tentativi di «a»)', async () => {
  const { client, stato } = scena();
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  const campata = campataDi(fonte);
  await fonte.caricaPanoramica();
  assert.equal(await fonte.aggiornaStoria(), true);
  const idA = await client.nodoDellaSessione('a');
  assert.deepEqual(campata(idA), DI_A, 'il controllo positivo: prima del cambio «a» ha i suoi tentativi');
  // una rilettura della storia parte (il battito) e resta in volo: il registro tarda a rispondere
  stato.fermo = cancello();
  const inVolo = fonte.aggiornaStoria();
  // intanto la persona isola «b», che prende il posto (e l'id) di «a»; il diagramma rilegge la struttura e chiede la storia
  client.isola('b');
  await fonte.caricaPanoramica();
  const idB = await client.nodoDellaSessione('b');
  assert.notEqual(idB, idA, 'gli id seguono la sessione: «b» NON prende l’id di «a»');
  const dopoIlCambio = fonte.aggiornaStoria(); // ciò che fa il diagramma dopo aver riletto la struttura
  stato.fermo.apri(); stato.fermo = null;
  await Promise.all([inVolo, dopoIlCambio]);
  /* le due chiamate sono finite: il diagramma ridisegna con ciò che la sorgente ha ADESSO. Può non avere ancora la storia nuova
     (niente tentativi), ma non può dare a «b» quelli di «a». */
  assert.notDeepEqual(campata(idB), DI_A, '«b» mostra i tentativi di «a»');
  const corta = (voci) => voci.map((v) => `${v.scope === 'run' ? 'run' : v.nodeId}:${v.state}@${v.at}`);
  const riaperta = creaFonte({ client, sorgente: await client.sorgente() });
  await riaperta.caricaPanoramica(); await riaperta.aggiornaStoria();
  assert.deepEqual(corta(fonte.storia), corta(riaperta.storia), 'la storia tenuta dopo la lettura in volo è quella della struttura di prima, non quella che si legge riaprendo');
});

test('SECONDA-STORIA-02 [REGGE] — e alla rilettura dopo ognuno ha i suoi; due cambi di fila durante una lettura da capo finiscono giusti', async () => {
  const { client, stato } = scena();
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  const campata = campataDi(fonte);
  await fonte.caricaPanoramica(); await fonte.aggiornaStoria();
  const idA = await client.nodoDellaSessione('a');
  // due cambi di struttura mentre una lettura DA CAPO è in volo: isola b, poi mostra tutti
  client.isola('b'); await fonte.caricaPanoramica();
  stato.fermo = cancello();
  const inVolo = fonte.aggiornaStoria();
  client.mostraTutti(); await fonte.caricaPanoramica();
  stato.fermo.apri(); stato.fermo = null;
  await inVolo;
  await fonte.aggiornaStoria(); // la rilettura dopo (il battito successivo)
  assert.deepEqual(campata(await client.nodoDellaSessione('a')), DI_A);
  assert.deepEqual(campata(await client.nodoDellaSessione('b')), DI_B);
  assert.equal(await client.nodoDellaSessione('a'), idA);
  // e senza altri cambi non si rilegge più da capo: stessa versione
  const versione = fonte.versioneStoria;
  assert.equal(await fonte.aggiornaStoria(), false);
  assert.equal(fonte.versioneStoria, versione);
});
