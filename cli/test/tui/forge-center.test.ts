import test from 'node:test';
import assert from 'node:assert/strict';
import {createForgeCenterModel,renderForgeCenterLines,setForgeCenterDetail} from '../../src/tui/overlays/forge-center.ts';

test('M10-C RED — Forge Center renders active revision, enabled state, evidence and rollback history with bounded inert text',()=>{
  const snapshot:any={state:'ready',rows:[{id:'safe-tool',title:'Bad\x1b[2J title',enabled:false,ownerRevision:2,risk:'R2'}],error:null};
  const detail:any={...snapshot.rows[0],versions:[{revision:1},{revision:2}],evidence:{packageDigest:'a'.repeat(64),sideEffects:false,sandbox:{kind:'declarative-fake-capability-boundary'}},scan:{ok:true,capabilities:['notes.create'],actions:['write'],findings:[]}};
  const lines=renderForgeCenterLines(setForgeCenterDetail(createForgeCenterModel(snapshot,0),detail));
  const text=lines.join('\n');for(const token of ['revision 2','disabled','notes.create','sideEffects false','revision 1'])assert.match(text,new RegExp(token,'iu'));
  assert.doesNotMatch(text,/\x1b\[/u);assert.ok(Math.max(...lines.map((line:string)=>line.length))<=800);
});

test('M10-C RED — Forge Center exposes enable/disable and rollback as explicit owner controls, never auto-enables install',()=>{
  const snapshot:any={state:'ready',rows:[{id:'safe-tool',title:'Safe',enabled:false,ownerRevision:2,risk:'R1'}],error:null};
  const text=renderForgeCenterLines(createForgeCenterModel(snapshot,0)).join('\n');
  for(const token of ['enable','disable','rollback'])assert.match(text,new RegExp(token,'iu'));
  assert.doesNotMatch(text,/auto.?enable/iu);
});
