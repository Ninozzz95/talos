/*
 * COD-205 (1) e COD-220 dello stress del telefono 0.1.47 (Mobile 30/10/2026): un agente fermato risultava «Failed». Il registro
 * dice «fermata» solo se il giro finisce con RunError code 'fermato' (`motivoChiusuraDaEventi`, session-registry.mjs); ogni altro
 * codice diventa 'errore' ⇒ «fallita». Questa prova ferma un giro VERO del nucleo in tre momenti e guarda il codice finale:
 *   (a) mentre aspetta il permesso della persona;
 *   (b) prima della prima risposta del modello (la richiesta è appesa, come un motore locale col posto occupato);
 *   (c) dentro un attrezzo (un comando che dura).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fineQuandoFermata = (signal) => new Promise((_, ko) => {
  const via = () => ko(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
});
/* a flusso, come la rete vera: il nucleo chiede stream:true (forma presa da bc76-figlie-di-madre-locale.test.mjs) */
const risposta = (frames) => new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n',
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const chiamaShell = (comando) => [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }];

async function fermaIlGiro(t, { fetchDiRete, permessiPerAttrezzo = {}, chiediApprovazioneFn = async () => true, quando }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-stop3-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const ferma = new AbortController();
  const giro = avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', segnaleStop: ferma.signal,
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: (input) => talosLavora({ ...input, fetchDiRete, permessiPerAttrezzo, chiediApprovazioneFn }) });
  await quando(eventi);
  ferma.abort();
  await giro;
  return eventi.filter((e) => e.type === 'RunError' || e.type === 'RunFinished').at(-1);
}
const aspettaChe = async (prova, ms = 5_000) => {
  const fine = Date.now() + ms;
  while (!prova()) { if (Date.now() > fine) throw new Error('premessa non raggiunta'); await new Promise((r) => setTimeout(r, 10)); }
};

test('STOP-3-a: fermato mentre aspetta il permesso ⇒ RunError «fermato»', async (t) => {
  let chiesto = false;
  const finale = await fermaIlGiro(t, {
    fetchDiRete: async () => risposta(chiamaShell('echo ciao')),
    permessiPerAttrezzo: { shell: 'chiedi' },
    chiediApprovazioneFn: () => { chiesto = true; return new Promise(() => {}); },
    quando: () => aspettaChe(() => chiesto),
  });
  assert.equal(finale?.type, 'RunError');
  assert.equal(finale?.code, 'fermato', JSON.stringify(finale));
});

test('STOP-3-b: fermato prima della prima risposta del modello (richiesta appesa) ⇒ RunError «fermato»', async (t) => {
  let partita = false;
  const finale = await fermaIlGiro(t, {
    fetchDiRete: (url, init) => { partita = true; return fineQuandoFermata(init?.signal); },
    quando: () => aspettaChe(() => partita),
  });
  assert.equal(finale?.type, 'RunError');
  assert.equal(finale?.code, 'fermato', JSON.stringify(finale));
});

test('STOP-3-c: fermato dentro un attrezzo che dura ⇒ RunError «fermato»', async (t) => {
  let iniziato = false;
  const finale = await fermaIlGiro(t, {
    fetchDiRete: async () => risposta(chiamaShell('node -e "setTimeout(()=>{},20000)"')),
    permessiPerAttrezzo: { shell: 'sempre' },
    quando: (eventi) => aspettaChe(() => (iniziato ||= eventi.some((e) => e.type === 'ToolCallStart' || e.type === 'ToolCallArgs'))),
  });
  assert.equal(finale?.type, 'RunError');
  assert.equal(finale?.code, 'fermato', JSON.stringify(finale));
});
