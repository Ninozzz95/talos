/*
 * R4 lane F — the trust question (owner decisions Q-R4-2, Q-R4-3; gate E1, E4; s02 D-09, R4-TRUST).
 * - Choices Cancel · Trust this folder · Trust the parent folder (<parent>), Cancel highlighted; the parent choice only when
 *   the parent may be saved; the home folder and a drive root say the decision lasts for this session.
 * - Keys in the first second (PROJECT_TRUST_GRACE_MS; 300 ms until judge v2242) after the question appears are ignored (like approvals, Q-R3-16).
 * - Drawn in the alternate screen, so nothing is left in the terminal; it fits the terminal's rows.
 * - Paths as the person types them: single backslashes; control, bidi and default-ignorable characters still escaped.
 * - Each resource named once: `kind · path`, and `kind · id · path` only when the id differs from the path.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {PROJECT_TRUST_GRACE_MS,inertProjectTrustText,layoutProjectTrustPrompt,projectTrustPromptModel,runProjectTrustPrompt} from '../../src/tui/project-trust-prompt.ts';

const WINDOWS_FOLDER='C:\\Users\\dev\\work\\project';
function assessment({resources=[] as any[],reason='NO_PROJECT_RESOURCES' as any,folder={decided:false,source:null,path:null,sessionOnly:false,parent:'C:\\Users\\dev\\work'} as any,root=WINDOWS_FOLDER}={}){
  return{trusted:reason==='NO_PROJECT_RESOURCES',reason,workspace:{requestedRoot:root,canonicalRoot:root,gitRoot:null,nestedRepository:false,identityHash:'workspace'},resources,storeSchema:null,migrationRequired:false,folder} as any;
}
const agents={workspaceIdentityHash:'workspace',kind:'context',id:'AGENTS.md',relativePath:'AGENTS.md',fingerprint:'abc'};
const hook={workspaceIdentityHash:'workspace',kind:'hook',id:'lint',relativePath:'.talos/hooks.json',fingerprint:'def'};

test('decision 2 (02/11): a plain folder offers Yes, Yes and the parent, Only this time and No, with No highlighted',()=>{
  const model=projectTrustPromptModel({assessment:assessment(),nestedRepositories:[]});
  assert.equal(model.title,'Trust this folder?');
  assert.equal(model.reason,'TALOS will load this folder’s instructions, hooks and connected tools.');
  assert.deepEqual(model.choices.map(choice=>choice.id),['trust','trust-parent','once','no']);
  assert.deepEqual(model.choices.map(choice=>choice.label),['Yes, trust this folder','Yes, and the folder that contains it (C:\\Users\\dev\\work)','Only this time','No']);
  assert.deepEqual(model.choices.map(choice=>choice.hint??null),[null,null,'Nothing is saved','Open without this folder’s instructions'],'the two that are not Yes say what they do');
  assert.equal(model.defaultSelection,'no','Enter alone never trusts a folder');
  assert.equal(model.session,null);
});

test('Q-R4-1: the home folder or a drive root offers Only this time and No, never a saved Yes or a parent',()=>{
  const model=projectTrustPromptModel({assessment:assessment({folder:{decided:false,source:null,path:null,sessionOnly:true,parent:null}}),nestedRepositories:[]});
  assert.deepEqual(model.choices.map(choice=>choice.id),['once','no']);
  assert.match(model.session??'',/this session only/u);
  const noParent=projectTrustPromptModel({assessment:assessment({folder:{decided:false,source:null,path:null,sessionOnly:false,parent:null}}),nestedRepositories:[]});
  assert.deepEqual(noParent.choices.map(choice=>choice.id),['trust','once','no'],'the parent is the home folder: not offered');
});

test('E4: the folder is printed with single backslashes; control, bidi and ignorable characters stay escaped',()=>{
  assert.equal(inertProjectTrustText(WINDOWS_FOLDER),WINDOWS_FOLDER);
  assert.equal(inertProjectTrustText('C:\\a\u001b[2J\u202eb'),'C:\\a\\u001b[2J\\u202eb');
  assert.equal(inertProjectTrustText('C:\\u0041x'),'C:\\\\u0041x','a folder named like an escape keeps the escapes unambiguous');
  assert.equal(inertProjectTrustText('C:\\users'),'C:\\users','a plain \\u that is not an escape is left alone');
  const model=projectTrustPromptModel({assessment:assessment(),nestedRepositories:[]});
  assert.equal(model.project,WINDOWS_FOLDER);
});

test('E4: each resource is named once — kind and path, the id only when it differs',()=>{
  const model=projectTrustPromptModel({assessment:assessment({reason:'PROJECT_UNTRUSTED',resources:[agents,hook]}),nestedRepositories:[]});
  assert.deepEqual(model.resources,['context · AGENTS.md','hook · lint · .talos/hooks.json']);
  assert.match(model.reason,/instructions, hooks and connected tools/u);
});

function rowsOf(model:any,size:{columns:number;rows:number},selected:any='no'){return layoutProjectTrustPrompt(model,{...size,selected,unicode:true});}
test('Q-R4-3: the question fits the terminal rows, title and choices always visible',()=>{
  const many=Array.from({length:30},(_,i)=>({...agents,id:`cmd-${i}`,kind:'command',relativePath:`.talos/commands/cmd-${i}.md`}));
  for(const size of [{columns:40,rows:12},{columns:60,rows:16},{columns:60,rows:24},{columns:120,rows:40}]){
    for(const value of [assessment(),assessment({reason:'PROJECT_UNTRUSTED',resources:many,root:'C:\\Users\\dev\\'+'deep\\'.repeat(20)+'project'})]){
      const model=projectTrustPromptModel({assessment:value,nestedRepositories:[]});
      const rows=rowsOf(model,size);
      assert.ok(rows.length+2<=size.rows,`${size.columns}×${size.rows}: ${rows.length} rows + the border do not fit`);
      for(const row of rows)assert.ok([...row.text].length<=size.columns-4,`${size.columns} columns: "${row.text}" is wider than the box`);
      assert.equal(rows[0]!.text,'TALOS · Trust this folder?');
      for(const choice of model.choices)assert.ok(rows.some(row=>row.kind==='choice'&&row.text.endsWith(choice.label.slice(0,10))||row.text.includes(choice.label.slice(0,10))),`${size.columns}×${size.rows}: "${choice.label}" is missing`);
      assert.ok(rows.some(row=>row.text==='› No'),'No is highlighted');
    }
  }
  const roomy=rowsOf(projectTrustPromptModel({assessment:assessment(),nestedRepositories:[]}),{columns:80,rows:24});
  assert.deepEqual(roomy.filter(row=>row.kind==='dim'&&/^ {4}/u.test(row.text)).map(row=>row.text.trim()),['Nothing is saved','Open without this folder’s instructions'],'at 80×24 the words under the choices show');
  const index=roomy.findIndex(row=>row.text==='› No');
  assert.equal(roomy[index+1]!.text.trim(),'Open without this folder’s instructions','under the choice they belong to');
  const tall=rowsOf(projectTrustPromptModel({assessment:assessment({reason:'PROJECT_UNTRUSTED',resources:many}),nestedRepositories:[]}),{columns:60,rows:24});
  assert.ok(tall.some(row=>/and \d+ more/u.test(row.text)),'the resources that do not fit are counted');
});

test('Q-R4-3: at the smallest size the one file a folder holds is still named (measured 40×12: it was the first to go)',()=>{
  const rows=rowsOf(projectTrustPromptModel({assessment:assessment({reason:'PROJECT_UNTRUSTED',resources:[agents],root:'C:\\Users\\dev\\AppData\\Local\\Temp\\talos-cli-test-run-Wg8k0U\\talos-acceptance-f1-agents-40x12-B3CKTW\\project'}),nestedRepositories:[]}),{columns:40,rows:12});
  assert.ok(rows.some(row=>row.text.includes('context · AGENTS.md')),rows.map(row=>row.text).join('\n'));
  assert.ok(rows.length+2<=12,'and it still fits the frame');
});

/* The question through the real Ink, on a fake TTY: alternate screen, 300 ms grace, keys. */
function fakeTerminal(){
  const writes:string[]=[];
  const stdout:any=Object.assign(new EventEmitter(),{columns:80,rows:24,isTTY:true,write(chunk:string){writes.push(String(chunk));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  return{stdout,stdin,writes};
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const ESC='\u001b';

test('Q-R4-2/3: drawn in the alternate screen; keys in the first second are ignored (judge v2242, was 300 ms); Up three times then Enter trusts',async()=>{
  assert.equal(PROJECT_TRUST_GRACE_MS,1000);
  const term=fakeTerminal();
  const answer=runProjectTrustPrompt({assessment:assessment(),nestedRepositories:[]},{stdin:term.stdin,stdout:term.stdout,env:{TERM:'xterm-256color'}});
  let settled:string|null=null;void answer.then(choice=>{settled=choice;});
  await sleep(60);
  term.stdin.write(ESC+'[A');term.stdin.write('\r');
  await sleep(120);
  assert.ok(term.writes.join('').includes(ESC+'[?1049h'),'the question is drawn in the alternate screen');
  assert.match(term.writes.join(''),/› No/u,'No is highlighted when the question appears');
  assert.equal(settled,null,'an Enter pressed in the first second does not answer the question');
  assert.doesNotMatch(term.writes.join(''),/› Only this time/u,'an Up pressed in the first second does not move the highlight');
  await sleep(PROJECT_TRUST_GRACE_MS);
  term.stdin.write(ESC+'[A');await sleep(60);
  assert.match(term.writes.join(''),/› Only this time/u,'after the grace Up moves the highlight');
  term.stdin.write(ESC+'[A');await sleep(30);term.stdin.write(ESC+'[A');await sleep(60);
  assert.match(term.writes.join(''),/› Yes, trust this folder/u);
  term.stdin.write('\r');
  assert.equal(await answer,'trust');
  assert.ok(term.writes.join('').includes(ESC+'[?1049l'),'the alternate screen is left before TALOS goes on');
});

test('p, o and n highlight their choice and Enter confirms it; Esc is No even on Yes; Ctrl+C quits',async()=>{
  const run=async(keys:string[])=>{
    const term=fakeTerminal();
    const answer=runProjectTrustPrompt({assessment:assessment(),nestedRepositories:[]},{stdin:term.stdin,stdout:term.stdout,env:{TERM:'xterm-256color'}});
    await sleep(PROJECT_TRUST_GRACE_MS+80);for(const key of keys){term.stdin.write(key);await sleep(60);}
    return answer;
  };
  assert.equal(await run(['p','\r']),'trust-parent');
  assert.equal(await run(['o','\r']),'once');
  assert.equal(await run(['y','n','\r']),'no');
  assert.equal(await run(['y',ESC]),'no','Esc never trusts, and never quits: it is the safe answer');
  assert.equal(await run(['y','\u0003']),'cancel','Ctrl+C quits, as before');
});
