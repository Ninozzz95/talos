/*
 * FE-060 (Frontend index :154, «rivedere un fotogramma della carta e della riga a 80×24 dopo il codice della CLI»): the trust
 * question as a person sees it, through the REAL Ink into an `@xterm/headless` screen, at 80×24 and 120×40. The 80×24 frame is
 * written here row by row, so a change to the card is a change to this file. Approved words: the Frontend's OK of 02/11 (form B,
 * «Trust this folder?» … «Open without this folder's instructions», hints under their choice). Card grammar: the approved CLI
 * mockup, `bozzetto-cli-retro/index.html:1573` (the chosen row carries `›`, the others spaces), as every other CLI list does
 * (`overlays/*-center.ts`), Codex (`tui/src/bottom_pane/picker_option.rs:50`) and Hermes (`hermes_cli/cli_tui_mixin.py:170`).
 * Judge v2242 (19/11, «bozzetto alla lettera, stessa grammatica»), `index.html:1613`: the title sits in the top border on a
 * band (`╭─ ` + warnbg), the folder is drawn as code, and for the first second the foot says the card turns on in a moment;
 * no key answers it meanwhile. Keys, choices, their order and the default are unchanged.
 * Set FE060_FRAMES to a folder to also write the frames there (for the review table); nothing is written otherwise.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {PROJECT_TRUST_GRACE_MS,layoutProjectTrustPrompt,projectTrustPromptModel,projectTrustTopBorder,runProjectTrustPrompt} from '../../src/tui/project-trust-prompt.ts';
import {hermeticProfile,mountApp} from './r1-layout-fixture.ts';

/* Ink's chalk decides its colour level when it is imported (lazily, by the prompt): force truecolour so the cells carry the
   theme's backgrounds, as r5b-theme-live.test.ts does. */
process.env.FORCE_COLOR='3';
const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const ESC='\u001b';
const ARMING='Turns on in a moment, so a key pressed by mistake does not grant it.';
const KEYS='Arrows choose · Enter confirms · Esc is No · Ctrl+C quits';

function assessment(){
  return{trusted:false,reason:'PROJECT_UNTRUSTED',workspace:{requestedRoot:'C:\\Users\\dev\\work\\shop-api',canonicalRoot:'C:\\Users\\dev\\work\\shop-api',gitRoot:null,nestedRepository:false,identityHash:'workspace'},
    resources:[{workspaceIdentityHash:'workspace',kind:'context',id:'AGENTS.md',relativePath:'AGENTS.md',fingerprint:'abc'},{workspaceIdentityHash:'workspace',kind:'hook',id:'lint',relativePath:'.talos/hooks.json',fingerprint:'def'}],
    storeSchema:null,migrationRequired:false,folder:{decided:false,source:null,path:null,sessionOnly:false,parent:'C:\\Users\\dev\\work'}} as any;
}

type Shot={lines:string[];term:any};
/* The question on a fake TTY of `cols`×`rows`. `steps` run in order: a number waits until that many ms after the question is
   first drawn (its first write: the first import of Ink takes longer than the grace), a string is a key, `'shot'` takes the
   screen. Returns the shots, the answer given by then (null if none) and the final answer. */
async function drive(cols:number,rows:number,steps:Array<number|string>,{name='',env={TERM:'xterm-256color'} as Record<string,string>}={}){
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();
  let drawn=(_at:number)=>{};const firstDraw=new Promise<number>(resolve=>{drawn=resolve;});
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){drawn(Date.now());const text=String(chunk);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  let answered:string|null=null;
  const answer=runProjectTrustPrompt({assessment:assessment(),nestedRepositories:[]},{stdin,stdout,env});
  void answer.then(choice=>{answered=choice;});
  const started=await firstDraw;
  const shots:Shot[]=[];
  for(const step of steps){
    if(typeof step==='number'){const wait=started+step-Date.now();if(wait>0)await sleep(wait);continue;}
    if(step==='shot'){await sleep(40);await pending;const buffer=term.buffer.active;const lines:string[]=[];
      for(let y=0;y<term.rows;y++)lines.push(buffer.getLine(buffer.viewportY+y)?.translateToString(true,0,term.cols)??'');
      shots.push({lines,term});
      const out=process.env.FE060_FRAMES;
      if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`trust-card-${cols}x${rows}${name}-${shots.length}.txt`),lines.join('\n')+'\n','utf8');}
      continue;}
    stdin.write(step);await sleep(30);
  }
  const before=answered;
  if(answered===null)stdin.write('\u0003');
  const final=await answer;
  return{shots,answered:before,final};
}
const past=PROJECT_TRUST_GRACE_MS+150;

const CARD_80x24=[
  '╭─  TALOS · Trust this folder? ────────────────────────────────────────────────╮',
  '│ C:\\Users\\dev\\work\\shop-api                                                   │',
  '│ TALOS will load this folder’s instructions, hooks and connected tools.       │',
  '│ 2 project files covered by this decision (context 1, hook 1)                 │',
  '│   - context · AGENTS.md                                                      │',
  '│   - hook · lint · .talos/hooks.json                                          │',
  '│                                                                              │',
  '│   Yes, trust this folder                                                     │',
  '│   Yes, and the folder that contains it (C:\\Users\\dev\\work)                   │',
  '│   Only this time                                                             │',
  '│     Nothing is saved                                                         │',
  '│ › No                                                                         │',
  '│     Open without this folder’s instructions                                  │',
  `│ ${KEYS}                    │`,
  '╰──────────────────────────────────────────────────────────────────────────────╯',
];

test('FE-060: the card at 80×24, row by row: title in the top border, chosen row marked › (index.html:1573, :1613)',async()=>{
  const {shots}=await drive(80,24,[past,'shot']);
  const lines=shots[0]!.lines;
  const top=lines.findIndex(line=>line.startsWith('╭'));
  assert.ok(top>=0,lines.join('\n'));
  assert.deepEqual(lines.slice(top,top+CARD_80x24.length),CARD_80x24,lines.join('\n'));
  for(const line of lines)assert.ok([...line].length<=80,`wider than 80: ${line}`);
  assert.ok(!lines.some(line=>/│ > /u.test(line)),'no ASCII marker where the terminal draws Unicode');
  assert.equal(lines.filter(line=>line.includes('Trust this folder?')).length,1,'the title once, in the border only');
});

test('FE-060: the band and the folder are painted (warnbg and code, index.html:1613), the border is not',async()=>{
  const {shots}=await drive(80,24,[past,'shot']);
  const {lines,term}=shots[0]!;
  const top=lines.findIndex(line=>line.startsWith('╭'));
  const row=term.buffer.active.getLine(term.buffer.active.viewportY+top);
  const band=row.getCell(5),corner=row.getCell(0),fill=row.getCell(40);
  assert.equal(band.getChars(),'A');
  /* the frame paints the theme's background everywhere, so a surface is a background other than the border's */
  const bg=(cell:any)=>`${cell.getBgColorMode()}:${cell.getBgColor()}:${cell.isInverse()}`;
  assert.notEqual(bg(band),bg(corner),'the title sits on a band');
  assert.equal(bg(fill),bg(corner),'the border line after the title has no band');
  const folder=term.buffer.active.getLine(term.buffer.active.viewportY+top+1);
  const reason=term.buffer.active.getLine(term.buffer.active.viewportY+top+2);
  assert.equal(folder.getCell(2).getChars(),'C');
  assert.notEqual(bg(folder.getCell(2)),bg(reason.getCell(2)),'the folder is drawn as code, the sentence under it is not');
  assert.equal(bg(folder.getCell(60)),bg(folder.getCell(2)),'the code surface runs the whole row, as the mockup pads it');
  assert.equal(bg(reason.getCell(2)),bg(corner),'on the contrary: the sentence sits on the frame');
});

test('FE-060: for the first second the foot says it turns on in a moment, and no key answers or moves it (index.html:1613)',async()=>{
  assert.equal(PROJECT_TRUST_GRACE_MS,1000);
  const {shots,answered,final}=await drive(80,24,[150,'shot','y','\r',500,'\r',`${ESC}[A`,850,'p','\r','shot',past,'shot','\r',past+200]);
  const [early,late,armed]=shots.map(shot=>shot.lines.join('\n'));
  assert.ok(early!.includes(ARMING),early);assert.ok(!early!.includes(KEYS),early);
  assert.ok(late!.includes(ARMING),'still turning on at 0.9 s');
  assert.ok(late!.includes('│ › No '),'no key in the first second moved the highlight');
  assert.ok(armed!.includes(KEYS)&&!armed!.includes(ARMING),'after the second the keys row is back');
  assert.equal(answered,'no','after the second Enter answers, with No still the default');
  assert.equal(final,'no');
});

test('FE-060, on the contrary: after the second the letters and arrows work as before',async()=>{
  const {shots,final}=await drive(80,24,[past,`${ESC}[A`,'shot','y','shot','\r',past+300],{name:'-moved'});
  assert.ok(shots[0]!.lines.some(line=>line.startsWith('│ › Only this time ')),shots[0]!.lines.join('\n'));
  assert.ok(shots[0]!.lines.some(line=>line.startsWith('│   No ')));
  assert.equal(shots[0]!.lines.filter(line=>line.includes('› ')).length,1,'one marker only');
  assert.ok(shots[1]!.lines.some(line=>line.startsWith('│ › Yes, trust this folder ')));
  assert.equal(final,'trust');
});

test('FE-060: at 120×40 the same rows, nothing cut, the top border as wide as the box',async()=>{
  const {shots}=await drive(120,40,[past,'shot']);
  const lines=shots[0]!.lines;const text=lines.join('\n');
  for(const words of ['╭─  TALOS · Trust this folder? ─','C:\\Users\\dev\\work\\shop-api','TALOS will load this folder’s instructions, hooks and connected tools.','  Yes, trust this folder','  Yes, and the folder that contains it (C:\\Users\\dev\\work)','  Only this time','    Nothing is saved','› No','    Open without this folder’s instructions',KEYS])assert.ok(text.includes(words),`${words}\n${text}`);
  for(const line of lines)assert.ok([...line].length<=120);
  const top=lines.find(line=>line.startsWith('╭'))!,bottom=lines.find(line=>line.startsWith('╰'))!;
  assert.equal([...top].length,[...bottom].length);assert.ok(top.endsWith('╮'));
});

test('FE-060: the top border fits every width, and falls back to ASCII without Unicode',()=>{
  const title='TALOS · Trust this folder?';
  for(const columns of [8,12,40,80,120]){
    for(const unicode of [true,false]){
      const top=projectTrustTopBorder(title,columns,unicode);
      const line=top.lead+top.band+top.tail;
      assert.equal([...line].length,columns,`${columns} ${unicode}: «${line}»`);
      assert.ok(line.startsWith(unicode?'╭─ ':'+- ')&&line.endsWith(unicode?'╮':'+'),line);
      if(!unicode)assert.ok(!/[─╭╮›]/u.test(line),line);
    }
  }
  assert.equal(projectTrustTopBorder(title,80).band,` ${title} `);
  assert.match(projectTrustTopBorder(title,12).band,/^ .*… $/u,'a narrow terminal cuts the title, never the border');
});

test('FE-060: a terminal without Unicode keeps the ASCII marker; the arming words take the keys row',()=>{
  const model=projectTrustPromptModel({assessment:assessment(),nestedRepositories:[]});
  const ascii=layoutProjectTrustPrompt(model,{columns:80,rows:24,selected:'no',unicode:false});
  assert.ok(ascii.some(row=>row.kind==='choice'&&row.text==='> No'),ascii.map(row=>row.text).join('\n'));
  assert.ok(!ascii.some(row=>row.text.includes('›')));
  const unicode=layoutProjectTrustPrompt(model,{columns:80,rows:24,selected:'no',unicode:true});
  assert.ok(unicode.some(row=>row.kind==='choice'&&row.text==='› No'));
  assert.equal(unicode.at(-1)!.text,KEYS);
  const arming=layoutProjectTrustPrompt(model,{columns:80,rows:24,selected:'no',arming:true});
  assert.equal(arming.at(-1)!.text,ARMING);assert.equal(arming.at(-1)!.kind,'keys');
});

/* The fixed line after No (Frontend's words, form B: «This folder isn't trusted: its instructions are off. /trust to change»),
   on the real TuiApp at both sizes: whole, on one row, never wrapped. Unchanged by the judge's v2242. */
test('FE-060: the fixed line after No, whole on one row at 80×24 and at 120×40',async()=>{
  const env=hermeticProfile();
  try{
    for(const [cols,rows] of [[80,24],[120,40]] as const){
      const app=await mountApp({cols,rows,root:env.root,paths:env.paths,history:[],invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},projectUntrusted:true} as any);
      try{
        await sleep(300);const screen=await app.screen();
        const out=process.env.FE060_FRAMES;
        if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`fixed-line-${cols}x${rows}.txt`),screen.lines.join('\n')+'\n','utf8');}
        assert.equal(screen.lines.filter(line=>line.includes("This folder isn't trusted: its instructions are off. /trust to change")).length,1,screen.text);
        assert.equal(screen.wrapped,0);
      }finally{app.unmount();}
    }
  }finally{env.restore();try{fs.rmSync(env.root,{recursive:true,force:true});}catch{/* best effort, as untrusted-folder-app.test.ts */}}
});
