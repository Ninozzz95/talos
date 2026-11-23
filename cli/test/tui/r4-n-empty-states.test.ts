/*
 * R4 lane N — Q-R4-13 (lane N part): every list lane N draws says when it is empty, with the next step, and /status is a
 * small titled block that names the permission mode in words (Q-R4-12). Competitors: Claude Code "No conversations found
 * in this project.", Codex "No sessions yet", Pi "No sessions in current folder" (gate §5.2).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {sessionPickerOverlay} from '../../src/tui/overlays/session-picker.ts';
import {fitOverlay} from '../../src/tui/overlays/scroll-window.ts';
import {sessionStatusText} from '../../src/tui/shell-model.ts';

const body=(content:Parameters<typeof fitOverlay>[0])=>fitOverlay(content,{maxRows:12,columns:80}).rows.filter(row=>row.role==='body');

test('R4-N the empty resume and fork pickers say there is nothing to resume, and how to start',()=>{
  for(const action of ['resume','fork'] as const){
    const rows=body(sessionPickerOverlay({action,query:'',rows:[],selected:0}));
    assert.equal(rows.length,1);
    assert.match(rows[0]!.text,/^No saved sessions for this folder yet\./u);
    assert.match(rows[0]!.text,/send a message/iu);
    assert.equal(rows[0]!.tone,'dim');
  }
  const filtered=body(sessionPickerOverlay({action:'resume',query:'deploy',rows:[],selected:0}));
  assert.deepEqual(filtered.map(row=>row.text),['No sessions match "deploy"']);
});

test('R4-N /status is a titled block with the mode in words and an honest empty session line',()=>{
  const idle=sessionStatusText({session:null,running:false,model:'none · /provider',mode:'default',tools:0});
  assert.deepEqual(idle.split('\n'),[
    'Status',
    '  session  none yet — it starts with your first message',
    '  running  no',
    '  model    none · /provider',
    '  mode     manual · Shift+Tab cycle',
    '  tools    0 calls so far',/* UI Phase 0 D22: the count says what it counts */
  ]);
  const busy=sessionStatusText({session:'abc123',running:true,model:'ollama:qwen3-coder-test',mode:'bypassPermissions',tools:2});
  assert.match(busy,/^  session  abc123$/mu);
  assert.match(busy,/^  running  yes$/mu);
  assert.match(busy,/^  mode     Full access · Shift\+Tab cycle$/mu);
});
