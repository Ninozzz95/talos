/*
 * 11/11/2026 — LA SOGLIA QUANDO LA FINESTRA DEL MODELLO NON SI LEGGE, E LA SCRITTA CHE LA DECISIONE 245 AVEVA TOLTO.
 * Brief `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`; decisione dell'owner 13:50 (v1465, punto 5, «Sì, come Hermes»).
 * Misura (MISURE-RESA-DEL-MODELLO-2026-11-10.md §4, reperto 2): con `/endpoints` che non risponde, o alla prima chiamata, la finestra è
 * `null` e la soglia vale 200.000 anche su DeepSeek V3.2 da 163.840 ⇒ TALOS compatta solo dopo il 400 del fornitore, e su quel percorso
 * arriva al modello «to fit the context window», la scritta che la 245 aveva tolto altrove perché DeepSeek si fermava «per il contesto».
 * Le prove (a)-(d) del brief, più le tre della decisione dell'owner: la riga solo con la finestra non nota, il valore scritto dalla
 * persona che vince, i valori assurdi rifiutati con un messaggio.
 * Fonti: Hermes `agent/model_metadata.py:255-271` (ripiego fisso, avviso, «Set model.context_length in config.yaml to override»);
 *   Codex `models-manager/src/model_info.rs:18-26` (`model_context_window` della persona) e `:97-129` (modello ignoto ⇒ 272.000);
 *   pi `packages/coding-agent/src/core/provider-composer.ts:242` (`contextWindow ?? 128000`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCompactionWindowSource } from '../src/compaction-window-source.mjs';
import { calcolaSoglie, TETTO_TOKEN_DEFAULT, riduciCodaSottoPressione } from '../src/kernel/compattazione-desktop.mjs';
import { avvisoAccorciato, notaDegliAccorciati, leggiAvvisoAccorciato } from '../src/kernel/avviso-accorciato.mjs';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const modulo = await import('../src/finestra-di-ripiego.mjs').catch(() => ({}));
const DEEPSEEK = 'deepseek/deepseek-v3.2';
const FINESTRA_DEEPSEEK = 163_840;
const routeCheCade = () => createCompactionWindowSource({ fetchFn: async () => { throw new Error('rete giù'); } });
const catalogoOpenRouter = (modelli) => async () => ({ modelli });
const unGiro = () => new Promise((r) => { setImmediate(r); });
const giri = async (n = 5) => { for (let i = 0; i < n; i += 1) await unGiro(); };

test('FS-01 (a, rossa prima della cura): /endpoints non risponde, la finestra viene dal catalogo, e la soglia scatta PRIMA della finestra del fornitore', async () => {
  assert.equal(typeof modulo.creaSceltaDellaFinestra, 'function', 'il modulo della finestra di ripiego esiste');
  const cataloghi = modulo.creaFinestraDaiCataloghi({ openrouter: catalogoOpenRouter([{ id: DEEPSEEK, contextLength: FINESTRA_DEEPSEEK }]) });
  const scelta = modulo.creaSceltaDellaFinestra({ rotta: routeCheCade(), cataloghi });
  scelta(DEEPSEEK); // la prima lettura avvia le due letture in sottofondo
  await giri();
  const { finestra, fonte } = scelta(DEEPSEEK);
  assert.equal(fonte, 'catalogo');
  assert.equal(finestra, FINESTRA_DEEPSEEK);
  const soglie = calcolaSoglie({ finestraToken: finestra });
  assert.equal(soglie.soglia, 122_880, 'il 75% della finestra del catalogo');
  assert.ok(soglie.soglia < FINESTRA_DEEPSEEK && soglie.emergenza < FINESTRA_DEEPSEEK, 'compatta prima che il fornitore rifiuti');
  // e con l'id del fornitore davanti, come lo scrive il selettore
  assert.equal(scelta(`openrouter:${DEEPSEEK}`).finestra, FINESTRA_DEEPSEEK);
});

test('FS-02 (b, rossa prima della cura): alla PRIMA chiamata, e per un modello che nessun catalogo conosce, vale la finestra prudente, mai 200.000', async () => {
  assert.equal(typeof modulo.creaSceltaDellaFinestra, 'function');
  const cataloghi = modulo.creaFinestraDaiCataloghi({ openrouter: catalogoOpenRouter([{ id: DEEPSEEK, contextLength: FINESTRA_DEEPSEEK }]) });
  const scelta = modulo.creaSceltaDellaFinestra({ rotta: routeCheCade(), cataloghi });
  assert.deepEqual(scelta(DEEPSEEK), { finestra: 128_000, fonte: 'prudente' }, 'la prima chiamata non aspetta la rete e non usa 200.000');
  for (const id of ['acme/modello-sconosciuto', 'lmstudio:qwen3.5-9b', 'deepseek:deepseek-chat']) {
    assert.equal(scelta(id).fonte, 'prudente', id);
    await giri();
    assert.deepEqual(scelta(id), { finestra: modulo.FINESTRA_PRUDENTE, fonte: 'prudente' }, id);
  }
  assert.equal(modulo.FINESTRA_PRUDENTE, 128_000);
  const soglie = calcolaSoglie({ finestraToken: modulo.FINESTRA_PRUDENTE });
  assert.equal(soglie.soglia, 96_000);
  assert.ok(soglie.soglia < TETTO_TOKEN_DEFAULT && soglie.emergenza < FINESTRA_DEEPSEEK, 'anche la soglia d\'emergenza sta sotto i 163.840 del caso misurato');
});

test('FS-03 (decisione dell\'owner): il valore scritto dalla persona vince sul ripiego, sul catalogo e sulla rotta', async () => {
  assert.equal(typeof modulo.creaSceltaDellaFinestra, 'function');
  const rotta = createCompactionWindowSource({ fetchFn: async () => ({ ok: true, json: async () => ({ data: { id: DEEPSEEK, endpoints: [{ model_id: DEEPSEEK, context_length: FINESTRA_DEEPSEEK }] } }) }) });
  const cataloghi = modulo.creaFinestraDaiCataloghi({ openrouter: catalogoOpenRouter([{ id: DEEPSEEK, contextLength: 200_000 }]) });
  const scritte = new Map([[DEEPSEEK, 64_000], ['acme/ignoto', 32_768]]);
  const scelta = modulo.creaSceltaDellaFinestra({ rotta, cataloghi, scrittaFn: (id) => scritte.get(id) ?? null });
  scelta(DEEPSEEK);
  await giri();
  assert.deepEqual(scelta(DEEPSEEK), { finestra: 64_000, fonte: 'persona' }, 'vince sulla rotta letta e sul catalogo');
  assert.deepEqual(scelta('acme/ignoto'), { finestra: 32_768, fonte: 'persona' }, 'vince sul ripiego');
  scritte.delete(DEEPSEEK);
  assert.deepEqual(scelta(DEEPSEEK), { finestra: FINESTRA_DEEPSEEK, fonte: 'rotta' }, 'tolta, torna la rotta (il minimo vero degli endpoint)');
  // una funzione che si rompe, o un valore assurdo arrivato da fuori, non ferma la scelta
  assert.equal(modulo.creaSceltaDellaFinestra({ rotta: routeCheCade(), cataloghi, scrittaFn: () => { throw new Error('rotto'); } })('acme/ignoto').fonte, 'prudente');
  assert.equal(modulo.creaSceltaDellaFinestra({ rotta: routeCheCade(), cataloghi, scrittaFn: () => 0 })('acme/ignoto').fonte, 'prudente');
});

test('FS-04 (decisione dell\'owner): un valore assurdo si rifiuta con un messaggio; null toglie quello scritto', () => {
  assert.equal(typeof modulo.controllaFinestraScritta, 'function');
  for (const assurdo of [0, -1, -163_840, 1.5, 10_000_001, 1e12, Number.NaN, Infinity, '12abc', '', true, {}, [], 4_095, undefined]) {
    const esito = modulo.controllaFinestraScritta(assurdo);
    assert.equal(esito.ok, false, String(assurdo));
    assert.match(esito.motivo, /whole number of tokens between 4,096 and 10,000,000/u, String(assurdo));
  }
  assert.deepEqual(modulo.controllaFinestraScritta(163_840), { ok: true, valore: 163_840 });
  assert.deepEqual(modulo.controllaFinestraScritta('163840'), { ok: true, valore: 163_840 }, 'la cifra scritta come testo (dall\'attrezzo)');
  assert.deepEqual(modulo.controllaFinestraScritta(4_096), { ok: true, valore: 4_096 });
  assert.deepEqual(modulo.controllaFinestraScritta(10_000_000), { ok: true, valore: 10_000_000 });
  assert.deepEqual(modulo.controllaFinestraScritta(null), { ok: true, valore: null });
});

test('FS-05 (decisione dell\'owner): la memoria scritta sta nelle impostazioni del contesto, per modello; un valore assurdo non si salva', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-fs05-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const file = join(dir, 'context', 'impostazioni-contesto.json');
  const imp = createImpostazioniContesto({ file, avvisa: () => {} });
  assert.equal(typeof imp.finestraScrittaPer, 'function');
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), null);
  const salvate = await imp.scrivi({ finestreDeiModelli: { [DEEPSEEK]: 163_840 } });
  assert.deepEqual(salvate.finestreDeiModelli, { [DEEPSEEK]: 163_840 });
  assert.equal(salvate.motore, 'engine', 'le altre scelte restano di serie');
  await imp.scrivi({ finestreDeiModelli: { 'chatgpt:gpt-6-luna': 400_000 } });
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840, 'un secondo modello non cancella il primo');
  assert.equal(imp.finestraScrittaPer(`openrouter:${DEEPSEEK}`), 163_840, 'lo stesso modello con il fornitore davanti');
  assert.equal(imp.finestraScrittaPer('chatgpt:gpt-6-luna'), 400_000);
  for (const assurdo of [0, -5, 20_000_000, 1.5, 'tanto']) {
    await assert.rejects(imp.scrivi({ finestreDeiModelli: { [DEEPSEEK]: assurdo } }), (e) => e.code === 'CTX_SETTINGS_INVALID' && /4,096 and 10,000,000/u.test(e.message), String(assurdo));
  }
  await assert.rejects(imp.scrivi({ finestreDeiModelli: { 'non è un modello': 100_000 } }), (e) => e.code === 'CTX_SETTINGS_INVALID');
  await assert.rejects(imp.scrivi({ finestreDeiModelli: [163_840] }), (e) => e.code === 'CTX_SETTINGS_INVALID');
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840, 'un rifiuto non tocca il valore salvato');
  await imp.scrivi({ finestreDeiModelli: { [DEEPSEEK]: null } });
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), null, 'null la toglie');
  /* giro dopo i revisori (punto 1): le memorie stanno nel LORO file, accanto; quello delle impostazioni resta leggibile dalla versione di prima */
  const sulDisco = JSON.parse(readFileSync(join(dir, 'context', 'finestre-dei-modelli.json'), 'utf8'));
  assert.deepEqual(sulDisco.finestreDeiModelli, { 'chatgpt:gpt-6-luna': 400_000 });
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(file, 'utf8')), 'finestreDeiModelli'), false);
  // un file di prima di questa voce (il solo motore) resta valido
  mkdirSync(join(dir, 'vecchio'), { recursive: true });
  const vecchio = join(dir, 'vecchio', 'impostazioni-contesto.json');
  writeFileSync(vecchio, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy' }));
  const daPrima = createImpostazioniContesto({ file: vecchio, avvisa: () => {} });
  assert.deepEqual(await daPrima.leggi(), { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null }, 'senza memorie scritte la risposta è quella di prima, byte per byte');
  assert.equal((await daPrima.leggi()).motore, 'legacy');
});

/* il registro vero e `avviaSessione` vero; al posto del kernel una spia (la forma di `registro-tetto-compattazione-21-10.test.mjs`) */
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } };
}
async function politicaDi(opzioni) {
  let alKernel = null;
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => { alKernel = ri; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: DEEPSEEK, chiave: 'k', ...opzioni });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!alKernel && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  const politica = registro.politicaCompattazione(sessionId);
  registro.ferma?.(sessionId);
  return { alKernel, politica };
}

/* Dopo il commit rosso: `windowUnknown: true` IN PIÙ invece di una `source` nuova, perché il pannello del telefono
   (Talos-Mobile `mobile/src/lib/harness/r4/pannelloR4.ts:91`) e la scheda del PC accettano solo route-minimum, explicit-cap e fallback:
   una `source` nuova avrebbe tolto il limite dal pannello del telefono. */
test('FS-06 (la riga solo con la finestra non nota): la politica dice «windowUnknown» solo quando la finestra è il ripiego', async () => {
  const prudente = await politicaDi({ finestraTokenFn: () => 128_000, fonteFinestraFn: () => 'prudente' });
  /* giro dopo i revisori (punto 3, ALTO del revisore B): la finestra prudente è un ripiego, `fallback`, e il pannello del telefono di oggi
     (`pannelloR4.ts:100`) scrive «~96k · Model window not verified»; con `route-minimum` diceva che 128.000 era la finestra del modello */
  assert.equal(prudente.politica.source, 'fallback', 'la source resta una delle tre di sempre: quella del ripiego');
  assert.equal(prudente.politica.windowUnknown, true);
  assert.equal(prudente.politica.windowTokens, 128_000);
  assert.equal(prudente.politica.triggerTokens, 96_000);
  assert.equal(prudente.alKernel.finestraToken, 128_000, 'il giro riceve la stessa finestra');
  for (const fonte of ['catalogo', 'rotta', 'persona', null]) {
    const nota = await politicaDi({ finestraTokenFn: () => FINESTRA_DEEPSEEK, fonteFinestraFn: () => fonte });
    assert.equal(nota.politica.source, 'route-minimum', String(fonte));
    assert.equal(Object.hasOwn(nota.politica, 'windowUnknown'), false, String(fonte));
  }
  const rotta = await politicaDi({ finestraTokenFn: () => FINESTRA_DEEPSEEK, fonteFinestraFn: () => { throw new Error('rotto'); } });
  assert.equal(Object.hasOwn(rotta.politica, 'windowUnknown'), false, 'una funzione rotta non inventa un ripiego');
  // il ripiego vale solo se la finestra in uso è proprio quella dell'ospite (un rifiuto del fornitore col suo numero la rende nota)
  const senzaFinestra = await politicaDi({ fonteFinestraFn: () => 'prudente' });
  assert.equal(Object.hasOwn(senzaFinestra.politica, 'windowUnknown'), false, 'senza finestra dell\'ospite vale il fallback di sempre');
  assert.equal(senzaFinestra.politica.source, 'fallback');
});

test('FS-07 (c, rossa prima della cura): sul percorso del rifiuto il modello riceve note NEUTRE, nella forma della 245', () => {
  const lungo = `[TALOS read lines 1-400 of 400]\n<<<TALOS_DATA id=0123456789ab from="leggi src/giacenza.ts">>>\n${Array.from({ length: 400 }, (_, i) => `riga ${i + 1} ${'x'.repeat(60)}`).join('\n')}\n<<<END_TALOS_DATA id=0123456789ab>>>`;
  const avviso = avvisoAccorciato(lungo, { inizio: 1_200, fine: 400 });
  const coda = [{ role: 'user', content: 'leggi tutto' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: lungo }];
  const { coda: ridotta } = riduciCodaSottoPressione(coda, { budgetToken: 200 });
  const esito = ridotta.at(-1).content;
  const nota = notaDegliAccorciati(ridotta);
  for (const [nome, testo] of [['avviso', avviso], ['esito', esito], ['nota', nota]]) {
    assert.ok(typeof testo === 'string' && testo.length > 0, nome);
    assert.doesNotMatch(testo, /to fit the context|context window|running out|last tokens/iu, `${nome}: niente scritta che spinge a fermarsi`);
    assert.match(testo, /trimmed by TALOS/u, `${nome}: la forma della 245`);
  }
  assert.match(nota, /the full text is kept/u, 'la nota dice che il testo intero c\'è, come i marcatori della 245');
  // il resto dell'avviso non cambia: righe, caratteri e come recuperare
  const letto = leggiAvvisoAccorciato(esito);
  assert.ok(letto && letto.da > 1 && letto.a > letto.da, JSON.stringify(letto));
  assert.match(avviso, /are NOT shown below\. The full output is kept: read those lines again with leggi offset\/limit, or search them with cerca\. Do not treat the visible part as the whole file\.\]$/u);
  assert.match(nota, /src\/giacenza\.ts \(lines \d+–\d+ not shown\)\. Before answering, read again or search what you need\. If something cannot be recovered, say clearly which part is missing\.\]$/u);
});

test('FS-08 (d, nessuna regressione): con una finestra letta bene la scelta, la soglia e la politica restano quelle di oggi', async () => {
  assert.deepEqual(calcolaSoglie({ finestraToken: FINESTRA_DEEPSEEK }), { soglia: 122_880, warningTokens: 98_304, emergenza: 147_456, fonte: 'finestra', tettoToken: null, finestraToken: FINESTRA_DEEPSEEK });
  assert.deepEqual(calcolaSoglie({ finestraToken: null }), { soglia: 200_000, warningTokens: 160_000, emergenza: 240_000, fonte: 'fallback', tettoToken: 200_000, finestraToken: null }, 'il kernel nudo non cambia: il ripiego lo sceglie chi conosce i cataloghi');
  const { politica } = await politicaDi({ finestraTokenFn: () => 1_000_000 });
  /* giro dopo i revisori (punto 12, owner 17:47): il compattatore di prima prende il tetto del motore, 200.000 anche su un modello da 1M */ /* passaggio dopo il revisore unico (punto 4): detto `explicit-cap` + `engineCeiling`, perché il telefono di oggi scriva il vero */
  assert.deepEqual({ ...politica, inProgress: false }, { windowTokens: 1_000_000, triggerTokens: 200_000, warningTokens: 160_000, emergencyTokens: 240_000, source: 'explicit-cap', engineCeiling: true, modelId: DEEPSEEK, inProgress: false });
  assert.equal(typeof modulo.creaSceltaDellaFinestra, 'function');
  const rotta = createCompactionWindowSource({ fetchFn: async () => ({ ok: true, json: async () => ({ data: { id: DEEPSEEK, endpoints: [{ model_id: DEEPSEEK, context_length: 131_072 }, { model_id: DEEPSEEK, context_length: FINESTRA_DEEPSEEK }] } }) }) });
  const cataloghi = modulo.creaFinestraDaiCataloghi({ openrouter: catalogoOpenRouter([{ id: DEEPSEEK, contextLength: FINESTRA_DEEPSEEK }]) });
  const scelta = modulo.creaSceltaDellaFinestra({ rotta, cataloghi });
  scelta(DEEPSEEK);
  await giri();
  assert.deepEqual(scelta(DEEPSEEK), { finestra: 131_072, fonte: 'rotta' }, 'la rotta letta vince sul catalogo, come oggi');
});

test('FS-09: il piano ChatGPT e i fornitori diretti prendono la finestra dal LORO catalogo; un catalogo che si rompe non inventa niente', async () => {
  assert.equal(typeof modulo.creaFinestraDaiCataloghi, 'function');
  const chiesti = [];
  const cataloghi = modulo.creaFinestraDaiCataloghi({
    openrouter: async () => { throw new Error('giù'); },
    chatgpt: async () => [{ id: 'chatgpt:gpt-6-luna', contextLength: 272_000 }],
    diretto: async (fornitore) => { chiesti.push(fornitore); return { modelli: [{ id: 'deepseek:deepseek-chat', contextLength: 131_072 }] }; },
  });
  for (const id of ['chatgpt:gpt-6-luna', 'deepseek:deepseek-chat', DEEPSEEK, 'local:qwen', 'locale-ospite:lfm', 'lmstudio:qwen']) assert.equal(cataloghi.get(id), null, `${id}: la prima lettura non aspetta`);
  await giri();
  assert.equal(cataloghi.get('chatgpt:gpt-6-luna'), 272_000);
  assert.equal(cataloghi.get('deepseek:deepseek-chat'), 131_072);
  assert.equal(cataloghi.get(DEEPSEEK), null, 'OpenRouter giù: nessun numero inventato');
  assert.equal(cataloghi.get('local:qwen'), null);
  assert.deepEqual(chiesti, ['deepseek'], 'i motori locali non si chiedono ai cataloghi del cloud');
});

test('FS-10 (due porte, decisione dell\'owner): la memoria del modello di QUESTA conversazione si scrive anche da app_settings, dietro la carta; un valore assurdo non passa', async (t) => {
  const { voceDelCatalogo } = await import('../src/impostazioni/catalogo-impostazioni.mjs');
  const { creaFontiDelServer } = await import('../src/impostazioni/fonti-impostazioni.mjs');
  const { creaServizioImpostazioni } = await import('../src/impostazioni/servizio-impostazioni.mjs');
  const v = voceDelCatalogo('conversation.modelMemory');
  assert.ok(v, 'la voce c\'è');
  assert.deepEqual([v.sezione, v.ambito, v.dove, v.tipo, v.gruppo], ['conversation', 'conversazione', 'server', 'memoria', null]);
  assert.match(v.testo.en, /memory/iu);
  assert.match(v.testo.it, /memoria/iu);
  const dir = mkdtempSync(join(tmpdir(), 'talos-fs10-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'context', 'impostazioni-contesto.json'), avvisa: () => {} });
  const registro = { impostazioniCorrenti: (id) => (id === 's1' ? { modello: DEEPSEEK } : null) };
  const s = creaServizioImpostazioni({ fonti: creaFontiDelServer({ impostazioniContesto, registroFn: () => registro }) });
  assert.ok(s.voci().some((x) => x.chiave === 'conversation.modelMemory'));
  const fn = s.perLaSessione({ sessionId: 's1' });
  const elenco = (await fn('app_settings', { action: 'list', section: 'conversation' }, { fase: 'esegui' })).testo;
  assert.match(elenco, /conversation\.modelMemory = null; a whole number of tokens between 4,096 and 10,000,000, or null for automatic/u);
  const rev = Number(/Revision (\d+)/u.exec(elenco)?.[1]);
  const arg = { action: 'set', expected_revision: rev, changes: [{ key: 'conversation.modelMemory', value: 163_840 }] };
  const anteprima = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: 'c1' });
  assert.equal(anteprima.carta, true, 'dietro la carta');
  assert.deepEqual(anteprima.azione.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['conversation.modelMemory', null, 163_840]]);
  assert.equal(impostazioniContesto.finestraScrittaPer(DEEPSEEK), null, 'la carta da sola non scrive');
  const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: 'c1' });
  assert.equal(fatto.ok, true, JSON.stringify(fatto));
  assert.equal(impostazioniContesto.finestraScrittaPer(DEEPSEEK), 163_840, 'scritta per il modello della conversazione');
  for (const assurdo of [0, -1, 20_000_000, 'tanto']) {
    const no = await fn('app_settings', { ...arg, changes: [{ key: 'conversation.modelMemory', value: assurdo }] }, { fase: 'anteprima', toolCallId: 'c2' });
    assert.equal(no.ok, false, String(assurdo));
    assert.match(JSON.stringify(no), /4,096 and 10,000,000/u, String(assurdo));
  }
  assert.equal(impostazioniContesto.finestraScrittaPer(DEEPSEEK), 163_840);
});

/* Dai mutanti della cura (M15, M16 sopravvissuti al primo giro): due righe che nessuna prova guardava. */
test('FS-11: un rifiuto del fornitore col suo numero rende la finestra NOTA: niente riga «memoria non nota» anche se l\'ospite usa il ripiego', async () => {
  let giro = 0;
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async () => {
      giro += 1;
      /* la forma di `statoDelGiro.rifiutoDelFornitore` che il registro ricorda per il modello (`session-registry.mjs`, R11-7) */
      return { comeFinita: 'concluso', messaggiFinali: [], rifiutoDelFornitore: { finestra: 100_000, scala: 1 } };
    } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: DEEPSEEK, chiave: 'k',
    finestraTokenFn: () => 128_000, fonteFinestraFn: () => 'prudente' });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  let politica = registro.politicaCompattazione(sessionId);
  while (politica.windowTokens !== 100_000 && Date.now() < fine) {
    await new Promise((r) => { setTimeout(r, 20); });
    politica = registro.politicaCompattazione(sessionId);
  }
  registro.ferma?.(sessionId);
  assert.ok(giro >= 1, 'il giro è partito');
  assert.equal(politica.windowTokens, 100_000, 'il rifiuto col numero abbassa la finestra');
  assert.equal(Object.hasOwn(politica, 'windowUnknown'), false, 'la finestra ora la dice il fornitore: non è più il ripiego');
});

test('FS-12: un avviso nella forma di PRIMA (conversazioni salvate prima della cura) si riconosce ancora e non si accorcia due volte', () => {
  const lungo = Array.from({ length: 300 }, (_, i) => `riga ${i + 1} ${'y'.repeat(50)}`).join('\n');
  const nuovo = avvisoAccorciato(lungo, { inizio: 1_000, fine: 300 });
  const diPrima = nuovo.replace('[TALOS: this result was trimmed by TALOS. Lines ', () => '[TALOS: this result was shortened to fit the context. Lines ');
  assert.notEqual(diPrima, nuovo);
  const letto = leggiAvvisoAccorciato(`${diPrima}\n${lungo.slice(0, 1_000)}`);
  assert.ok(letto && letto.da > 1 && letto.a > letto.da, `la forma di prima si legge ancora: ${JSON.stringify(letto)}`);
  const coda = [{ role: 'user', content: 'leggi' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: `${diPrima}\n${lungo}` }];
  const { coda: ridotta } = riduciCodaSottoPressione(coda, { budgetToken: 200 });
  const esito = ridotta.at(-1).content;
  assert.equal((esito.match(/\[TALOS: this result was (?:trimmed by TALOS|shortened to fit the context)\. Lines /gu) ?? []).length, 1, 'un esito già accorciato non riceve un secondo avviso');
});
