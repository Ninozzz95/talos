import assert from 'node:assert/strict';
import test from 'node:test';
import {inertProjectTrustText,nextProjectTrustSelection,projectTrustPromptModel} from '../../src/tui/project-trust-prompt.ts';

function assessment(reason:any='PROJECT_UNTRUSTED'){
  return{
    trusted:false,
    reason,
    workspace:{requestedRoot:'/tmp/project',canonicalRoot:'/tmp/project',gitRoot:null,nestedRepository:false,identityHash:'workspace'},
    resources:[{workspaceIdentityHash:'workspace',kind:'context',id:'AGENTS.md',relativePath:'AGENTS.md',fingerprint:'abc'}],
  } as any;
}

test('project trust prompt is fail-closed by default and needs an explicit move to trust',()=>{
  const model=projectTrustPromptModel({assessment:assessment(),nestedRepositories:[]});
  assert.equal(model.defaultSelection,'no');
  assert.equal(nextProjectTrustSelection('no','previous'),'once');
  assert.equal(nextProjectTrustSelection('once','previous'),'trust');
  assert.equal(nextProjectTrustSelection('no','next'),'no','the arrows stop at the ends');
  assert.equal(nextProjectTrustSelection('no','toggle'),'trust','Tab wraps around');
});

test('changed snapshots are described as changes, never as tampering',()=>{
  const model=projectTrustPromptModel({assessment:assessment('RESOURCE_FINGERPRINT_CHANGED'),nestedRepositories:[]});
  assert.match(model.reason,/snapshot changed|file .* changed/u);
  assert.doesNotMatch(model.reason,/tamper|attack|compromis/iu);
});

test('project and nested repository paths are rendered inert',()=>{
  const badProject='/tmp/project\u001b[2J\u202ehidden';
  const badNested='vendor\u0007repo\u2066';
  const value=assessment();
  value.workspace={...value.workspace,canonicalRoot:badProject,requestedRoot:badProject};
  const model=projectTrustPromptModel({assessment:value,nestedRepositories:[{relativePath:badNested,root:'/tmp/vendor',resources:['AGENTS.md']}]});
  assert.equal(model.project.includes('\u001b'),false);
  assert.equal(model.project.includes('\u202e'),false);
  assert.equal(model.nestedRepositories[0]!.includes('\u0007'),false);
  assert.match(model.project,/\\u001b/u);
  assert.match(model.project,/\\u202e/u);
  assert.match(model.nestedRepositories[0]!,/\\u0007/u);
  assert.equal(inertProjectTrustText('plain/path'),'plain/path');
});
