/* Composer -> real kernel events -> real focus/progress protocols; native desktop boundary stubbed. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {approvalVisible,composerReady,idleFooter} from './checks.ts';
import {answerApproval,exitTalos,focusReport,stage,toComposer,turn} from './harness.ts';
import {TerminalSession} from './terminal.ts';

const E='\u001b';const log=join(tmpdir(),'p4-native-notifications.jsonl');
const s=stage({name:'s31',files:{'README.md':'# notification test\n'},extraEnv:{
  WT_SESSION:'synthetic-p4',SSH_CONNECTION:'',SSH_TTY:'',TMUX:'',STY:'',
  NODE_OPTIONS:`--import=${new URL('./notify-stub.mjs',import.meta.url).href}`,TALOS_NOTIFY_TEST_LOG:log,
}});
const records=()=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
const notifications=()=>records().filter(row=>row.args);
async function waitNotifications(count:number){
  const until=Date.now()+5_000;
  while(notifications().length!==count&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(notifications().length,count,`native notifications: ${JSON.stringify(notifications())}`);
}

for(const size of [{cols:60,rows:24},{cols:100,rows:30},{cols:120,rows:36}])test(`P4-E2E ${size.cols}x${size.rows}: focus, approvals, progress, privacy, exit`,{timeout:90_000},async()=>{
  const t=s.launch([],size);const baseline=notifications().length;const protocolBaseline=records().filter(row=>row.protocol).length;
  try{
    await toComposer(t);await turn(t,s.fake,`Hello ${size.cols}, check this prject.`);await t.observe(180);
    assert.equal(notifications().length,baseline,'unknown focus is silent');
    t.send(`${E}[I`);await turn(t,s.fake,`Again ${size.cols}, in foreground.`);await t.observe(180);
    assert.equal(notifications().length,baseline,'foreground is silent');
    t.send(`${E}[O`);await turn(t,s.fake,`Continue ${size.cols}, background.`);
    await waitNotifications(baseline+1);
    assert.ok(composerReady(t.screen()),'focus reports are not typed');
    assert.equal(notifications().at(-1).args[3],'Turn complete.');
    await t.submit(`TOOLS ${size.cols} please read and list the project.`);
    await t.waitFor('approval reached the real UI',approvalVisible);
    await waitNotifications(baseline+2);
    assert.equal(notifications().at(-1).args[3],'Approval needed.');
    await answerApproval(t,E);await t.waitFor('cancelled and idle',screen=>!approvalVisible(screen)&&idleFooter(screen));
    await t.observe(180);assert.equal(notifications().length,baseline+2,'cancel does not announce completion');
    assert.ok(await exitTalos(t));
    const output=t.output.read();
    assert.ok(output.focusEnables>0,'focus reporting enabled');
    assert.deepEqual(records().filter(row=>row.protocol).slice(protocolBaseline),[{protocol:'focus-off',raw:true}],
      'TALOS disables focus once, before leaving raw mode (ConPTY consumes this control)');
    assert.ok(output.progress.includes(3),'indeterminate progress emitted');
    assert.equal(output.progress.at(-1),0,'progress cleared on exit');
    for(const call of notifications().slice(baseline)){
      assert.equal(call.windowsHide,true);assert.equal(call.shell,false);assert.equal(call.timeout,10000);
      assert.doesNotMatch(JSON.stringify(call),/prject|background|README|project/iu);
    }
  }finally{await t.close();}
});

test('P4-E2E failure progress, retry recovery and resume without stale notification',{timeout:90_000},async()=>{
  const baseline=notifications().length;const t=s.launch();
  try{
    await toComposer(t);await focusReport(t,false);
    const failed=await turn(t,s.fake,'ERR404 please verify failure notification.');
    assert.match(failed.text,/^ ✗ Failed after \d+s/mu);await waitNotifications(baseline+1);
    assert.equal(notifications().at(-1).args[3],'Turn failed. Return to TALOS for details.');
    assert.equal(t.output.read().progress.at(-1),2);
    await turn(t,s.fake,'Try again with a normal answer.');await waitNotifications(baseline+2);
    assert.equal(t.output.read().progress.at(-1),0);assert.ok(await exitTalos(t));
  }finally{await t.close();}
  const resumed=s.launch(['--resume','last']);
  try{
    await toComposer(resumed);await resumed.observe(250);
    assert.equal(notifications().length,baseline+2,'history replay does not notify');
    assert.ok(await exitTalos(resumed));
  }finally{await resumed.close();}
});

for(const mode of ['off','bell'] as const)test(`P4-E2E persisted ui.notifications ${mode}`,{timeout:60_000},async()=>{
  const set=await s.profile.talos(['config','set','ui.notifications',JSON.stringify(mode)]);assert.equal(set.status,0,set.stderr);
  const t=s.launch();const baseline=notifications().length;
  try{
    await toComposer(t);await focusReport(t,false);const before=t.output.read().bells;
    await turn(t,s.fake,`Try the ${mode} notification setting.`);await t.observe(200);
    assert.equal(notifications().length,baseline,'no native notification');
    if(mode==='bell')assert.ok(t.output.read().bells>before,'BEL reached terminal');
    else assert.equal(t.output.read().bells,before,'off emits no BEL');
    assert.ok(await exitTalos(t));
  }finally{await t.close();}
});

test('P4-UPSTREAM hidden -v health check does not write into the real PTY',{skip:process.platform!=='win32'},async()=>{
  const script=join(s.profile.home,'native-health.mjs');
  writeFileSync(script,`import {runWindowsNotifier} from ${JSON.stringify(new URL('../../src/tui/windows-notifications.ts',import.meta.url).href)};
process.stdin.setRawMode(true);process.stdout.write('HEALTH_START\\n');
const result=await runWindowsNotifier(['-v'],new AbortController().signal);
process.stdout.write('\\nHEALTH_DONE\\n');process.stdin.setRawMode(false);process.exitCode=result?0:1;`);
  const t=new TerminalSession(process.execPath,[script],{cols:120,rows:36,cwd:s.profile.project,env:s.profile.env});
  try{
    assert.ok(await t.waitForExit(10_000));assert.equal(t.exit?.code,0);
    assert.match(t.screen().text,/HEALTH_DONE/u);
    assert.doesNotMatch(t.screen().text,/SnoreToast|Copyright|Lesser General Public/iu,'upstream output must remain captured');
  }finally{await t.close();}
});
