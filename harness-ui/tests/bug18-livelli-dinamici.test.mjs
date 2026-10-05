import assert from 'node:assert/strict';
import test from 'node:test';
import { livelloRagionamentoPiuVicino, preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { livelloRagionamentoSenzaSalire, normalizzaReasoningPerModello } from '../src/runtime-owner-adapter.mjs';
import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';

/* ⛔ BUG-18 (05/10/2026, owner): «dinamica per tutti i provider, non ingozzabile».
   UNA sola meccanica — alias canonico xhigh≡max, prima il più debole (Hermes
   reasoning_effort.py:120-160, regola owner 24/09 «mai più caro»), poi il minimo di cura
   (auxiliary_reasoning_floor.py: step up, non strip) — provata qui su TRE superfici diverse
   (profilo thinking zai, profilo richiestaCompatibile cerebras, capability OpenRouter).
   Le differenze stanno SOLO nei DATI del registro, mai in rami per fornitore.
   Priorità riferimenti: Claude → Hermes → pi/codex (memoria 75cd6a41). */

test('BUG18-SCALA-01 — alias canonico xhigh≡max in entrambe le direzioni, per chiunque', () => {
  assert.equal(livelloRagionamentoPiuVicino('xhigh', ['low', 'high', 'max']), 'max');
  assert.equal(livelloRagionamentoPiuVicino('max', ['low', 'medium', 'high', 'xhigh']), 'xhigh');
  assert.equal(livelloRagionamentoSenzaSalire('xhigh', ['max', 'high', 'low']), 'max');
  assert.equal(livelloRagionamentoSenzaSalire('max', ['xhigh', 'high']), 'xhigh');
  /* senza il gemello l'alias non inventa: resta la scala (il più debole). */
  assert.equal(livelloRagionamentoPiuVicino('xhigh', ['low', 'high']), 'high');
  assert.equal(livelloRagionamentoSenzaSalire('xhigh', ['high', 'low']), 'high');
});

test('BUG18-SCALA-02 — prima il più debole (mai più caro, 24/09), poi il minimo di cura', () => {
  /* medium fra low e high: il più debole — NON «high», come faceva il clamp pi-mono
     «prima verso l'alto» del BUG-7 (che rendeva più care le chiamate economiche). */
  assert.equal(livelloRagionamentoPiuVicino('medium', ['low', 'high']), 'low');
  assert.equal(livelloRagionamentoSenzaSalire('medium', ['low', 'high']), 'low');
  /* niente di più debole: il minimo supportato (step up, non strip, solo se obbligato). */
  assert.equal(livelloRagionamentoPiuVicino('minimal', ['high', 'max']), 'high');
  assert.equal(livelloRagionamentoSenzaSalire('minimal', ['high', 'medium']), 'medium');
  /* fuori scala o senza elenco: nessuna invenzione (null → il chiamante decide). */
  assert.equal(livelloRagionamentoPiuVicino('default', ['low', 'high']), null);
  assert.equal(livelloRagionamentoPiuVicino('high', []), null);
  assert.equal(livelloRagionamentoSenzaSalire('ultra', ['low', 'high']), null);
});

test('BUG18-GENERALE-01 — stessa meccanica sul profilo richiestaCompatibile (cerebras)', () => {
  /* gpt-oss-120b dichiara ['low','medium','high'] nel registro (nessun «max»): l'alias non
     scatta, il più debole sì, e la frase finisce nella NOTA, mai negli avvisi di chat. */
  const record = REGISTRO_FORNITORI.cerebras;
  assert.ok(record?.richiestaCompatibile, 'il profilo cerebras è richiestaCompatibile');
  const adattato = preparaRichiestaCompatibile('cerebras', { model: 'cerebras:gpt-oss-120b', reasoning_effort: 'xhigh' });
  assert.equal(adattato.corpo.reasoning_effort, 'high');
  assert.deepEqual(adattato.avvisi, [], 'BUG-18: la normalizzazione non parla in chat');
  assert.match(adattato.note.join(' '), /inviato «high»/u);
  const documentato = preparaRichiestaCompatibile('cerebras', { model: 'cerebras:gpt-oss-120b', reasoning_effort: 'medium' });
  assert.equal(documentato.corpo.reasoning_effort, 'medium');
  assert.deepEqual(documentato.avvisi, []);
  assert.deepEqual(documentato.note, [], 'livello documentato: nemmeno una nota');
});

test('BUG18-GENERALE-02 — capability OpenRouter: l\'alias vive anche sulla scala senza-salire', () => {
  const capability = { reasoning: { mandatory: true, supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max' } };
  assert.deepEqual(normalizzaReasoningPerModello({ effort: 'xhigh' }, capability), { effort: 'max' });
  assert.deepEqual(normalizzaReasoningPerModello({ effort: 'medium' }, capability), { effort: 'low' });
  const soloXhigh = { reasoning: { mandatory: true, supportedEfforts: ['xhigh', 'high'], defaultEffort: 'xhigh' } };
  assert.deepEqual(normalizzaReasoningPerModello({ effort: 'max' }, soloXhigh), { effort: 'xhigh' });
});
