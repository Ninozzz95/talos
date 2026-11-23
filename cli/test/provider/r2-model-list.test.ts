/*
 * R2 lane K — gate E14 / E-03: `talos model list` printed a raw JSON array to a person. Human output is now one row per model
 * under English column names, the MODEL column being exactly what `talos model use` takes (OpenCode `opencode models` prints one
 * `provider/model` id per line and JSON only with --verbose: packages/opencode/src/cli/cmd/models.ts:36-46 at 1d6c3c0,
 * 2026-09-24). `--json` / `--output-format json` output is unchanged.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runModelCommand} from '../../src/commands/provider-cli.ts';

const ROWS=[
  {id:'openai:gpt-test',provider:'openai',name:'GPT test',source:'live',available:'live',availabilityVerified:true,contextWindow:400000,toolCalling:true,reasoning:true,reasoningEfforts:null,images:true,capabilityEvidence:{}},
  {id:'openai:manual',provider:'openai',name:'Manual',source:'configured',available:'configured',availabilityVerified:false,contextWindow:null,toolCalling:null,reasoning:false,reasoningEfforts:null,images:null,capabilityEvidence:{}},
];
function ctx(format:'text'|'json'){
  const out:string[]=[];
  const catalog={listModels:async()=>ROWS,providerModels:async(provider:string)=>({provider,label:'OpenAI',verified:false,notice:'Catalog from OpenAI: 1 live-verified; 1 configured/documented/unknown model is not verified as currently available.',rows:ROWS})};
  return{out,ctx:{invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:'/p',paths:{},repoRoot:'/repo',createRuntimeContext:async()=>({tuiCatalog:catalog})} as any};
}

test('E14: human model list is English columns, one row per model, no JSON',async()=>{
  const x=ctx('text');
  assert.equal(await runModelCommand(x.ctx,['list']),0);
  const lines=x.out.join('').split('\n').filter(Boolean);
  assert.match(lines[0]!,/^MODEL\s+CONTEXT\s+TOOLS\s+REASONING\s+AVAILABILITY$/u);
  assert.match(lines[1]!,/^openai:gpt-test\s+400K\s+yes\s+yes\s+live$/u);
  assert.match(lines[2]!,/^openai:manual\s+-\s+-\s+no\s+configured$/u);
  assert.equal(lines.at(-1),'Use one with: talos model use <MODEL>');
  assert.doesNotMatch(x.out.join(''),/[{}[\]"]/u,'no JSON for a person');
  assert.equal(lines[1]!.indexOf('400K'),lines[0]!.indexOf('CONTEXT'),'columns are aligned');
});

test('E14: model list --provider prints the catalog notice first, then the same columns',async()=>{
  const x=ctx('text');
  assert.equal(await runModelCommand(x.ctx,['list','--provider','openai']),0);
  const lines=x.out.join('').split('\n').filter(Boolean);
  assert.match(lines[0]!,/^Catalog from OpenAI: /u);
  assert.match(lines[1]!,/^MODEL\s+CONTEXT/u);
});

test('E14: JSON output is unchanged: the raw rows',async()=>{
  for(const args of [['list'],['list','--provider','openai']]){
    const x=ctx('json');
    assert.equal(await runModelCommand(x.ctx,args),0);
    assert.deepEqual(JSON.parse(x.out.join('')),ROWS);
  }
});
