import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSessionCommand} from '../../src/commands/session-cli.ts';

function summary(id:string,name:string,project:string,updatedAt:string){return{id,sessionId:id,name,project,path:null,model:'openai:gpt-5-mini',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:updatedAt,updatedAt,endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null};}
function fixture(root:string){
  const out:string[]=[];const summaries=[summary('s1','Release work','talos','2026-09-20T10:00:00Z'),summary('s2','Other','other','2026-09-20T11:00:00Z')];
  const registry={esporta:(id:string)=>id==='s1'?{schema:'talos.harness-ui.session-export.v1',sessionId:id,projectRoot:'/home/alice/private/talos',eventi:[{type:'TextMessageContent',delta:'read /home/alice/private/talos/a.ts'},{type:'ToolCallStart',token:'secret-value'}]}:null};
  const runtime={restore:async()=>({restored:0,total:0}),listSessions:async()=>summaries,resume:async(id:string)=>id};
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,paths:{dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions')},repoRoot:root,createRuntimeContext:async()=>({registry,runtime})};
  return{out,ctx};
}

test('M6-B session CLI supports tag/untag/pin/unpin/search and surfaces the same metadata on list',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-session-cli-meta-'));t.after(()=>rm(root,{recursive:true,force:true}));const x=fixture(root);
  await runSessionCommand(x.ctx,['tag','s1',' Release ']);await runSessionCommand(x.ctx,['pin','s1']);
  x.out.length=0;await runSessionCommand(x.ctx,['search','release']);const search=JSON.parse(x.out.at(-1)!);assert.deepEqual(search.map((row:any)=>row.id),['s1']);assert.deepEqual(search[0].tags,['release']);assert.equal(search[0].pinned,true);
  x.out.length=0;await runSessionCommand(x.ctx,['list']);const listed=JSON.parse(x.out.at(-1)!);assert.equal(listed.find((row:any)=>row.id==='s1').pinned,true);
  await runSessionCommand(x.ctx,['untag','s1','RELEASE']);await runSessionCommand(x.ctx,['unpin','s1']);
  x.out.length=0;await runSessionCommand(x.ctx,['show','s1']);const shown=JSON.parse(x.out.at(-1)!);assert.deepEqual(shown.tags,[]);assert.equal(shown.pinned,false);
});

test('M6-B session share writes the redacted share schema while raw export remains a separate operation',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-session-cli-share-'));t.after(()=>rm(root,{recursive:true,force:true}));const x=fixture(root);
  const out=join(root,'share.json');await runSessionCommand(x.ctx,['share','s1','--out',out]);
  const share=JSON.parse(await readFile(out,'utf8'));assert.equal(share.schema,'talos.cli.session-share.v1');assert.equal(share.redacted,true);
  const text=JSON.stringify(share);assert.equal(text.includes('/home/alice/private/talos'),false);assert.equal(text.includes('secret-value'),false);
  const raw=join(root,'raw.json');await runSessionCommand(x.ctx,['export','s1','--out',raw]);
  assert.match(await readFile(raw,'utf8'),/\/home\/alice\/private\/talos/u);
  if(process.platform!=='win32')assert.equal((await stat(raw)).mode&0o077,0);
});
