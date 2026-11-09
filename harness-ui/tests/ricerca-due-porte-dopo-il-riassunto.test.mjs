import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { MARCATORE_RIASSUNTO, VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

/*
 * Ricerca a due porte, condizione di Performance (01/11/2026): con `research_start` davanti la lista degli attrezzi resta IDENTICA byte
 *   per byte anche DOPO un riassunto (la cache del prefisso regge). Il banco della compattazione di `compattazione-istantanea.test.mjs`
 *   (fornitore finto, tetto basso, letture da ~1.000 token), ridotto a ciò che serve qui; adattatore del desktop, come il 4174.
 */
const eRiassunto = (body) => { const u = String(body.messages.at(-1)?.content ?? ''); return u.includes('CONTEXT COMPACTION') || u.includes('summarize your progress'); };
const testoDi = (m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((p) => p?.text ?? '').join('') : '');

for (const ricercaDavanti of [true, false]) {
  test(`RDP-R01: ${ricercaDavanti ? 'accesa' : 'spenta'} — gli attrezzi delle richieste di lavoro sono identici prima e dopo il riassunto`, async (t) => {
    const prima = process.env[VARIABILE_TETTO_TOKEN];
    process.env[VARIABILE_TETTO_TOKEN] = '12000';
    t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
    const cartella = mkdtempSync(join(tmpdir(), 'rdp-riassunto-'));
    writeFileSync(join(cartella, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
    t.after(() => rimuoviCartellaDiProva(cartella));
    const corpi = [];
    let lavoro = 0;
    const fetchDiRete = async (_url, init) => {
      const body = corpoSenzaMarcatori(init.body);
      corpi.push(body);
      const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
      if (eRiassunto(body)) return Response.json({ choices: [{ message: { role: 'assistant', content: 'RIASSUNTO: ho letto grande.txt più volte.' }, finish_reason: 'stop' }], usage });
      lavoro += 1;
      if (lavoro <= 14) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
    };
    const eventi = [];
    await talosLavora({
      cartella, task: { consegna: 'Leggi grande.txt più volte e riferisci.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
      contestoDelProgetto: `PREAMBOLO ${'x'.repeat(12_000)}`, comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e),
      livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => true, strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI], attrezziDifferiti: true,
      ricercaDavanti, onRicercaAvvia: async () => ({ ok: true, esito: 'started' }),
    });
    const lavori = corpi.filter((b) => !eRiassunto(b));
    const dopo = lavori.findIndex((b) => b.messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)));
    assert.ok(dopo > 0, `premessa: una richiesta di lavoro dopo il riassunto (compattazioni: ${eventi.filter((e) => e.tipo === 'compattazione-fine').length})`);
    const forma = JSON.stringify(lavori[0].tools);
    assert.equal(lavori[0].tools.some((a) => a.function.name === 'research_start'), ricercaDavanti);
    for (const [i, b] of lavori.entries()) assert.equal(JSON.stringify(b.tools), forma, `richiesta ${i + 1} di ${lavori.length} (riassunto prima della ${dopo + 1})`);
    /* In questo percorso (riassunto bloccante dentro il giro) la richiesta del riassunto parte con `tools: []`, accesa o spenta allo stesso
       modo (sonda del 01/11/2026: [0, 0] nei due casi): si fissa così, e l'opzione non la tocca. */
    assert.ok(corpi.filter(eRiassunto).length >= 1);
    for (const b of corpi.filter(eRiassunto)) assert.equal(JSON.stringify(b.tools ?? []), '[]', 'il riassunto: nessun attrezzo, come prima');
  });
}
