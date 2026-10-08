import assert from 'node:assert/strict';
import test from 'node:test';

import {
  creaSubagentOrchestrator,
  LIMITE_FIGLI_CONCORRENTI,
  LIMITE_PROFONDITA_DELEGA,
} from '../src/subagent-orchestrator.mjs';
import { modelloDellaFigliaConDefault } from '../src/session-registry.mjs';

/*
 * ⭐ CLI, fase «sub-agenti asincroni», passo 7 (owner 01/10/2026): i due tetti della delega e il modello/sforzo di serie
 * della figlia diventano parametri FACOLTATIVI. Codex li espone in configurazione (`agents.max_concurrent_threads_per_
 * session`, `agents.max_depth`, `agents.default_subagent_model`, `agents.default_subagent_reasoning_effort`,
 * core/src/config/mod.rs:3845-3870). Gli intervalli li decide e li valida la CLI (1–32 figlie, profondità 1–4, solo dalla
 * configurazione della persona). ⛔ Vincolo del desktop: SENZA i parametri tutto resta byte per byte come oggi —
 * 10 figlie, profondità 2, gli stessi testi di rifiuto. Le prove sono nei due versi.
 */
function vocePadre({ profonditaDelega = 0, reasoning = null, modello = null } = {}) {
  return { cartella: '/padre', profonditaDelega, conclusa: false, padreId: null, modello, reasoning, permessi: null, permessiPerAttrezzo: null };
}
function conFigli(n, padre = vocePadre()) {
  const sessioni = new Map([['padre-1', padre]]);
  for (let i = 0; i < n; i += 1) sessioni.set(`figlio-${i}`, { cartella: `/f${i}`, padreId: 'padre-1', conclusa: false });
  return sessioni;
}
const mai = () => { throw new Error('avviaESeguiFn non doveva partire'); };

test('⛔ SENZA limiti: i tetti e i testi di rifiuto sono quelli di oggi, byte per byte', async () => {
  assert.equal(LIMITE_FIGLI_CONCORRENTI, 10);
  assert.equal(LIMITE_PROFONDITA_DELEGA, 2);
  const troppi = await creaSubagentOrchestrator({ sessioni: conFigli(10), cartellaEsisteFn: () => true, avviaESeguiFn: mai })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.deepEqual(troppi, { esito: 'rifiutato', motivo: 'limit of 10 concurrent children reached' });
  const profondo = await creaSubagentOrchestrator({ sessioni: new Map([['padre-1', vocePadre({ profonditaDelega: 2 })]]), cartellaEsisteFn: () => true, avviaESeguiFn: mai })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.deepEqual(profondo, { esito: 'rifiutato', motivo: 'maximum delegation depth reached (limit 2)' });
});

test('⭐ CON limiti: il tetto delle figlie e quello della profondità sono quelli dati, nei testi e nei conti', async () => {
  const limiti = { figliConcorrenti: 3, profondita: 4 };
  const terza = await creaSubagentOrchestrator({ sessioni: conFigli(3), limiti, cartellaEsisteFn: () => true, avviaESeguiFn: mai })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.deepEqual(terza, { esito: 'rifiutato', motivo: 'limit of 3 concurrent children reached' });
  let partita = null;
  creaSubagentOrchestrator({ sessioni: conFigli(2), limiti, cartellaEsisteFn: () => true, avviaESeguiFn: (o) => { partita = o; return { sessionId: 'f' }; } })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.ok(partita, 'due attive su tre: la terza parte');
  let profonditaRicevuta = null;
  creaSubagentOrchestrator({ sessioni: new Map([['padre-1', vocePadre({ profonditaDelega: 3 })]]), limiti, cartellaEsisteFn: () => true, avviaESeguiFn: (o) => { profonditaRicevuta = o.profonditaDelega; return { sessionId: 'f' }; } })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.equal(profonditaRicevuta, 4, 'esattamente al tetto dato: ammessa');
  const oltre = await creaSubagentOrchestrator({ sessioni: new Map([['padre-1', vocePadre({ profonditaDelega: 4 })]]), limiti, cartellaEsisteFn: () => true, avviaESeguiFn: mai })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.deepEqual(oltre, { esito: 'rifiutato', motivo: 'maximum delegation depth reached (limit 4)' });
  let undicesima = null;
  creaSubagentOrchestrator({ sessioni: conFigli(10), limiti: { figliConcorrenti: 12 }, cartellaEsisteFn: () => true, avviaESeguiFn: (o) => { undicesima = o; return { sessionId: 'f' }; } })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.ok(undicesima, 'un tetto più alto di quello di serie lascia partire l\'undicesima');
});

test('⛔ AL CONTRARIO — un valore che non è un intero positivo non cambia niente: vale quello di serie', async () => {
  for (const sbagliato of [0, -1, 1.5, '3', Number.NaN, null, Infinity]) {
    const esito = await creaSubagentOrchestrator({ sessioni: conFigli(10), limiti: { figliConcorrenti: sbagliato, profondita: sbagliato }, cartellaEsisteFn: () => true, avviaESeguiFn: mai })
      .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
    assert.deepEqual(esito, { esito: 'rifiutato', motivo: 'limit of 10 concurrent children reached' }, String(sbagliato));
  }
});

test('⭐ lo sforzo di serie della figlia: dato vince su quello della madre; non dato, la figlia eredita come oggi', () => {
  const ricevuti = [];
  const avvia = (o) => { ricevuti.push(o.reasoningRichiesto); return { sessionId: 'f' }; };
  const madre = vocePadre({ reasoning: { effort: 'high' } });
  creaSubagentOrchestrator({ sessioni: new Map([['padre-1', madre]]), cartellaEsisteFn: () => true, avviaESeguiFn: avvia })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  creaSubagentOrchestrator({ sessioni: new Map([['padre-1', madre]]), figlioDefault: { reasoning: { effort: 'low' } }, cartellaEsisteFn: () => true, avviaESeguiFn: avvia })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  creaSubagentOrchestrator({ sessioni: new Map([['padre-1', madre]]), figlioDefault: { modello: 'openrouter:m' }, cartellaEsisteFn: () => true, avviaESeguiFn: avvia })
    .delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/x' });
  assert.deepEqual(ricevuti, [{ effort: 'high' }, { effort: 'low' }, { effort: 'high' }]);
});

test('⭐ il modello di serie della figlia: vale per una madre in rete; ⛔ mai per una madre locale (BC-76: niente esce dal computer)', () => {
  assert.deepEqual(modelloDellaFigliaConDefault({ provider: 'openrouter', modello: 'openrouter:madre' }, { modello: 'openrouter:figlia' }), { ok: true, modello: 'openrouter:figlia' });
  assert.deepEqual(modelloDellaFigliaConDefault({ provider: 'openrouter', modello: 'openrouter:madre' }, null), { ok: true, modello: 'openrouter:madre' }, 'senza default: come oggi');
  assert.deepEqual(modelloDellaFigliaConDefault({ provider: 'openrouter', modello: 'openrouter:madre' }, { modello: '  ' }), { ok: true, modello: 'openrouter:madre' }, 'un nome vuoto non è un modello');
  const locale = { provider: 'local', modello: 'qwen.gguf' };
  assert.deepEqual(modelloDellaFigliaConDefault(locale, { modello: 'openrouter:figlia' }), modelloDellaFigliaConDefault(locale, null), 'una madre locale sceglie la figlia come oggi');
});

/* ⛔ 07/10/2026 (revisione critica, mutante A7-M4 sopravvissuto): le prove sopra provano le funzioni; qui si prova il CABLAGGIO del
   registro — `limitiDelega` e `figlioDefault` devono arrivare davvero all'orchestratore che il registro costruisce. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1; let concludi;
      const attesa = new Promise((risolvi) => { concludi = risolvi; });
      avvii.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' } }); concludi({ ok: true }); } });
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
  };
}
function registroDelegante(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-limiti-registro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const finto = modelloFinto();
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm-madre', chiave: 'k', ...opzioni,
  });
  const avvio = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'delega', permessi: 'Full access' });
  assert.ok(avvio.sessionId, avvio.erroreAvvio);
  return { registro, finto, madre: finto.avvii[0] };
}

test('⭐ REGISTRO — `limitiDelega` e `figlioDefault` arrivano all\'orchestratore: modello e sforzo della figlia, e il tetto delle figlie', async (t) => {
  const { finto, madre } = registroDelegante(t, { limitiDelega: { figliConcorrenti: 1 }, figlioDefault: { modello: 'openrouter:figlia', reasoning: { effort: 'low' } } });
  const prima = madre.input.onDelega('primo compito');
  const figlia = finto.avvii[1];
  assert.equal(figlia.input.modello, 'openrouter:figlia', 'il modello di serie delle figlie non arriva dal registro');
  assert.deepEqual(figlia.input.reasoning, { effort: 'low' }, 'lo sforzo di serie delle figlie non arriva dal registro');
  const seconda = await madre.input.onDelega('secondo compito');
  assert.deepEqual(seconda, { esito: 'rifiutato', motivo: 'limit of 1 concurrent children reached' }, 'il tetto delle figlie non arriva dal registro');
  figlia.concludi(); madre.concludi(); await prima;
});

test('⛔ REGISTRO al contrario — senza `limitiDelega` e `figlioDefault` la figlia eredita il modello della madre e vale il tetto di sempre', async (t) => {
  const { finto, madre } = registroDelegante(t, {});
  const prima = madre.input.onDelega('primo compito');
  const figlia = finto.avvii[1];
  assert.equal(figlia.input.modello, 'm-madre', 'la figlia non eredita il modello della madre');
  const seconda = madre.input.onDelega('secondo compito');
  assert.equal(finto.avvii.length, 3, 'con il tetto di serie (10) la seconda figlia parte');
  finto.avvii[2].concludi(); figlia.concludi(); madre.concludi(); await Promise.all([prima, seconda]);
});
