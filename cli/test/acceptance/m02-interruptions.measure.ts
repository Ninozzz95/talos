/*
 * 0.7.0 MEASURE, not part of the gate: rule 17 of the method (owner 02/11/2026), «too many blocks, too many cards, notices:
 * the person will end up never using the feature». The interruptions of ten typical tasks are counted on the built CLI and the
 * fake provider, in a trusted folder and in a folder opened with No (a), as FORMA-BLOCCO-ALLINEAMENTO-CLI-2026-11-02.md asks
 * («Interruzioni»): cards to confirm, stops, questions. Silent rows of the transcript do not count. Each approval is answered
 * «once», at a person's pace (answerApproval). Run: node scripts/run-tests.mjs --test-concurrency=1
 * "test/acceptance/m02-interruptions.measure.ts". The table is printed as one `M02 {...}` line; with TALOS_M02_DUMPS=<dir>
 * the screen of each card and the end of each task are written there, to read what each card was.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {approvalVisible,composerReady,idleFooter} from './checks.ts';
import {answerApproval,exitTalos,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const FILES:Record<string,string>={
  'README.md':'# demo\n','AGENTS.md':'Always answer in English.\n','src/index.js':'console.log(1)\n',
  'big.txt':Array.from({length:3000},(_,i)=>`line ${i+1}`).join('\n')+'\n',
  ...Object.fromEntries(Array.from({length:10},(_,i)=>[`c${i+1}.txt`,`file ${i+1}\n`+'x'.repeat(9000)+'\n'])),
};
type Row={task:string;cards:number;questions:number;which:string[];ended:boolean};
const results:Record<string,unknown>={};
const dumps=process.env.TALOS_M02_DUMPS;
const keep=(name:string,screen:Screen)=>{if(!dumps)return;mkdirSync(dumps,{recursive:true});writeFileSync(join(dumps,`${name}.txt`),screen.text);};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const TRUST=/Trust this folder\?/u;
const QUESTION=/^ \S Waiting for your answer · /mu;
/* the card's own lines: the ones above «Allow once» that name what is asked */
const cardText=(s:Screen)=>{const at=s.lines.findIndex(line=>/\[1\]\s*once|Allow once/u.test(line));return s.lines.slice(Math.max(0,at-6),at).map(line=>line.replace(/[│╭╮╰╯─]/gu,'').trim()).filter(Boolean).join(' / ').slice(0,200);};

/* The ten tasks of the form: read and explain, one file edit, an edit with its check, a command, a search, a long conversation
   (ten reads), the local model answering, a delegated agent, /config, and a resumed conversation (measured apart, it relaunches). */
const TASKS:{task:string;prompt?:string;command?:{name:string;open:(s:Screen)=>boolean}}[]=[
  {task:'1 read and explain',prompt:'BIGREAD explain big.txt'},
  {task:'2 edit a file',prompt:'EDIT change the log in src/index.js'},
  {task:'3 edit with its check',prompt:'TOOLS inspect the repo, run dir and write notes'},
  {task:'4 a command',prompt:'NETPLAIN run the echo command'},
  {task:'5 a search',prompt:'SEARCH find console in src'},
  {task:'6 long conversation',prompt:'COMPACTME read the ten files'},
  {task:'7 local model answer',prompt:'MD summarise the project'},
  {task:'8 delegated agent',prompt:'DELEGATE look at the repo'},
  {task:'9 /config',command:{name:'/config',open:s=>s.text.includes('── Settings this project')&&s.text.includes('Response width')}},
];

/** Drive one prompt to its end, answering every card once; count the cards and questions met on the way. */
async function drive(t:TerminalSession,fake:{chatRequests:()=>{lastUser?:string}[]},task:string,prompt:string,label:string):Promise<Row>{
  const row:Row={task,cards:0,questions:0,which:[],ended:false};
  await t.submit(prompt);
  const deadline=Date.now()+90_000;
  while(Date.now()<deadline){
    const s=t.screen();
    if(approvalVisible(s)){
      row.cards++;row.which.push(cardText(s));keep(`${label}-card${row.cards}`,s);
      await answerApproval(t,'1');
      await t.waitFor('the card is answered',x=>!approvalVisible(x)||cardText(x)!==row.which.at(-1),{timeout:15_000}).catch(()=>undefined);
      continue;
    }
    if(QUESTION.test(s.text)){row.questions++;row.which.push('question');keep(`${label}-question${row.questions}`,s);t.press('esc');await pause(500);continue;}
    if(fake.chatRequests().some(r=>r.lastUser?.includes(prompt.slice(0,20)))&&idleFooter(s)&&composerReady(s)){row.ended=true;keep(`${label}-end`,s);break;}
    await pause(120);
  }
  return row;
}

for(const [mode,trusted] of [['trusted',true],['no-a',false]] as const){
  const s=stage({name:`m02-${mode}`,files:FILES,trusted});
  test(`m02 · ${mode} · ten typical tasks`,async()=>{
    const out:{launch:Row;tasks:Row[];resume:Row;exits:string[]}={exits:[],launch:{task:'0 launch',cards:0,questions:0,which:[] as string[],ended:true},tasks:[] as Row[],resume:{task:'10 resume',cards:0,questions:0,which:[] as string[],ended:false}};
    results[mode]=out;
    /* an exit the backstop had to end is a finding of its own: noted, the measure goes on */
    const leave=async(at:string)=>{try{if(!await exitTalos(t))out.exits.push(`${at}: did not exit`);}catch(error){out.exits.push(`${at}: ${String((error as Error).message).split('\n').slice(0,2).join(' ')}`);}};
    let t=s.launch([],{cols:110,rows:36});
    const first=await t.waitFor('first paint or the trust question',x=>TRUST.test(x.text)||composerReady(x),{timeout:30_000});
    if(TRUST.test(first.text)){out.launch.cards++;out.launch.which.push('trust question');keep(`${mode}-launch`,first);await pause(1150)/* past the one-second grace, judge v2242 */;t.press('enter');}
    await toComposer(t);
    for(const item of TASKS){
      if(item.prompt){out.tasks.push(await drive(t,s.fake,item.task,item.prompt,`${mode}-${item.task.split(' ')[0]}`));continue;}
      await t.submit(item.command!.name);
      const opened=await t.waitFor(`${item.command!.name} opened`,item.command!.open,{timeout:15_000});
      keep(`${mode}-9-open`,opened);
      t.press('esc');
      await t.waitFor('closed',x=>!item.command!.open(x)&&composerReady(x),{timeout:10_000});
      out.tasks.push({task:item.task,cards:approvalVisible(opened)?1:0,questions:0,which:[],ended:true});
    }
    await leave('after task 9');
    /* 10: the next launch resumes the conversation, then one more answer in it */
    t=s.launch([],{cols:110,rows:36});
    const again=await t.waitFor('first paint or the trust question',x=>TRUST.test(x.text)||composerReady(x),{timeout:30_000});
    if(TRUST.test(again.text)){out.resume.cards++;out.resume.which.push('trust question at the next launch');keep(`${mode}-10-trust`,again);await pause(1150)/* past the one-second grace, judge v2242 */;t.press('enter');}
    await toComposer(t);
    await t.submit('/resume');
    await t.waitFor('the picker, loaded',x=>x.text.includes('── Resume a conversation')&&!x.text.includes('Loading sessions'),{timeout:15_000});
    t.press('enter');
    await t.waitFor('resumed',x=>!x.text.includes('── Resume a conversation')&&composerReady(x),{timeout:15_000});
    const after=await drive(t,s.fake,'10 resume','MD after the resume','x');
    out.resume={...out.resume,cards:out.resume.cards+after.cards,questions:after.questions,which:[...out.resume.which,...after.which],ended:after.ended};
    keep(`${mode}-10-end`,t.screen());
    await leave('after task 10');
  });
}

test('m02 · result',()=>{console.log(`M02 ${JSON.stringify(results)}`);});
