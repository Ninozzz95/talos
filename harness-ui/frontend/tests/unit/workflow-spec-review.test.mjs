import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOW_SPEC_REVIEW_THEMES,
  WORKFLOW_SPEC_REVIEW_VIEWPORTS,
  WORKFLOW_SPEC_SCENE_NAMES,
  workflowSpecInspectionSessions,
  workflowSpecThemeFromLocation,
  workflowSpecUrl,
} from '../../lab/workflow-spec.js';

test('WF0A-BASELINE-01 usa soltanto le baseline owner 1080p e 1440p', () => {
  assert.deepEqual(WORKFLOW_SPEC_REVIEW_VIEWPORTS, [
    { name: '1080p', width: 1920, height: 1080 },
    { name: '1440p', width: 2560, height: 1440 },
  ]);
  assert.deepEqual(WORKFLOW_SPEC_REVIEW_THEMES, ['light', 'dark']);
  assert.equal(Object.isFrozen(WORKFLOW_SPEC_REVIEW_VIEWPORTS), true);
  assert.equal(Object.isFrozen(WORKFLOW_SPEC_REVIEW_THEMES), true);
  assert.equal(WORKFLOW_SPEC_REVIEW_VIEWPORTS.some(({ width, height }) => width === 1024 || height === 900), false);
});

test('WF0A-SESSIONS-01 crea una sessione di ispezione univoca per ogni scena', () => {
  const sessions = workflowSpecInspectionSessions();
  /* Integrazione 23/09: le scene sono quelle R4 (38 oggi, erano 23 in F0A). Il numero si DERIVA
     dall'elenco delle scene invece di restare scritto a mano, e resta vietato lo zero. */
  const attese = WORKFLOW_SPEC_SCENE_NAMES.length;
  assert.ok(attese >= 14, `troppe poche scene: ${attese}`);
  assert.equal(sessions.length, attese);
  assert.deepEqual(sessions.map(({ sceneId }) => sceneId), WORKFLOW_SPEC_SCENE_NAMES);
  assert.equal(new Set(sessions.map(({ sessionId }) => sessionId)).size, attese);
  assert.equal(new Set(sessions.map(({ nome }) => nome)).size, attese);
  for (const session of sessions) {
    assert.match(session.sessionId, /^wf0a-review:/);
    assert.equal(typeof session.nome, 'string');
    assert.equal(session.nome.trim().length > 0, true);
    assert.equal(session.modello, 'fixture/workflow-spec');
  }
});

test('WF0A-SESSIONS-02 URL e tema restano deterministici e fail-closed', () => {
  assert.equal(
    workflowSpecUrl({ sceneId: 'ask-single', theme: 'dark' }),
    '/?componente=WorkflowSpec&scena=ask-single&tema=dark',
  );
  assert.equal(
    workflowSpecThemeFromLocation({ search: '?componente=WorkflowSpec&tema=dark' }),
    'dark',
  );
  assert.equal(
    workflowSpecThemeFromLocation({ search: '?componente=WorkflowSpec&tema=system' }),
    'light',
  );
  assert.throws(
    () => workflowSpecUrl({ sceneId: 'workflow-inesistente', theme: 'light' }),
    /scena WorkflowSpec non valida/,
  );
});
