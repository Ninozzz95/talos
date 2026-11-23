import assert from 'node:assert/strict';
import test from 'node:test';
import {createMcpCenterModel,moveMcpCenterSelection,renderMcpCenterLines} from '../../src/tui/overlays/mcp-center.ts';

const row:any={
  id:'alpha\u001b[2J',
  trust:{projectTrusted:true,state:'changed',trusted:false,currentFingerprint:'current-123',trustedFingerprint:'trusted-456',changed:true},
  permission:{configuredAllowlist:['ping'],effectiveTools:['ping'],missingAllowlistedTools:[],perCallApproval:'not-applied'},
  health:{state:'degraded',checkedAt:'2026-09-21T10:00:00.000Z',latencyMs:12,phase:null,message:'tool mismatch\nnext'},
  server:{name:'demo',version:'1.2.3'},
  protocol:{version:'2026-07-28',era:'modern'},
  capabilities:{tools:true,resources:false,prompts:true,logging:true,completions:false,experimental:['vendor']},
  logs:[{source:'stderr',level:'stderr',text:'safe log'}]
};

test('M8-A RED — MCP center renders health trust fingerprint capabilities logs and truthful permissions as inert text',()=>{
  const model=createMcpCenterModel([row],0);
  const lines=renderMcpCenterLines(model);
  const text=lines.join('\n');
  for(const token of ['MCP','degraded','current-123','trusted-456','Capabilities','Permissions','not-applied','Logs','safe log'])assert.match(text,new RegExp(token,'u'));
  assert.equal(text.includes('\u001b'),false,'raw ESC must not reach terminal output');
  assert.equal(lines.some(line=>line.includes('tool mismatch\nnext')),false,'embedded line breaks must be neutralized');
});

test('M8-A RED — MCP center selection remains bounded for keyboard navigation',()=>{
  let model=createMcpCenterModel([{...row,id:'a'},{...row,id:'b'}],0);
  model=moveMcpCenterSelection(model,1);assert.equal(model.selected,1);
  model=moveMcpCenterSelection(model,10);assert.equal(model.selected,1);
  model=moveMcpCenterSelection(model,-10);assert.equal(model.selected,0);
});
