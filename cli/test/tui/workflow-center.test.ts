import assert from 'node:assert/strict';
import test from 'node:test';
import {createWorkflowCenterModel,moveWorkflowCenterSelection,renderWorkflowCenterLines} from '../../src/tui/overlays/workflow-center.ts';

const row:any={
  id:'project:verify\u001b[2J',kind:'workflow',name:'verify',description:'Verify\nwork',
  provenance:{scope:'project-command',path:'.talos-cli/commands/verify.md\u202e'},
  validation:{valid:false,code:'WORKFLOW_COMMAND_NOT_FOUND',message:'missing\ncommand'},
  trust:{required:true,trusted:false,state:'changed',currentFingerprint:'current-123',trustedFingerprint:'trusted-456'},
  executableSteps:1,references:[{type:'command',name:'build',id:null}]
};

test('M8-D RED — Workflow Center renders typed provenance validation trust and executable-step state as inert text',()=>{
  const text=renderWorkflowCenterLines(createWorkflowCenterModel([row],0)).join('\n');
  for(const token of ['Workflow','workflow','project-command','WORKFLOW_COMMAND_NOT_FOUND','changed','current-123','trusted-456','executable steps: 1'])assert.match(text,new RegExp(token,'iu'));
  assert.equal(text.includes('\u001b'),false);assert.equal(text.includes('\u202e'),false);
  assert.equal(text.includes('Verify\nwork'),false);assert.equal(text.includes('missing\ncommand'),false);
});

test('M8-D RED — Workflow Center selection is bounded',()=>{
  let model=createWorkflowCenterModel([{...row,id:'a'},{...row,id:'b'}],0);
  model=moveWorkflowCenterSelection(model,1);assert.equal(model.selected,1);
  model=moveWorkflowCenterSelection(model,99);assert.equal(model.selected,1);
  model=moveWorkflowCenterSelection(model,-99);assert.equal(model.selected,0);
});
