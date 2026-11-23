import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {contextEngineHostOptions} from '../../src/runtime/context-engine-options.ts';

/* Alignment with the Desktop (form of 05/11/2026, OK from the Desktop at 13:55): the CLI builds the Context Engine with the same four
   host values the Desktop passes (harness-ui/src/context-runtime.mjs:195). Without `isPersonRequest` the engine counts every user
   message as the person's, a kernel note included, so the request in progress could start at a note and the outputs before it
   lose the 31/10 protection. */
/* the repository root: the first folder above the working one that holds harness-ui (also from a mutants' copy inside cli/) */
let repo=join(process.cwd(),'..');while(!existsSync(join(repo,'harness-ui','src'))&&dirname(repo)!==repo)repo=dirname(repo);
const runtime=await import(pathToFileURL(join(repo,'harness-ui','src','context-runtime.mjs')).href);
const compaction=await import(pathToFileURL(join(repo,'harness-ui','src','kernel','compattazione-desktop.mjs')).href);
const options=contextEngineHostOptions({runtime,compaction});

test('a kernel note is not the person’s request; the person’s message is', ()=>{
  assert.equal(options.isPersonRequest({role:'user',content:'[TALOS] the copy you were reading was discarded.'}),false);
  assert.equal(options.isPersonRequest({role:'user',content:'You just executed tool calls but returned an empty response. Continue.'}),false);
  assert.equal(options.isPersonRequest({role:'user',content:'Read the four big files.'}),true);
  assert.equal(options.isPersonRequest({role:'assistant',content:'Done.'}),false);
});

test('the cleared output and the summary say how to read it again, with the Desktop’s own words', ()=>{
  assert.equal(options.clearedToolPointer,runtime.PUNTATORE_USCITA_TOLTA);
  assert.match(options.clearedToolPointer,/conversation_search/u);
  assert.equal(options.recoveryHint,compaction.RIGA_RECUPERO);
  assert.match(options.recoveryHint,/conversation_search/u);
});

test('the anchor index hands the summary its text, never the object', ()=>{
  const messages=[
    {role:'user',content:'Fix the parser.'},
    {role:'assistant',content:'',tool_calls:[{id:'c1',type:'function',function:{name:'read_file',arguments:JSON.stringify({path:'src/parser.ts'})}}]},
    {role:'tool',tool_call_id:'c1',content:'export function parse(){}'},
  ];
  const anchors=options.anchorIndex(messages);
  assert.ok(anchors===null||typeof anchors==='string',`a string or null, got ${typeof anchors}`);
  assert.equal(options.anchorIndex([]),compaction.indiceMeccanico([])?.testo??null);
});

test('the composition hands these options to createContextEngine', ()=>{
  const source=readFileSync(join(process.cwd(),'src','runtime','talos-composition.ts'),'utf8');
  assert.match(source,/createContextEngine\(\{store,model:adapter,tokenCounter,\.\.\.contextEngineHostOptions\(/u);
});

/* Item 3 of the 06/11/2026 realignment (the tail after a summary, registry 224): the engine now clears the old outputs of the tail
   with this pointer, so the pointer must name something the CLI's model can call. It names conversation_search with
   this_conversation=true: the kernel's catalog declares that tool and key, the CLI sends the whole catalog (no CLI filter), and the
   CLI's sessions come from the Desktop's session registry, which hands the conversation reader to the agent (the same reader the
   Desktop uses). A pointer naming a tool or a key the CLI cannot run turns this red. Hermes keeps a bare «[Old tool output cleared
   to save context space]» (docs «Context compression and caching», read 06/11/2026); its hermes-vcc plugin points to
   session_search(session_id, around_message_id), the same shape as ours. */
test('the cleared output’s pointer names a tool and a key the CLI’s model can call', async ()=>{
  const kernel:any=await import(pathToFileURL(join(repo,'harness-ui','src','kernel','talosHarness.mjs')).href);
  const catalog=new Map<string,string[]>([...kernel.ATTREZZI_OPENAI,...kernel.ATTREZZI_ESTESI_OPENAI].map((tool:any)=>[tool.function.name,Object.keys(tool.function.parameters?.properties??{})]));
  const named=/call (\w+)/u.exec(options.clearedToolPointer)?.[1]??'';
  assert.ok(catalog.has(named),`the pointer names a kernel tool, got «${named}»`);
  const keys=options.clearedToolPointer.match(/\b[a-z]+_[a-z_]+(?==)/gu)??[];
  assert.ok(keys.length>0,'the pointer says which key to set');
  for(const key of keys)assert.ok(catalog.get(named)!.includes(key),`${named} declares ${key}`);
  assert.ok(kernel.ATTREZZI_LETTURA_SEZIONI.has(named),'the tool is answered by the section reader');
  const registry=readFileSync(join(repo,'harness-ui','src','session-registry.mjs'),'utf8');
  assert.match(registry,/onRicercaCerca, conversazioniFn,/u,'the session registry hands the conversation reader to the agent');
  assert.match(registry,/argomenti\.this_conversation === true/u,'the reader answers this_conversation');
  const composition=readFileSync(join(process.cwd(),'src','runtime','talos-composition.ts'),'utf8');
  assert.match(composition,/createSessionRegistry:sessions\.createSessionRegistry/u,'the CLI composes its sessions with that registry');
  const clearing=await import(pathToFileURL(join(repo,'context-engine','src','tool-output-clearing.mjs')).href);
  const placeholder=clearing.clearedOutputPlaceholder({role:'tool',tool_call_id:'c1',content:'x'.repeat(5000)},
    {id:'c1',type:'function',function:{name:'read_file',arguments:JSON.stringify({path:'a.txt'})}},{pointer:options.clearedToolPointer});
  assert.ok(String(placeholder).endsWith(`${options.clearedToolPointer}]`),`the placeholder ends with the pointer: ${placeholder}`);
});
