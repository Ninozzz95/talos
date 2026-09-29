import test from 'node:test';
import assert from 'node:assert/strict';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';

test('WF-BOARD-OUTPUTS-FULL-RAW-PAGE: client selects an exact result and pages every ref', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('/output?')) return { ok: true, status: 200, json: async () => ({ ok: true, data: {
      schema: 'talos.workflow-node-output.v1', resultId: 'r2', content: 'contenuto integrale', rawAvailable: true,
    } }) };
    if (url.includes('/versions/')) return { ok: true, status: 200, json: async () => ({ ok: true, data: { instructions: 'compito' } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, data: {
      nodeId: 'n1', outputs: [{ resultId: 'r21', bytes: 3, kind: 'text' }], totalOutputs: 21,
      nextOutputOffset: null,
    } }) };
  };
  const client = creaClientGrafo({ sessionId: 's1', fetchFn });
  const source = { tipo: 'run', runId: 'run1', workflowId: 'wf1', version: 1 };
  const second = await client.passo(source, 'n1', { outputOffset: 20 });
  assert.equal(second.outputs[0].resultId, 'r21');
  assert.ok(urls.some((url) => url.endsWith('/nodes/n1?outputOffset=20')));
  const result = await client.output(source, 'n1', 'r2');
  assert.equal(result.content, 'contenuto integrale');
  assert.ok(urls.some((url) => url.endsWith('/nodes/n1/output?resultId=r2')));
  assert.equal(client.outputRawUrl(source, 'n1', 'r2'), '/api/v1/sessions/s1/workflows/run1/nodes/n1/output?resultId=r2&format=raw');
});

test('WF-BOARD-OUTPUTS-EMBEDDED-API: raw link follows the configured backend origin', () => {
  const client = creaClientGrafo({ sessionId: 's1', fetchFn: async () => { throw new Error('unexpected'); },
    API: (path) => `http://127.0.0.1:4174${path}` });
  const source = { tipo: 'run', runId: 'run1', workflowId: 'wf1', version: 1 };
  assert.equal(client.outputRawUrl(source, 'n1', 'r2'),
    'http://127.0.0.1:4174/api/v1/sessions/s1/workflows/run1/nodes/n1/output?resultId=r2&format=raw');
});
