import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';
import { aliasGrafiaRagionamento, livelloRagionamentoMinimo, livelloRagionamentoPiuVicino, preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { filoRagionamentoDiretti, livelliRagionamentoDiretti } from '../src/model-destination.mjs';
import { filoRagionamentoCatalogo, normalizzaReasoningPerModello } from '../src/runtime-owner-adapter.mjs';

/* ⛔ STORIA. BUG-7 (04/10/2026, owner): il livello di ragionamento chiesto dall'interfaccia si
   ADATTA al modello (clamp al più vicino, allora «sopra prima») e l'avviso si dice una volta a
   sessione — fonti pi-mono `packages/ai/src/models.ts:1222-1240` (`clampThinkingLevel`) e hermes
   `agent/auxiliary_reasoning_floor.py:1-18` («step up, not a strip»). Il difetto: la frase
   «Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D…» a OGNI giro
   (transcript sessione 3eb5e436, giro 25).
   ⛔ BUG-18 (05/10/2026, owner, gen.1): «non voglio più vedere queste frasi» + «dinamica per
   tutti i provider» + priorità Claude → Hermes → pi/codex (memoria 75cd6a41): le frasi di
   normalizzazione escono dalla chat e diventano `note` (telemetria al journal, mai bolla); il
   clamp diventa «prima il più debole, altrimenti il minimo supportato» (hermes
   agent/reasoning_effort.py:120-160, clamp_effort: «the **nearest weaker** supported level is
   returned so a clamp never escalates cost» — regola owner 24/09 «mai un costo più alto di
   quello scelto»; il clamp «sopra prima» del BUG-7 è SUPERATO); alias canonico xhigh≡max; il
   registro Z.AI documenta `low` (['low','high','max']).
   ⛔ BUG-18 gen.2 (05/10, revisore B1/D2/D3): questa suite è riscritta sul contratto BUG-18 —
   la versione BUG-7 pinnavano il contratto vecchio ed erano rimaste rosse (9/11). Nuove ancore:
   alias SILENZIOSO (Decisione 1 del dossier: stessa grafia del livello, nessuna frase) e floor
   «none»→minimo documentato sui modelli obbligati (hermes auxiliary_reasoning_floor.py:
   «Dropping the field… hands the effort choice back to the provider default (often medium or
   higher, the opposite of what a thinking-off caller asked for)»; Z.AI default_effort: max,
   misurato 24/09). I versi contrari del BUG-7 (nessuna invenzione fuori scala) restano. */

const preparaZai = (corpo) => preparaRichiestaCompatibile('zai', corpo);

test('BUG18-LIV-01 — xhigh su glm-5.3-flash: alias canonico → max, SILENZIOSO (Decisione 1)', () => {
  /* L'alias non è un clamp: è lo stesso livello con due grafie (la pillola «max» invia «xhigh»,
     app.js:7340). Nessuna frase né in chat né nel journal: a ogni giro dell'owner non deve
     comparire nulla (D2 del revisore gen.1: la nota durevole a ogni richiesta era rumore). */
  for (const extra of [{ reasoning: { effort: 'xhigh' } }, { reasoning_effort: 'xhigh' }]) {
    const result = preparaZai({ model: 'glm-5.3-flash', messages: [], ...extra });
    assert.equal(result.corpo.reasoning_effort, 'max');
    assert.equal(result.corpo.reasoning, undefined);
    assert.deepEqual(result.corpo.thinking, { type: 'enabled' });
    assert.deepEqual(result.avvisi, []);
    assert.deepEqual(result.note, [], 'alias = stessa grafia del livello: silenzioso');
  }
});

test('BUG18-LIV-02 — low è documentato e passa; medium e minimal scendono al più debole (low), in nota', () => {
  const documentato = preparaZai({ model: 'glm-5.3-flash', messages: [], reasoning_effort: 'low' });
  assert.equal(documentato.corpo.reasoning_effort, 'low');
  assert.deepEqual(documentato.avvisi, []);
  assert.deepEqual(documentato.note, []);
  for (const richiesto of ['medium', 'minimal']) {
    const result = preparaZai({ model: 'glm-5.3-flash', messages: [], reasoning_effort: richiesto });
    assert.equal(result.corpo.reasoning_effort, 'low', `livello ${richiesto}`);
    assert.deepEqual(result.avvisi, []);
    assert.match(result.note.join(' '), /sent "low", the nearest/u);
  }
});

test('BUG18-LIV-03 — i livelli documentati passano identici e senza frasi', () => {
  for (const richiesto of ['high', 'max']) {
    const result = preparaZai({ model: 'glm-5.3-flash', messages: [], reasoning_effort: richiesto });
    assert.equal(result.corpo.reasoning_effort, richiesto);
    assert.deepEqual(result.avvisi, []);
    assert.deepEqual(result.note, []);
  }
});

test('BUG18-LIV-04 — none su un modello che non si spegne: thinking forzato + floor al minimo documentato (gen.2 D3)', () => {
  /* Omettere il campo consegna la scelta al predefinito del fornitore = max (il PIÙ caro):
     la regola 24/09 impone il floor al minimo documentato (hermes auxiliary_reasoning_floor). */
  const result = preparaZai({ model: 'glm-5.3-flash', messages: [], reasoning: { effort: 'none' } });
  assert.equal(result.corpo.reasoning_effort, 'low');
  assert.deepEqual(result.corpo.thinking, { type: 'enabled' });
  assert.deepEqual(result.avvisi, []);
  assert.equal(result.note.length, 2);
  assert.match(result.note.join(' '), /cannot disable reasoning/u);
  assert.match(result.note.join(' '), /sent "low", the lowest documented level \(the provider default costs more\)/u);
});

test('BUG18-LIV-05 — none su un modello che SI spegne: thinking disattivato, nessun campo livello (verso contrario del floor)', () => {
  const result = preparaZai({ model: 'glm-4.6', messages: [], reasoning: { effort: 'none' } });
  assert.deepEqual(result.corpo.thinking, { type: 'disabled' });
  assert.equal(result.corpo.reasoning_effort, undefined);
  assert.deepEqual(result.avvisi, []);
  assert.deepEqual(result.note, []);
});

test('BUG18-LIV-06 — modello senza livelli documentati (glm-4.6): il livello resta non inviato e detto in nota', () => {
  const result = preparaZai({ model: 'glm-4.6', messages: [], reasoning_effort: 'xhigh' });
  assert.equal(result.corpo.reasoning_effort, undefined);
  assert.deepEqual(result.avvisi, []);
  assert.equal(result.note.length, 1);
  assert.match(result.note[0], /not sent/u);
});

test('BUG18-LIV-07 — modello ignoto al registro: la frase va in nota, senza inventare livelli', () => {
  const result = preparaZai({ model: 'glm-futuro', messages: [], reasoning_effort: 'high' });
  assert.equal(result.corpo.reasoning_effort, undefined);
  assert.deepEqual(result.avvisi, []);
  assert.equal(result.note.length, 1);
});

test('BUG18-LIV-08 — la scala: alias (una funzione sola), più debole prima, minimo di cura, nessuna invenzione', () => {
  /* Versi contrari del BUG-7 conservati (LIV-07): fuori scala, lista vuota o assente ⇒ null. */
  assert.equal(livelloRagionamentoPiuVicino('xhigh', ['high', 'max']), 'max', 'alias');
  assert.equal(livelloRagionamentoPiuVicino('medium', ['high', 'max']), 'high', 'minimo di cura');
  assert.equal(livelloRagionamentoPiuVicino('minimal', ['high', 'max']), 'high', 'minimo di cura');
  assert.equal(livelloRagionamentoPiuVicino('medium', ['low', 'high']), 'low', 'prima il più debole (BUG-18, 24/09)');
  assert.equal(livelloRagionamentoPiuVicino('high', ['high', 'max']), 'high');
  assert.equal(livelloRagionamentoPiuVicino('xhigh', []), null);
  assert.equal(livelloRagionamentoPiuVicino('xhigh', undefined), null);
  assert.equal(livelloRagionamentoPiuVicino('alto', ['high', 'max']), null, 'valore fuori scala: nessuna invenzione');
  assert.equal(livelloRagionamentoPiuVicino('xhigh', ['xhigh', 'max']), 'xhigh', 'documentato prima dell\'alias');
  assert.equal(livelloRagionamentoPiuVicino('max', ['xhigh', 'max']), 'max', 'documentato prima dell\'alias');
  /* L'alias è esportato a sé (una implementazione sola, anche per runtime-owner-adapter.mjs): */
  assert.equal(aliasGrafiaRagionamento('xhigh', ['low', 'high', 'max']), 'max');
  assert.equal(aliasGrafiaRagionamento('max', ['xhigh', 'high']), 'xhigh');
  assert.equal(aliasGrafiaRagionamento('xhigh', ['low', 'high']), null, 'senza il gemello l\'alias non inventa');
  assert.equal(aliasGrafiaRagionamento('medium', ['low', 'high', 'max']), null);
  assert.equal(aliasGrafiaRagionamento('xhigh', 'boh'), null);
  /* Il minimo è la funzione condivisa del floor (gen.2 D3): */
  assert.equal(livelloRagionamentoMinimo(['high', 'max', 'low']), 'low');
  assert.equal(livelloRagionamentoMinimo(['high', 'max']), 'high');
  assert.equal(livelloRagionamentoMinimo([]), null);
  assert.equal(livelloRagionamentoMinimo(undefined), null);
  assert.equal(livelloRagionamentoMinimo(['alto', 'high']), 'high', 'fuori scala ignorato');
});

test('BUG18-LIV-09 — groq senza «nome»: il clamp cita il modello, mai «undefined» (cura3 D3, testo ora in nota)', () => {
  const result = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: [], reasoning_effort: 'xhigh' });
  assert.equal(result.corpo.reasoning_effort, 'high');
  assert.deepEqual(result.avvisi, []);
  assert.equal(result.note.length, 1);
  assert.match(result.note[0], /openai\/gpt-oss-20b/u);
  assert.doesNotMatch(result.note.join(' '), /undefined/u);
});

test('BUG18-LIV-10 — «disattiva» rifiutato + livello in lista: il livello resta, una sola nota (cura3 D4)', () => {
  const result = preparaZai({ model: 'glm-5.3-flash', messages: [], reasoning_effort: 'high', thinking: { type: 'disabled' } });
  assert.equal(result.corpo.reasoning_effort, 'high');
  assert.deepEqual(result.corpo.thinking, { type: 'enabled' });
  assert.deepEqual(result.avvisi, []);
  assert.equal(result.note.length, 1, 'nessuna seconda nota sul livello');
  assert.match(result.note[0], /cannot disable/u);
  assert.doesNotMatch(result.note.join(' '), /il più vicino/u);
});

test('BUG18-LIV-11 — i livelli delle sessioni DIRETTE arrivano dal registro, non dal catalogo (cura3 D2)', () => {
  const mappa = livelliRagionamentoDiretti();
  assert.deepEqual(mappa.zai['*'], ['low', 'high', 'max'], 'BUG-18: il profilo documenta low (fonte docs.z.ai, 05/10)');
  assert.deepEqual(mappa.zai['glm-5.3-flash'], ['low', 'high', 'max']);
  assert.deepEqual(mappa.groq['openai/gpt-oss-20b'], ['low', 'medium', 'high']);
  assert.equal(mappa.openrouter, undefined, 'per OpenRouter la fonte resta il catalogo');
});

test('BUG18-LIV-12 — il record z.ai dichiara low/high/max con fonte e data (BUG-18)', () => {
  const flash = REGISTRO_FORNITORI.zai.modelliNoti.find(m => m.id === 'glm-5.3-flash');
  assert.deepEqual(flash.ragionamento.livelli, ['low', 'high', 'max']);
  /* La fonte+data vive a livello di PROFILO (è la fonte del dato, non del modello): */
  assert.deepEqual(REGISTRO_FORNITORI.zai.ragionamento.livelli, ['low', 'high', 'max']);
  assert.equal(REGISTRO_FORNITORI.zai.ragionamento.fonte, 'https://docs.z.ai/api-reference/llm/chat-completion');
  assert.equal(REGISTRO_FORNITORI.zai.ragionamento.data, '2026-10-05');
});

/* A9 (owner 09/10/2026, «la pillola mostra il livello INVIATO al fornitore»): che cosa arriva DAVVERO sul filo, livello per livello,
   misurato dal traduttore stesso. I tre casi trovati il 09/10 su r4, più la proprietà che la pillola usa. */
test('A9-FILO-01 — il filo di glm-5.3-flash: «xhigh» parte «max», «Off» parte «low», «medium» parte «low»', () => {
  const filo = filoRagionamentoDiretti();
  assert.deepEqual(filo.zai['glm-5.3-flash'], { none: 'low', minimal: 'low', low: 'low', medium: 'low', high: 'high', xhigh: 'max', max: 'max' });
  assert.equal(filo.xai['grok-4.3'].none, 'none', 'AL CONTRARIO: un modello che si spegne riceve davvero «none»');
  assert.equal(filo.openrouter, undefined, 'per OpenRouter la fonte resta il catalogo');
});

test('A9-FILO-02 — un modello Z.AI senza voce propria non riceve NESSUN livello: la voce «*» è tutta null', () => {
  const filo = filoRagionamentoDiretti();
  assert.deepEqual(new Set(Object.values(filo.zai['*'])), new Set([null]));
  assert.deepEqual(Object.keys(filo.zai['*']).sort(), ['high', 'low', 'max', 'medium', 'minimal', 'none', 'xhigh']);
});

test('A9-FILO-03 — per ogni modello con voce propria, i livelli che la pillola offre partono così come sono', () => {
  const livelli = livelliRagionamentoDiretti();
  const filo = filoRagionamentoDiretti();
  for (const [fonte, perModello] of Object.entries(livelli)) {
    for (const [modello, elenco] of Object.entries(perModello)) {
      if (modello === '*') continue;
      for (const livello of elenco) assert.equal(filo[fonte][modello][livello], livello, `${fonte}:${modello} ${livello}`);
    }
  }
});

test('A9-FILO-04 — la mappa è quella del traduttore: ricalcolata a mano su un caso, coincide', () => {
  const { corpo } = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: [], reasoning: { effort: 'xhigh' } });
  assert.equal(corpo.reasoning_effort, 'high');
  assert.equal(filoRagionamentoDiretti().groq['openai/gpt-oss-20b'].xhigh, 'high');
});

/* ⛔ A9, seguito OpenRouter (09/10/2026): l'owner usa `z-ai/glm-5.3-flash` VIA OPENROUTER, e la mappa A9 copriva solo le sessioni
   dirette. Voci copiate dal catalogo vivo del 4174 (`GET /api/v1/models`, 09/10/2026). */
const VOCI_CATALOGO = Object.freeze([
  { id: 'z-ai/glm-5.3-flash', reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', defaultEnabled: true, mandatory: true } },
  { id: 'openai/gpt-5-nano', reasoning: { supportedEfforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium', defaultEnabled: null, mandatory: true } },
  { id: 'anthropic/claude-opus-5', reasoning: { supportedEfforts: ['max', 'xhigh', 'high', 'medium', 'low'], defaultEffort: 'high', defaultEnabled: true, mandatory: false } },
  { id: 'deepseek/deepseek-chat' },
]);

test('A9-OR-01 — il filo OpenRouter di glm-5.3-flash: «Off» e «medium» partono «low», «xhigh» parte «max»', () => {
  const filo = filoRagionamentoCatalogo(VOCI_CATALOGO);
  assert.deepEqual(filo['z-ai/glm-5.3-flash'], { none: 'low', minimal: 'low', low: 'low', medium: 'low', high: 'high', xhigh: 'max', max: 'max', auto: 'max' });
  assert.deepEqual(filo['openai/gpt-5-nano'], { none: 'minimal', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high', auto: 'medium' });
});

test('A9-OR-02 — AL CONTRARIO: un modello che si spegne riceve «none», e una voce senza `reasoning` non ha mappa', () => {
  const filo = filoRagionamentoCatalogo(VOCI_CATALOGO);
  assert.equal(filo['anthropic/claude-opus-5'].none, 'none');
  assert.equal(filo['anthropic/claude-opus-5'].xhigh, 'xhigh');
  assert.equal(Object.hasOwn(filo, 'deepseek/deepseek-chat'), false);
  assert.deepEqual(filoRagionamentoCatalogo(undefined), {});
});

test('A9-OR-03 — la mappa è il clamp del fetch OpenRouter: ricalcolata livello per livello, coincide', () => {
  const filo = filoRagionamentoCatalogo(VOCI_CATALOGO);
  for (const voce of VOCI_CATALOGO.filter((v) => v.reasoning)) {
    for (const livello of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
      const atteso = normalizzaReasoningPerModello({ effort: livello }, voce)?.effort ?? null;
      assert.equal(filo[voce.id][livello], atteso, `${voce.id} ${livello}`);
    }
  }
});

test('A9-OR-04 — obbligatorio e senza elenco (OpenRouter: `supported_efforts` null = ogni livello accettato): «Off» non ha livello, null = decide il fornitore', () => {
  const filo = filoRagionamentoCatalogo([{ id: 'x/obbligato', reasoning: { mandatory: true, supportedEfforts: null } }]);
  assert.equal(filo['x/obbligato'].none, null);
  assert.equal(filo['x/obbligato'].high, 'high', 'AL CONTRARIO: un livello vero passa com’è');
});

/* Owner 09/10/2026 («Automatico + riga»): la mappa dice anche che cosa parte SENZA una scelta. */
test('A9-OR-AUTO — senza scelta: il predefinito di un modello obbligatorio parte (glm «max», nano «medium»); AL CONTRARIO un modello che si spegne non riceve niente', () => {
  const filo = filoRagionamentoCatalogo(VOCI_CATALOGO);
  assert.equal(filo['z-ai/glm-5.3-flash'].auto, 'max');
  assert.equal(filo['openai/gpt-5-nano'].auto, 'medium');
  assert.equal(filo['anthropic/claude-opus-5'].auto, null);
  for (const voce of VOCI_CATALOGO.filter((v) => v.reasoning)) {
    assert.equal(filo[voce.id].auto, normalizzaReasoningPerModello(null, voce)?.effort ?? null, `${voce.id}: lo stesso clamp`);
  }
});
