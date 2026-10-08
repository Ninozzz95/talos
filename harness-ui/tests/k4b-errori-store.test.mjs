import assert from 'node:assert/strict';
import test from 'node:test';
import {createAutomationStore} from '../src/automation-store.mjs';
import {preparaEsecuzioneLibera} from '../src/custom-task.mjs';
import {createHfHubClient} from '../src/hf-hub-client.mjs';
import {leggiPolitica} from '../src/library-policy-store.mjs';
import {eliminaVoci} from '../src/library-store.mjs';
import {creaMemoria} from '../src/memory-store.mjs';
import {creaNota} from '../src/notes-store.mjs';
import {caricaSkill} from '../src/skill-registry.mjs';
import {listaTaskDisponibili} from '../src/task-catalog.mjs';
import {creaAttivita} from '../src/tasks-store.mjs';
const cases=[
 ['automation-store',()=>createAutomationStore({cartella:'.'}).crea({taskId:'id',intervalloMinuti:5,modello:42}),'AUTOMATION_INVALID','invalid model'],
 ['custom-task',()=>preparaEsecuzioneLibera([],{}),'QUERY_INVALID','exactly one of cartellaId and cartellaLibera is required'],
 ['hf-hub-client',()=>createHfHubClient({fetchImpl:async()=>new Response('',{status:403})}).searchModels(),'HF_REPOSITORY_GATED','Hugging Face repository is gated or unauthorized'],
 ['library-policy-store',()=>leggiPolitica({cartella:'.'},{readFileFn:async()=>'{'}),'LIBRARY_POLICY_MALFORMED','policy.json is not valid JSON'],
 ['library-store',()=>eliminaVoci({cartella:'.',ids:[]}),'LIBRARY_INVALID','Batch deletion requires an `ids` array with at least one id.'],
 ['memory-store',()=>creaMemoria({cartella:'.',title:'Title',content:'Content',kind:'invalid'}),'MEMORY_INVALID','kind must be one of preference/project_fact/procedure/policy_note'],
 ['notes-store',()=>creaNota({cartella:'.',title:'Title',content:'Content',formato:'invalid'}),'NOTE_INVALID','formato must be one of markdown/testo'],
 ['skill-registry',()=>caricaSkill({cartella:'.'},{readdirFn:async()=>[{name:'x',isDirectory:()=>true}],readFileFn:async()=>'invalid'}),'SKILL_MALFORMED','x/SKILL.md must start with "---" frontmatter'],
 ['task-catalog',()=>listaTaskDisponibili(null),'TASK_CATALOG_UNAVAILABLE','The task catalog is unavailable in this installation. Configure the owner runtime.'],
 ['tasks-store',()=>creaAttivita({cartella:'.',title:'Title',description:'Content',priority:'invalid'}),'TASK_INVALID','priority must be one of low/normal/high'],
];
for(const [file,run,code,message] of cases)test('K4B-E-STORE — '+file+': rifiuto diagnostico inglese, codice stabile e nessuna chiave',async()=>{
 let error;try{await run();}catch(e){error=e;}
 assert.ok(error,'rifiuto atteso');assert.equal(error.code,code);assert.equal(error.message,message);assert.equal(error.chiave,undefined);
});
