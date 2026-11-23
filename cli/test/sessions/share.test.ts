import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSafeSessionShare,SESSION_SHARE_SCHEMA,writeSafeSessionShare} from '../../src/sessions/share.ts';

test('M6-B safe share is a new redacted schema and never copies private workspace fields',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'talos-session-share-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const summary:any={id:'s1',sessionId:'s1',name:'Review /Users/Alice/My Project/private.txt',project:'talos',path:'/home/alice/private/talos',model:'openai:gpt-5-mini',parentId:'parent',depth:1,delegatedTask:'inspect \\\\server\\team share\\private.txt',forkedFrom:'fork',startedAt:'2026-09-20T10:00:00Z',updatedAt:'2026-09-20T11:00:00Z',endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:{pending:true,requestId:'r1',waitingMs:1},collisions:[{path:'/home/alice/private/talos/a.ts',beforeSessionId:'a',afterSessionId:'b'}],delegationOutcome:'completed',delegationEvidence:null};
  const payload={schema:'talos.harness-ui.session-export.v1',sessionId:'s1',projectRoot:'/home/alice/private/talos',cartella:'C:\\Users\\alice\\private',eventi:[
    {type:'TextMessageContent',delta:'read /home/alice/private/talos/a.ts token=supersecret'},
    {type:'ToolCallStart',arguments:{path:'C:\\Users\\alice\\private\\b.txt',authorization:'Bearer hidden',apiKey:'supersecret'}},
    {type:'TextMessageContent',delta:'copy \\\\server\\team share\\private.txt then see https://example.com/docs'},
    {type:'ApprovalRequested',requestId:'r1'},
  ]};
  const share=buildSafeSessionShare({summary,metadata:{schema:'talos.cli.session-metadata.v1',sessionId:'s1',tags:['release'],pinned:true,createdAt:'2026-09-20T09:00:00Z',updatedAt:'2026-09-20T09:30:00Z'},payload,secrets:['supersecret','Bearer hidden']});
  assert.equal(share.schema,SESSION_SHARE_SCHEMA);assert.equal(share.redacted,true);assert.equal(share.session.project,'talos');
  assert.equal(share.session.name,'[REDACTED_PATH]');assert.equal(share.session.delegatedTask,'[REDACTED_PATH]');
  assert.deepEqual(share.session.tags,['release']);assert.equal(share.session.pinned,true);
  const text=JSON.stringify(share);
  for(const forbidden of ['/home/alice/private/talos','/Users/Alice/My Project/private.txt','C:\\Users\\alice\\private','\\\\server\\team share\\private.txt','supersecret','Bearer hidden','projectRoot','cartellaBase'])assert.equal(text.includes(forbidden),false,forbidden);
  assert.equal(share.events.some((event:any)=>event?.type==='ApprovalRequested'),false);
  const out=join(dir,'share.json');await writeSafeSessionShare(out,share);
  const written=await readFile(out,'utf8');assert.match(written,/talos\.cli\.session-share\.v1/u);assert.match(written,/REDACTED/u);
  if(process.platform!=='win32')assert.equal((await stat(out)).mode&0o077,0);
});


test('M6-B safe share writer rejects unredacted paths and pending approvals even from direct callers',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'talos-session-share-invalid-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const base:any={schema:SESSION_SHARE_SCHEMA,redacted:true,createdAt:'2026-09-20T10:00:00Z',session:{id:'s1',name:'safe',project:null,model:null,parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'completed',interrupted:false,usage:null,delegationOutcome:null,delegationEvidence:null,tags:[],pinned:false},events:[]};
  await assert.rejects(()=>writeSafeSessionShare(join(dir,'path.json'),{...base,events:[{type:'TextMessageContent',delta:'read /private/work/file.txt'}]}),(error:any)=>error?.code==='SESSION_SHARE_INVALID');
  await assert.rejects(()=>writeSafeSessionShare(join(dir,'approval.json'),{...base,events:[{type:'ApprovalRequested',requestId:'r1'}]}),(error:any)=>error?.code==='SESSION_SHARE_INVALID');
});
