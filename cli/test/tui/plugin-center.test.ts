import assert from 'node:assert/strict';
import test from 'node:test';
import {createPluginCenterModel,movePluginCenterSelection,renderPluginCenterLines} from '../../src/tui/overlays/plugin-center.ts';

const row:any={
  id:'demo\u001b[2J',name:'Demo\nPlugin',description:'x',
  registry:{state:'loaded',code:null,message:null},
  provenance:{
    kind:'managed-extension',extension:{id:'demo',name:'Demo extension',version:'1.2.3'},
    packageCopy:'.talos-cli/extensions/demo/package',packageCopyPresent:true,
    recordedSource:'C:\\tmp\\gone\nsource',recordedSourceAvailable:false,recordedSourceAuthority:'advisory-only'
  },
  guard:{verdict:'dangerous',findings:[{severity:'dangerous',code:'REMOTE_PIPE_EXECUTION',origin:'run.js\u202e',message:'danger\nmessage'}],capabilities:['network','process']},
  trust:{projectTrusted:true,scopeTrusted:true,effectiveTrusted:false},
  fingerprints:{currentSetDigest:'current-123',trustedSetDigest:'trusted-456',changedPaths:['run.js'],addedPaths:[],removedPaths:[]},
  quarantine:{active:true,reason:'owner\nreview',quarantinedAt:'2026-09-21T10:00:00Z',reviewedFingerprint:'x'}
};

test('M8-C RED — Plugin Center renders provenance Guard fingerprint trust/revoke/quarantine as inert text',()=>{
  const lines=renderPluginCenterLines(createPluginCenterModel([row],0));
  const text=lines.join('\n');
  for(const token of ['Plugin','managed-extension','1.2.3','advisory-only','dangerous','REMOTE_PIPE_EXECUTION','current-123','trusted-456','quarantined'])assert.match(text,new RegExp(token,'u'));
  assert.equal(text.includes('\u001b'),false);
  assert.equal(text.includes('\u202e'),false);
  assert.equal(lines.some(line=>line.includes('danger\nmessage')||line.includes('owner\nreview')),false);
  assert.match(text,/cannot be trusted|trust blocked|dangerous/iu);
});

test('M8-C RED — Plugin Center selection is bounded',()=>{
  let model=createPluginCenterModel([{...row,id:'a'},{...row,id:'b'}],0);
  model=movePluginCenterSelection(model,1);assert.equal(model.selected,1);
  model=movePluginCenterSelection(model,99);assert.equal(model.selected,1);
  model=movePluginCenterSelection(model,-99);assert.equal(model.selected,0);
});

test('M8-C hardening RED — unavailable Guard is rendered as unavailable, never as “no findings”',()=>{
  const unavailable={...row,guard:null,registry:{state:'failed',code:'PLUGIN_MALFORMED',message:'bad package'}};
  const text=renderPluginCenterLines(createPluginCenterModel([unavailable],0)).join('\n');
  assert.match(text,/Guard: unavailable/u);
  assert.match(text,/Guard findings: unavailable/u);
  assert.doesNotMatch(text,/Guard findings: none/u);
});
