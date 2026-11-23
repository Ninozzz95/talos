import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchCenterModel,renderResearchCenterLines,setResearchCenterDetail} from '../../src/tui/overlays/research-center.ts';

const snapshot:any={state:'ready',rows:[{id:'r1',question:'Unsafe\\u001b[31m question',status:'running'}],error:null};
const detail:any={id:'r1',question:'Unsafe\\u001b[31m question',status:'running',phase:'pause_requested',progress:{done:2,total:5},journal:{events:4,skippedRows:1},summary:'Summary',verification:{total:1,supported:0,partial:0,unsupported:0,unchecked:0,contested:1},sources:[{number:1,url:'https://source.example',title:'Source\\u202e title',publishedAt:null,obtained:'page'}],claims:[{number:1,text:'Claim',source:{number:1,url:'https://source.example',title:'Source\\u202e title',publishedAt:null,obtained:'page'},passage:'Passage\\u001b[2J',quotePresent:true,verification:'contested',reason:'opposed',judge:'judge:model',judgedAt:null,opposing:[]}],plan:[],steps:[],spent:null,expectedCost:null};

test('M10-A RED — Research Center renders phase/progress and explicit claim→source→passage evidence with inert terminal text',()=>{
  let model=createResearchCenterModel(snapshot,0);model=setResearchCenterDetail(model,detail);
  const text=renderResearchCenterLines(model).join('\n');
  assert.match(text,/pause_requested/u);assert.match(text,/2\/5/u);assert.match(text,/contested/u);assert.match(text,/Claim/u);assert.match(text,/https:\/\/source\.example/u);assert.match(text,/Passage/u);
  assert.doesNotMatch(text,/\x1b\[/u);assert.doesNotMatch(text,/\u202e/u);
});

test('M10-A RED — Research Center exposes explicit pause resume cancel export controls',()=>{
  const text=renderResearchCenterLines(setResearchCenterDetail(createResearchCenterModel(snapshot,0),detail)).join('\n');
  for(const label of ['pause','resume','cancel','export'])assert.match(text,new RegExp(label,'iu'));
});


test('M10-A hardening RED — untrusted evidence is control-safe and bounded per rendered terminal line',()=>{
  const hostile={...detail,claims:[{...detail.claims[0],text:'C'.repeat(5000),passage:'\x1b[2J'+'P'.repeat(5000)}]};
  const lines=renderResearchCenterLines(setResearchCenterDetail(createResearchCenterModel(snapshot,0),hostile));
  assert.equal(lines.some((line:string)=>line.includes('\x1b')),false);
  assert.ok(Math.max(...lines.map((line:string)=>line.length))<=800,'one source passage must not monopolize the terminal');
  assert.ok(lines.some((line:string)=>line.includes('…')),'bounded evidence should make truncation visible');
});
