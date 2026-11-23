import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  ATTACHMENT_MAX_COUNT,IMAGE_ATTACHMENT_MAX_BYTES,IMAGE_ATTACHMENTS_MAX_BYTES,
  TEXT_ATTACHMENT_MAX_BYTES,TEXT_ATTACHMENTS_MAX_BYTES,
  renderPromptWithAttachments,validateCliAttachments,type CliAttachment,
} from '../../src/runtime/attachments.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const image:CliAttachment={kind:'image',path:'image.png',mimeType:'image/png',bytes:png.length,dataBase64:png.toString('base64')};
const text:CliAttachment={kind:'text',path:'notes.txt',mimeType:'text/plain',bytes:5,text:'hello'};

test('M3-C attachment budgets are explicit and validation is fail closed',()=>{
  assert.deepEqual(
    {count:ATTACHMENT_MAX_COUNT,textItem:TEXT_ATTACHMENT_MAX_BYTES,textTotal:TEXT_ATTACHMENTS_MAX_BYTES,imageItem:IMAGE_ATTACHMENT_MAX_BYTES,imageTotal:IMAGE_ATTACHMENTS_MAX_BYTES},
    {count:10,textItem:256*1024,textTotal:1024*1024,imageItem:5*1024*1024,imageTotal:12*1024*1024},
  );
  assert.equal(validateCliAttachments([text,image]).length,2);
  assert.throws(()=>validateCliAttachments(Array.from({length:11},()=>text)),(error:any)=>error?.code==='ATTACHMENT_COUNT_LIMIT');
  assert.throws(()=>validateCliAttachments([{...text,bytes:4}]),(error:any)=>error?.code==='ATTACHMENT_INVALID');
  assert.throws(()=>validateCliAttachments([{...image,mimeType:'image/jpeg'} as any]),(error:any)=>error?.code==='ATTACHMENT_IMAGE_SIGNATURE');
});

test('M3-C text attachments remain structured until the runtime boundary and retain provenance',()=>{
  const rendered=renderPromptWithAttachments('review @notes.txt',[text]);
  assert.match(rendered,/review @notes\.txt/u);
  assert.match(rendered,/TALOS project reference: notes\.txt/u);
  assert.match(rendered,/hello/u);
});

test('M3-C facade materializes accepted images and passes existing registry image references',async()=>{
  const calls:any[]=[];const materialized:any[]=[];
  const registry:any={
    ripristina:async()=>({}),
    avviaLibero:(input:any)=>{calls.push(input);return{sessionId:'s1'};},
    elenca:()=>[{sessionId:'s1',modello:'openai:vision'}],
    resume:(id:string,prompt:string|null,images:any[])=>{calls.push({id,prompt,images});return{sessionId:id};},
    iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({}),
  };
  const runtime=createSessionFacade(registry,{
    model:'openai:vision',
    modelImageCapability:async model=>model==='openai:vision',
    materializeImage:async attachment=>{materialized.push(attachment);return{id:'a'.repeat(64),tipo:'immagine',nome:attachment.path,mimeType:attachment.mimeType,byte:attachment.bytes};},
  });
  await runtime.start({projectRoot:'/repo',prompt:'inspect',model:'openai:vision',permissionMode:'default',attachments:[text,image]});
  assert.equal(materialized.length,1);
  assert.match(calls[0].consegna,/TALOS project reference: notes\.txt/u);
  assert.equal(calls[0].immagini[0].id,'a'.repeat(64));
  await runtime.resume('s1','again',[image]);
  assert.equal(calls[1].images[0].id,'a'.repeat(64));
});

test('M3-C facade rejects image input before materialization or registry dispatch unless capability is affirmative',async()=>{
  let materialized=0,started=0;
  const registry:any={ripristina:async()=>({}),avviaLibero:()=>{started++;return{sessionId:'s'};},iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({})};
  for(const capability of [false,null] as const){
    const runtime=createSessionFacade(registry,{model:'openai:text',modelImageCapability:async()=>capability,materializeImage:async()=>{materialized++;return{};}});
    await assert.rejects(()=>runtime.start({projectRoot:'/repo',prompt:'look',model:'openai:text',permissionMode:'default',attachments:[image]}),(error:any)=>error?.code==='MODEL_IMAGE_UNSUPPORTED');
  }
  assert.equal(materialized,0);assert.equal(started,0);
});

test('M3-C composition wires the existing chat-image store into owner runtime and facade without kernel edits',async()=>{
  const source=await readFile(new URL('../../src/runtime/talos-composition.ts',import.meta.url),'utf8');
  assert.match(source,/createChatImageStore/u);
  assert.match(source,/resolveImagesFn/u);
  assert.match(source,/materializeImage/u);
  assert.match(source,/modelImageCapability/u);
});
