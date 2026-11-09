import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import * as RICERCA from '../src/ricerca-due-porte.mjs';
const { chiamataInizialeDi, requireRicercaDelMessaggio } = RICERCA;
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⭐ RICERCA APPROFONDITA A DUE PORTE — il server (forma `FORMA-RICERCA-DUE-PORTE-2026-11-01.md`, OK di Mobile, CLI e Performance):
 *   il campo `ricerca: {profondita}` su `/sessions/custom` («New research» della sezione), il registro che lo porta UNA volta come
 *   `chiamataIniziale`, l'opzione `ricercaDavanti` dell'ospite e agent-service che le inoltra.
 * ⛔ Owner 01/11/2026 sera: «niente pillola ricerca approfondita nel composer, solo sezione o richiesta al modello» ⇒ `/resume` NON accetta
 *   più `ricerca` e la capacità `ricerca-due-porte` non c'è (il Mobile, 01/11: non li ha mai usati). Le prove qui sotto lo fissano.
 */

const NON_VALIDE = [
  [{ profondita: 'infinita' }, 'Una domanda'],
  [{ profondita: 'deep', altro: 1 }, 'Una domanda'],
  [{}, 'Una domanda'],
  [[], 'Una domanda'],
  ['deep', 'Una domanda'],
  [null, 'Una domanda'],
  [{ profondita: 'deep' }, '   '],
  [{ profondita: 'deep' }, 'x'.repeat(501)],
];

test('RDP-S01: la forma — tre profondità, domanda 1-500 dal messaggio, ogni altra cosa è QUERY_INVALID; assente = nessuna ricerca', () => {
  assert.equal(requireRicercaDelMessaggio(undefined, 'qualunque'), null);
  assert.deepEqual(requireRicercaDelMessaggio({ profondita: 'quick' }, '  Compare two engines  '), { question: 'Compare two engines', depth: 'quick' });
  assert.equal(requireRicercaDelMessaggio({ profondita: 'exhaustive' }, 'x'.repeat(500)).question.length, 500, 'al bordo: 500 passa');
  for (const [ricerca, testo] of NON_VALIDE) {
    assert.throws(() => requireRicercaDelMessaggio(ricerca, testo), (e) => e.code === 'QUERY_INVALID', JSON.stringify([ricerca, String(testo).slice(0, 20)]));
  }
  assert.deepEqual(chiamataInizialeDi({ question: 'q', depth: 'deep' }), { nome: 'research_start', argomenti: { question: 'q', depth: 'deep' } });
  assert.equal(chiamataInizialeDi(null), null);
});

async function ascolta(t, sessionRegistry) {
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, riconosciLinguaScritta: false }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  return `http://127.0.0.1:${server.address().port}`;
}
const posta = (base, percorso, corpo) => fetch(`${base}${percorso}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

test('RDP-S02 (owner 01/11 sera): POST /resume NON accetta `ricerca` — 400 QUERY_INVALID e nessuna ripresa; AL CONTRARIO senza campo parte', async (t) => {
  const chiamate = [];
  const base = await ascolta(t, { resume: (id, testo, immagini, opzioni) => { chiamate.push({ id, testo, opzioni }); return { sessionId: id }; } });
  const conRicerca = await posta(base, '/api/v1/sessions/s-1/resume', { messaggio: 'Compare two engines', ricerca: { profondita: 'deep' } });
  assert.equal(conRicerca.status, 400);
  assert.equal((await conRicerca.json()).error.code, 'QUERY_INVALID');
  assert.equal(chiamate.length, 0, 'nessuna ripresa partita');
  const normale = await posta(base, '/api/v1/sessions/s-1/resume', { messaggio: 'normale' });
  assert.equal(normale.status, 200);
  assert.equal(chiamate.length, 1);
  assert.ok(!('ricerca' in chiamate[0].opzioni), 'le opzioni di sempre');
});

test('RDP-S03: POST /sessions/custom porta `ricerca` ad avviaLibero; con `ferma` è 400; AL CONTRARIO senza campo niente cambia', async (t) => {
  const avvii = [];
  const base = await ascolta(t, { avviaLibero: (richiesta) => { avvii.push(richiesta); return { sessionId: `s-${avvii.length}` }; } });
  const cartella = mkdtempSync(join(tmpdir(), 'rdp-custom-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const ok = await posta(base, '/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'Compare two engines', ricerca: { profondita: 'exhaustive' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(avvii[0].ricerca, { question: 'Compare two engines', depth: 'exhaustive' });
  const ferma = await posta(base, '/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'x', ferma: true, ricerca: { profondita: 'deep' } });
  assert.equal(ferma.status, 400);
  const storta = await posta(base, '/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'x', ricerca: { profondita: 'tanta' } });
  assert.equal(storta.status, 400);
  await posta(base, '/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'normale' });
  assert.equal(avvii.length, 2);
  assert.ok(!('ricerca' in avvii[1]));
});

function registroDiProva(t, opzioni = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'rdp-registro-'));
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({
      input,
      concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); },
      /* decisione 198: un giro fermato dalla persona, l'unico (con errore e interruzione) che la ripresa SENZA testo riprende */
      ferma(storia) { input.onEvento({ type: 'RunError', code: 'fermato', message: 'stopped' }); risolvi({ ok: false, esito: { comeFinita: 'fermato', messaggiFinali: storia, recordDiCompattazione: [] } }); },
      /* il motore locale cade: prima del kernel (niente primo passo) o dopo il primo passo della persona (la sua ToolCallStart è partita),
         come agent-service quando il motore non risponde: `{ok:false, esito:null}` (revisione S3-1) */
      cade({ dopoIlPrimoPasso = false } = {}) {
        if (dopoIlPrimoPasso) input.onEvento({ type: 'ToolCallStart', toolCallId: 'persona-0123456789ab', toolCallName: 'research_start' });
        input.onEvento({ type: 'RunError', code: 'RUNTIME_UNREACHABLE', message: 'motore locale caduto' });
        risolvi({ ok: false, esito: null, erroreInterno: 'motore locale caduto', codiceErrore: 'RUNTIME_UNREACHABLE' });
      },
    });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  let ms = Date.parse('2026-11-01T10:00:00.000Z');
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', clock: () => new Date(ms += 1000), ...opzioni });
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, giri, cartellaStore };
}
const attesa = (ms = 30) => new Promise((ok) => setTimeout(ok, ms));
const STORIA = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];

test("RDP-S04: il registro porta la ricerca della sezione UNA volta, al primo giro; nessuna ripresa la porta; ricercaDavanti è dell'ospite", async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t, { ricercaDavanti: true });
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Compare two engines', ricerca: { question: 'Compare two engines', depth: 'quick' } });
  assert.deepEqual(giri[0].input.chiamataIniziale, { nome: 'research_start', argomenti: { question: 'Compare two engines', depth: 'quick' } });
  assert.equal(giri[0].input.ricercaDavanti, true);
  giri[0].ferma(STORIA); // decisione 198: la ripresa senza testo vale dopo un giro che non è finito (qui fermato), non dopo una risposta finita
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  const senzaTesto = registro.resume(sessionId); // una ripresa senza testo (il ▶ dopo uno Stop)
  assert.ok(giri[1], `premessa: la ripresa senza testo parte (${JSON.stringify(senzaTesto)})`);
  assert.ok(!('chiamataIniziale' in giri[1].input), 'una ripresa senza testo non la rifà');
  giri[1].concludi(STORIA);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  registro.resume(sessionId, 'thanks', [], { ricerca: { question: 'thanks', depth: 'deep' } }); // anche un chiamante che la passasse ancora
  assert.ok(!('chiamataIniziale' in giri[2].input), 'il messaggio dopo è un messaggio normale');
  giri[2].concludi(STORIA);
  // AL CONTRARIO: chi importa il registro senza l'opzione non la passa
  const altro = registroDiProva(t);
  altro.registro.avviaLibero({ cartellaLibera: altro.cartellaStore, consegna: 'x' });
  assert.ok(!('ricercaDavanti' in altro.giri[0].input));
  assert.ok(!('chiamataIniziale' in altro.giri[0].input));
});

test('RDP-S05: agent-service inoltra al kernel `ricercaDavanti` e `chiamataIniziale`; AL CONTRARIO assenti non li manda', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'rdp-filo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const visto = async (extra) => {
    let input;
    await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', onEvento: () => {}, ...extra,
      talosLavoraFn: async (i) => { input = i; return { comeFinita: 'concluso', detto: 'fatto' }; } });
    return input;
  };
  const chiamata = { nome: 'research_start', argomenti: { question: 'q', depth: 'deep' } };
  const con = await visto({ ricercaDavanti: true, chiamataIniziale: chiamata });
  assert.equal(con.ricercaDavanti, true);
  assert.deepEqual(con.chiamataIniziale, chiamata);
  const senza = await visto({});
  assert.ok(!('ricercaDavanti' in senza) && !('chiamataIniziale' in senza));
});

test("RDP-S06: il desktop accende `research_start` davanti (server.mjs); la capacità `ricerca-due-porte` per il telefono non c'è più (owner 01/11 sera, OK del Mobile)", () => {
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /ricercaDavanti: true,/u, 'il desktop accende `research_start` davanti');
  assert.doesNotMatch(sorgente, /CAPACITA_DEL_DESKTOP|'ricerca-due-porte'/u, 'nessuna capacità dichiarata per la ricerca');
  assert.ok(!('CAPACITA_DEL_DESKTOP' in RICERCA) && !('CAPACITA_RICERCA_DUE_PORTE' in RICERCA));
});

/* Revisione avversaria del 01/11/2026, S2-1 (prova portata dal revisore, `rev-rdp/rev-registro.test.mjs`): la ricerca di un messaggio
   RIFIUTATO non resta sulla conversazione per il giro senza testo dopo. Dopo la decisione dell'owner (niente pillola) la ripresa non porta
   più nessuna ricerca, e la prova resta come guardia: la ricerca è un parametro di UN avvio, mai uno stato della voce. */
test('REV-RDP-1: una ripresa CON la pillola rifiutata (chiave mancante) non lascia la ricerca al giro senza testo dopo', async (t) => {
  let pronto = true;
  const { registro, giri, cartellaStore } = registroDiProva(t, {
    ricercaDavanti: true,
    prontoFn: () => (pronto ? { pronto: true } : { pronto: false, codice: 'CONFIG_INVALID', fornitore: 'OpenRouter', motivo: 'provider-key-missing-named' }),
  });
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'ciao' });
  giri[0].ferma(STORIA); // decisione 198: la ripresa senza testo vale dopo un giro che non è finito (qui fermato), non dopo una risposta finita
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  pronto = false;
  const rifiutata = registro.resume(sessionId, 'Compare two engines', [], { ricerca: { question: 'Compare two engines', depth: 'exhaustive' } });
  assert.ok(rifiutata.code || rifiutata.erroreAvvio, `premessa: la ripresa è rifiutata (${JSON.stringify(rifiutata)})`);
  assert.equal(giri.length, 1, 'premessa: nessun giro partito');
  pronto = true;
  registro.resume(sessionId); // la ripresa senza testo di sempre (corpo vuoto su /resume)
  assert.equal(giri.length, 2, 'premessa: la ripresa senza testo parte');
  assert.ok(!('chiamataIniziale' in giri[1].input), `la ricerca del messaggio rifiutato non deve partire: ${JSON.stringify(giri[1].input.chiamataIniziale)}`);
  giri[1].concludi(STORIA);
});

/* Revisione S3-1, dopo la decisione dell'owner: la ricerca nasce SOLO da `avviaLibero`, che non apre mai una sessione `provider:'local'`
   (`session-registry.mjs`: `providerEffettivo = voceEsistente?.provider ?? provider`, e `avviaLibero` non passa `provider`), quindi il
   ripiego locale→cloud non la vede mai. Le due prove fissano i due fatti su cui poggia: una ricerca della sezione che cade NON riparte da
   sola, e una sessione locale col ripiego non porta mai una ricerca, né nel giro locale né in quello di ripiego. */
test('REV-RDP-S31a: una ricerca della sezione il cui giro cade non riparte da sola (nessun ripiego, nessun secondo giro)', async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t, { ricercaDavanti: true });
  registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Compare two engines', ricerca: { question: 'Compare two engines', depth: 'deep' } });
  assert.ok(giri[0].input.chiamataIniziale, 'premessa: il primo giro porta la ricerca');
  giri[0].cade();
  await attesa(60);
  assert.equal(giri.length, 1, `nessun secondo giro: ${giri.length}`);
});

test('REV-RDP-S31b: una sessione locale col ripiego sul cloud non porta mai una ricerca (giro locale e ripiego)', async (t) => {
  const runtime = { detect: async () => ({ state: 'observed' }), load: async () => {}, async *generateStream() { yield { type: 'done' }; } };
  const { registro, giri, cartellaStore } = registroDiProva(t, { ricercaDavanti: true, localRuntimes: { 'llama.cpp': runtime }, modello: 'vendor/modello-di-serie', chiave: 'chiave-cloud' });
  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'llama.cpp', modelId: 'un-gguf.gguf', fallbackConsent: true });
  giri[0].concludi(STORIA);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  registro.resume(sessionId, 'Compare two engines', [], { ricerca: { question: 'Compare two engines', depth: 'deep' } });
  assert.ok(!giri[1].input.chiamataIniziale, 'il giro locale non la porta');
  giri[1].cade();
  await attesa(60);
  assert.equal(giri.length, 3, 'premessa: il ripiego sul cloud è partito');
  assert.ok(!giri[2].input.chiamataIniziale, 'e il ripiego nemmeno');
  giri[2].concludi(STORIA);
});
