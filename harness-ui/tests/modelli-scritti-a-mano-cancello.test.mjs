/*
 * ⛔ CANCELLO A ELENCO (S6 della 0.2.4, 18/11/2026): nessun modello scritto a mano nel registro (riserve e ausiliario) che l'elenco generato
 *   da models.dev non conosce o dà per ritirato. Le eccezioni stanno, motivate, in `scripts/modelli-di-riserva/correzioni.json`; un'eccezione
 *   che non serve più fa fallire il cancello (si toglie, non si accumula). Il 18/11 il registro aveva un ausiliario sparito da due mesi
 *   (`liquid/lfm-2.5-2.6b:free`) e due «deprecated» senza che nessuna prova se ne accorgesse.
 * Per rigenerare l'elenco: `node scripts/genera-elenco-modelli.mjs --da <api.json>` (o `--rete`, a mano). Le prove non usano la rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';
import { differenzeDalRegistro, vociDelRegistro } from '../scripts/genera-elenco-modelli.mjs';

const leggi = (relativo) => JSON.parse(readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), 'utf8'));
const ELENCO = leggi('../scripts/modelli-di-riserva/elenco-generato.json');
const CORREZIONI = leggi('../scripts/modelli-di-riserva/correzioni.json');

/** Ogni modello scritto a mano che non è «vivo» e non ha un'eccezione motivata; e ogni eccezione che non serve. */
export function verificaModelliScrittiAMano(registro, elenco, correzioni) {
  const problemi = [...differenzeDalRegistro(elenco, registro)];
  const eccezioni = new Map((correzioni.eccezioni ?? []).map((e) => [`${e.fornitore}/${e.id}`, e]));
  const usate = new Set();
  for (const r of Object.values(registro)) {
    if (!Array.isArray(r.modelliDiRiserva) || r.modelliDiRiserva.length === 0 || !r.modelsDevId) continue;
    const voci = new Map(vociDelRegistro(elenco.fornitori?.[r.id]).map((v) => [v.id, v]));
    for (const id of new Set([...r.modelliDiRiserva.map((m) => m.id), ...(r.modelloAusiliario ? [r.modelloAusiliario] : [])])) {
      const v = voci.get(id);
      const nome = `${r.id}/${id}`;
      if (v?.stato === 'vivo' && v.attrezzi === true) continue;
      const e = eccezioni.get(nome);
      if (e && typeof e.motivo === 'string' && e.motivo.trim().length >= 20) { usate.add(nome); continue; }
      problemi.push(`${nome}: ${v ? v.stato : 'unknown to the generated list'}${e ? ' (exception without a reason)' : ''}`);
    }
  }
  for (const nome of eccezioni.keys()) if (!usate.has(nome)) problemi.push(`${nome}: exception no longer needed`);
  return problemi;
}

test('CANC-MOD-01 il registro di oggi: nessun modello morto o sconosciuto senza eccezione motivata', () => {
  assert.deepEqual(verificaModelliScrittiAMano(REGISTRO_FORNITORI, ELENCO, CORREZIONI), []);
});

test('CANC-MOD-02 al contrario: il modello sparito del 18/11 rimesso nel registro fa fallire il cancello', () => {
  const r = REGISTRO_FORNITORI.openrouter;
  const morto = { ...r, modelliDiRiserva: [{ ...r.modelliDiRiserva[0], id: 'liquid/lfm-2.5-2.6b:free' }, ...r.modelliDiRiserva.slice(1)], modelloAusiliario: 'liquid/lfm-2.5-2.6b:free' };
  const elenco = structuredClone(ELENCO);
  /* anche se qualcuno lo scrive a mano nell'elenco come «sconosciuto»: lo stato è quello di models.dev */
  elenco.fornitori.openrouter.voci[0] = { ...elenco.fornitori.openrouter.voci[0], id: 'liquid/lfm-2.5-2.6b:free', stato: 'sconosciuto' };
  elenco.fornitori.openrouter.ausiliario = 'liquid/lfm-2.5-2.6b:free';
  assert.deepEqual(verificaModelliScrittiAMano({ openrouter: morto }, { ...elenco, fornitori: { openrouter: elenco.fornitori.openrouter } }, { eccezioni: CORREZIONI.eccezioni.filter((e) => e.fornitore === 'openrouter') }),
    ['openrouter/liquid/lfm-2.5-2.6b:free: sconosciuto']);
});

test('CANC-MOD-03 al contrario: un ritirato, un registro non rigenerato, un\'eccezione senza motivo e una che non serve più', () => {
  const elenco = structuredClone(ELENCO);
  const voce = elenco.fornitori.minimax.voci.find((v) => v.id === 'MiniMax-M3');
  voce.stato = 'ritirato';
  assert.match(verificaModelliScrittiAMano(REGISTRO_FORNITORI, elenco, CORREZIONI).join('\n'), /minimax\/MiniMax-M3: ritirato/);
  const nonRigenerato = { ...REGISTRO_FORNITORI, together: { ...REGISTRO_FORNITORI.together, modelliDiRiserva: [{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' }] } };
  assert.match(verificaModelliScrittiAMano(nonRigenerato, ELENCO, CORREZIONI).join('\n'), /together: registry fallbacks/);
  /* giudice v2229 (19/11/2026): l'eccezione di gpt-5-nano non c'è più (nano sostituito da luna); si prova su quella di Fireworks */
  const senzaMotivo = { eccezioni: CORREZIONI.eccezioni.map((e) => (e.id === 'accounts/fireworks/models/gpt-oss-120b' ? { ...e, motivo: ' ' } : e)) };
  assert.match(verificaModelliScrittiAMano(REGISTRO_FORNITORI, ELENCO, senzaMotivo).join('\n'), /fireworks\/accounts\/fireworks\/models\/gpt-oss-120b: sconosciuto \(exception without a reason\)/);
  /* al contrario: nano rimesso nel registro senza la sua eccezione fa fallire il cancello */
  const conNano = { ...REGISTRO_FORNITORI, openai: { ...REGISTRO_FORNITORI.openai, modelliDiRiserva: [{ id: 'gpt-5-nano' }, ...REGISTRO_FORNITORI.openai.modelliDiRiserva] } };
  const elencoConNano = structuredClone(ELENCO);
  elencoConNano.fornitori.openai.voci.unshift({ ruolo: 'riserva', id: 'gpt-5-nano', stato: 'in-spegnimento', attrezzi: true });
  assert.match(verificaModelliScrittiAMano(conNano, elencoConNano, CORREZIONI).join('\n'), /openai\/gpt-5-nano: in-spegnimento/);
  const inPiu = { eccezioni: [...CORREZIONI.eccezioni, { fornitore: 'deepseek', id: 'deepseek-flash', motivo: 'An exception that nothing needs any more.' }] };
  assert.deepEqual(verificaModelliScrittiAMano(REGISTRO_FORNITORI, ELENCO, inPiu), ['deepseek/deepseek-flash: exception no longer needed']);
});

test('CANC-MOD-04 l\'elenco nel deposito è quello del generatore: fonte, data, impronta e un fornitore per ogni registro con riserve', () => {
  assert.equal(ELENCO.fonte, 'https://models.dev/api.json');
  assert.match(ELENCO.letto, /^\d{4}-\d{2}-\d{2}$/u);
  assert.match(ELENCO.sha256, /^[0-9a-f]{64}$/u);
  const conRiserve = Object.values(REGISTRO_FORNITORI).filter((r) => Array.isArray(r.modelliDiRiserva) && r.modelliDiRiserva.length && r.modelsDevId).map((r) => r.id);
  assert.deepEqual(Object.keys(ELENCO.fornitori), conRiserve);
});
