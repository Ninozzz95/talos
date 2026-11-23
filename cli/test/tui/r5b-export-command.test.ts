/* R5b D1 (owner decision Q-R5-12): `/export [md|json|jsonl] [file]` in the TUI — Markdown by default, a file named after
   the session in the project folder, the person's messages kept (sessions/export-format.ts), and `talos session export
   --format md` writes the same Markdown. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {exportSession,parseExportArgs} from '../../src/tui/session-export.ts';
import {runSessionCommand} from '../../src/commands/session-cli.ts';

const payload={schema:'talos.harness-ui.session-export.v1',sessionId:'0f3c9a12-aaaa-bbbb-cccc-1234567890ab',eventi:[
  {type:'RunStarted',runId:'r1',input:{consegna:'what is in src?'}},
  {type:'TextMessageStart',messageId:'a1',role:'assistant'},{type:'TextMessageContent',messageId:'a1',delta:'Two files.'},{type:'TextMessageEnd',messageId:'a1'},
]};

test('R5b /export: arguments — format and file in any order, md by default, anything else refused',()=>{
  assert.deepEqual(parseExportArgs([]),{format:'md',file:null});
  assert.deepEqual(parseExportArgs(['json']),{format:'json',file:null});
  assert.deepEqual(parseExportArgs(['notes/chat.md']),{format:'md',file:'notes/chat.md'});
  assert.deepEqual(parseExportArgs(['jsonl','out.jsonl']),{format:'jsonl',file:'out.jsonl'});
  assert.equal(parseExportArgs(['pdf']).format,null,'an unknown format is refused, not guessed');
});

test('R5b /export: writes a Markdown file named after the session in the project, with the person\'s messages',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5b-export-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const runtime={export:(id:string)=>id===payload.sessionId?payload:null};
  const done=await exportSession({runtime,sessionId:payload.sessionId,projectRoot:root,args:[],now:new Date('2026-09-25T10:30:00Z'),secrets:[]});
  assert.equal(done.format,'md');
  assert.match(done.path,/talos-session-0f3c9a12-20260925-1030\.md$/u);
  const md=await readFile(done.path,'utf8');
  assert.match(md,/## You\n\nwhat is in src\?/u);assert.match(md,/Two files\./u);
  const json=await exportSession({runtime,sessionId:payload.sessionId,projectRoot:root,args:['json','x/chat.json'],now:new Date(),secrets:[]});
  assert.equal(JSON.parse(await readFile(json.path,'utf8')).sessionId,payload.sessionId);
  await assert.rejects(exportSession({runtime,sessionId:null,projectRoot:root,args:[],now:new Date(),secrets:[]}),/SESSION_NOT_FOUND/u);
});

test('R5b D1: talos session export --format md keeps the person\'s messages too',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5b-export-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const registry={ripristina:async()=>({}),elenca:()=>[{sessionId:payload.sessionId,conclusa:true}],esporta:(id:string)=>id===payload.sessionId?payload:null};
  const ctx={invocation:{outputFormat:'json'},io:{writeOut(){},writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,paths:{dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions')},repoRoot:root,createRuntimeContext:async()=>({registry,runtime:{}})} as any;
  const out=join(root,'s.md');
  await runSessionCommand(ctx,['export',payload.sessionId,'--format','md','--out',out]);
  assert.match(await readFile(out,'utf8'),/## You\n\nwhat is in src\?/u);
});
