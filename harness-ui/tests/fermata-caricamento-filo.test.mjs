/* 01/11/2026 (contratto di Desktop): `motoreInCaricamentoFn` lungo il filo. Il registro vero la porta al servizio dell'agente (che la passa
   al nucleo, `agent-service.mjs`); la frase del nucleo sta in `fermata-prima-dell-invio.test.mjs` (FERMATA-INVIO-07/08). */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as ms } from 'node:timers/promises';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';

for (const [nome, opzione, atteso] of [['given', () => true, 'function'], ['absent (the CLI)', undefined, 'undefined']]) {
  test(`FCF-1 the real registry hands motoreInCaricamentoFn to the agent service: ${nome}`, async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-fermata-filo-'));
    const ingressi = [];
    const fine = [];
    const registry = createSessionRegistry({ cartellaStore, modello: 'local:a', chiave: 'k', cartellaEsisteFn: () => true,
      ...(opzione ? { motoreInCaricamentoFn: opzione } : {}),
      avviaSessioneFn(input) { ingressi.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise((r) => fine.push(r)); },
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }) });
    t.after(async () => { for (const r of fine) r({}); await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }); } catch { /* goes anyway */ } rimuoviCartellaDiProva(cartellaStore); });
    registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', modello: 'local:a' });
    await ms(5);
    assert.equal(ingressi.length, 1);
    if (atteso === 'function') assert.equal(typeof ingressi[0].motoreInCaricamentoFn, 'function');
    else assert.equal(ingressi[0].motoreInCaricamentoFn ?? null, null, 'absent stays absent: the agent service passes it only when it is a function');
    if (opzione) assert.equal(ingressi[0].motoreInCaricamentoFn, opzione, 'the same function, no logic of its own');
  });
}
