import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {assertHeightBudgeted,composerReady,resumeLineIn} from './checks.ts';
import {exitTalos,focusReport,runCommand,stage,toComposer,turn} from './harness.ts';

const s=stage({name:'s33',files:{'README.md':'# config test\n'},extraEnv:{TALOS_REDUCED_MOTION:'1'}});
/* stage 7.11 (owner 03/10): /config is the Settings sheet's Config tab, Response width after the mockup's rows */
const isConfig=(screen:{text:string})=>screen.text.includes('── Settings this project')&&screen.text.includes('Response width');
/* the fields of the Config tab: Mouse, Thinking, Tool rows, Reduce motion, Notify when done, Editor, Response width, On exit, Questions close after, Start view */
async function field(t:any,n:number){for(let i=0;i<n;i++){t.press('down');await t.observe(30);}}
const evidence=process.env.TALOS_P5_EVIDENCE_DIR;
function keep(name:string,text:string){if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,name+'.txt'),text);}}

for(const size of [{cols:60,rows:24},{cols:100,rows:30},{cols:120,rows:36}])test(`P5-E2E ${size.cols}x${size.rows} config, persisted width, resize, follow-up and restart`,{timeout:90_000},async()=>{
  const reset=await s.profile.talos(['config','set','ui.maxProseWidth','null','--scope','project-user']);assert.equal(reset.status,0,reset.stderr);
  const t=s.launch([],size);
  try{
    await toComposer(t);const before=s.fake.chatRequests().length;
    const panel=await runCommand(t,'/config',isConfig);assertHeightBudgeted(panel,'P5-CONFIG');keep(`p5-config-${size.cols}`,t.dump());
    assert.equal(s.fake.chatRequests().length,before,'config never calls the model');
    t.paste('SHOULD_NOT_TYPE');await t.observe(80);
    await field(t,6);t.press('right');await t.observe(60);t.press('enter');
    await t.waitFor('width persisted',screen=>screen.text.includes('Saved for this project'));
    t.press('esc');await t.waitFor('composer restored',screen=>!isConfig(screen)&&composerReady(screen));
    assert.doesNotMatch(t.screen().text,/SHOULD_NOT_TYPE/u);
    const answer=await turn(t,s.fake,`MD prject ${size.cols}`);assertHeightBudgeted(answer,'P5-WIDTH');
    keep(`p5-markdown-${size.cols}`,t.dump());
    const listStart=answer.lines.findIndex(line=>/^ {2}2\. Second step/u.test(line));assert.ok(listStart>=0,'numbered prose is visible');
    const listLines=answer.lines.slice(listStart).filter(line=>/^ {2}2\. Second|^ {5,}[A-Za-z]/u.test(line));
    assert.ok(listLines.length>1,'long prose wraps');assert.ok(listLines.every(line=>line.trimEnd().length<=Math.min(size.cols,60+2)),'prose respects cap');
    t.resize(60,24);await t.observe(150);assertHeightBudgeted(t.screen(),'P5-RESIZE');
    await turn(t,s.fake,`Thanks ${size.cols}, continue please.`);
    assert.ok(await exitTalos(t));
  }finally{await t.close();}
  const saved=await s.profile.talos(['config','get','ui.maxProseWidth']);assert.equal(saved.status,0);assert.match(saved.stdout,/60/u);
  const again=s.launch(['--resume','last'],size);
  try{
    await toComposer(again);await runCommand(again,'/config',isConfig);
    assert.match(again.screen().text,/Response width {9}.*60 columns/u);keep(`p5-reopened-${size.cols}`,again.dump());
    again.press('ctrl+c');await again.waitFor('Ctrl+C closes settings',screen=>!isConfig(screen)&&composerReady(screen));
    assert.ok(await exitTalos(again));
  }finally{await again.close();}
});

test('P5-E2E malformed config is preserved; repair and retry recover without leaving the session',{timeout:60_000},async()=>{
  const t=s.launch();
  const directory=join(s.profile.project,'.talos-cli'),file=join(directory,'config.json');
  try{
    await toComposer(t);mkdirSync(directory,{recursive:true});writeFileSync(file,'{"ui": BROKEN');
    await runCommand(t,'/config',screen=>screen.text.includes('Could not read settings'));
    t.press('enter');await t.observe(80);assert.equal(readFileSync(file,'utf8'),'{"ui": BROKEN');
    writeFileSync(file,'{}');t.send('r');await t.waitFor('recovered panel',isConfig);
    t.press('esc');await t.waitFor('composer after recovery',screen=>!isConfig(screen)&&composerReady(screen));
    await turn(t,s.fake,'Now continue after the settings repair.');assert.ok(await exitTalos(t));
  }finally{await t.close();}
});

test('P5-E2E-RESTART-CHOICES panel settings cause real bell, mouse and exit behavior after restart',{timeout:60_000},async()=>{
  // The repair scenario created a new project-context file; acknowledge it in this synthetic profile.
  const trust=await s.profile.talos(['project','trust','--include-nested']);assert.equal(trust.status,0,trust.stderr);
  const t=s.launch();
  try{
    await toComposer(t);await runCommand(t,'/config',isConfig);
    /* stage 6c: the mouse is on by default, so choosing the row turns it off */
    /* Mouse off (space), Notify when done: desktop → bell, On exit: keep transcript → resume link only; one save */
    t.press('space');await t.observe(40);await field(t,4);t.press('left');await t.observe(40);await field(t,3);t.press('right');await t.observe(40);t.press('enter');
    await t.waitFor('the three saved for the next launch',screen=>screen.text.includes('Saved for this project · Mouse, Notify when done, On exit: at the next launch'));
    t.press('esc');await t.waitFor('settings closed',screen=>!isConfig(screen)&&composerReady(screen));
    assert.ok(await exitTalos(t));
  }finally{await t.close();}
  const again=s.launch();
  try{
    await toComposer(again);assert.equal(again.output.read().mouseEnables.length,0,'the explicit switch-off is effective after restart: the terminal selects as before');
    await focusReport(again,false);const bells=again.output.read().bells;
    const prompt='P5 saved preferences are active';await turn(again,s.fake,prompt);
    await again.waitFor('saved bell reaches terminal',()=>again.output.read().bells>bells);
    assert.ok(await exitTalos(again));
    const normal=again.normalLines();assert.ok(resumeLineIn(normal),'resume command remains after exit');
    assert.ok(normal.every(line=>!line.includes(prompt)),'resume-only does not reprint the transcript');
  }finally{await again.close();}
});
