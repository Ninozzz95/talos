import assert from 'node:assert/strict';
import test from 'node:test';

import { ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { WORKFLOW_DRAFT_INPUT_SCHEMA } from '../src/workflow/draft-compiler.mjs';

/*
 * ⭐ F3-11b (24/09/2026 notte) — era `tests/red/workflow-model-tool-shape-red.test.mjs`, rossa dal 23/09 (0/1): lo schema
 * annunciava `core: {type:'object'}` senza proprietà e il GLM indovinava un altro contratto. Decisione owner 40: al modello si
 * annuncia solo la BOZZA corta, che il server compila. Ora è nella suite ordinaria.
 */
const attrezzo = () => ATTREZZI_ESTESI_OPENAI.find((entry) => entry.function?.name === 'workflow_plan_propose');

test('WF-GLM-TOOL-SCHEMA-NESTED: Workflow proposal tool advertises phases and node IDs to the model', () => {
  const tool = attrezzo();
  assert.ok(tool, 'root Plan/Workflow proposal tool must exist');
  const schema = tool.function.parameters;
  const proposal = schema?.properties?.draft ?? schema?.properties?.core;
  assert.equal(proposal?.type, 'object');
  assert.ok(proposal.properties, 'bare core:{type:object} leaves the real GLM guessing a different contract');
  assert.equal(proposal.properties.phases?.type, 'array');
  assert.equal(proposal.properties.phases?.items?.properties?.id?.type, 'string');
  assert.equal(proposal.properties.nodes?.type, 'array');
  assert.equal(proposal.properties.nodes?.items?.properties?.id?.type, 'string');
});

test('WF-DRAFT-SCHEMA-PARITY: lo schema che il kernel annuncia è IDENTICO a quello che il compilatore accetta', () => {
  const schema = attrezzo().function.parameters;
  // il kernel non importa da src/workflow (è condiviso col mobile): la copia si controlla qui, campo per campo
  assert.deepEqual(schema.properties.draft, JSON.parse(JSON.stringify(WORKFLOW_DRAFT_INPUT_SCHEMA)));
  assert.deepEqual(schema.required, ['draft'], 'al modello si annuncia SOLO la bozza (decisione 40)');
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties, 'core'), false, '`core` resta per le prove e le API interne, non si annuncia');
});

test('WF-DRAFT-SCHEMA-SAYS-INPUTS: the model is told that a step receives the answers of the steps it depends on (owner 25/09)', async () => {
  const { WORKFLOW_DRAFT_SCHEMA_MODELLO } = await import('../src/kernel/talosHarness.mjs');
  const dependsOn = WORKFLOW_DRAFT_SCHEMA_MODELLO.properties.nodes.items.properties.dependsOn.description;
  assert.match(dependsOn, /receives their final answers, as snapshots of up to 4,096 characters each/u);
});
