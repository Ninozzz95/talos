import test from 'node:test';
import assert from 'node:assert/strict';
import {nextOllamaMessage} from '../../e2e/fake-provider.mjs';
const shell={type:'function',function:{name:'shell',parameters:{type:'object',properties:{comando:{type:'string'}},required:['comando']}}};
function body(toolResults:number){const messages:any[]=[{role:'user',content:'CODING_E2E read edit test'}];for(let i=0;i<toolResults;i++)messages.push({role:'tool',content:'ok'});return{messages,tools:[shell]};}
test('coding fixture drives read write test then final answer through provided shell schema',()=>{const a:any=nextOllamaMessage(body(0));assert.match(a.message.tool_calls[0].function.arguments.comando,/Get-Content/u);const b:any=nextOllamaMessage(body(1));assert.match(b.message.tool_calls[0].function.arguments.comando,/Set-Content/u);const c:any=nextOllamaMessage(body(2));assert.match(c.message.tool_calls[0].function.arguments.comando,/TEST_OK/u);const d:any=nextOllamaMessage(body(3));assert.equal(d.message.content,'CODING_E2E_OK');});
test('coding fixture fails visibly rather than pretending success when shell is not offered',()=>{const x:any=nextOllamaMessage({messages:[{role:'user',content:'CODING_E2E'}],tools:[]});assert.equal(x.message.content,'CODING_E2E_MISSING_SHELL');});
