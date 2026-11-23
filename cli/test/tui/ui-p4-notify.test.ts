import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {createFocusFilter,installFocusFilter} from '../../src/tui/focus.ts';
import {createTerminalNotifications,notificationChannel,notificationSequence,FOCUS_ON,FOCUS_OFF} from '../../src/tui/notifications.ts';
import {sendWindowsNotification,runWindowsNotifier,windowsNotificationExecutable} from '../../src/tui/windows-notifications.ts';
import {OutputMeter} from '../acceptance/terminal.ts';

const E='\u001b';
function fixture(extra:Record<string,unknown>={}){
  const writes:string[]=[];let pending:(()=>void)|null=null;
  const n=createTerminalNotifications({write:(s:string)=>writes.push(s),env:{},platform:'linux',
    schedule:(fn:()=>void)=>{pending=fn;return()=>{pending=null;};},...extra} as any);
  n.start();return{n,writes,flush(){const fn=pending;pending=null;fn?.();},bells:()=>writes.filter(x=>x==='\u0007').length};
}
test('P4-FOCUS every split is stripped, keys and bracketed paste survive',()=>{
  for(const seq of [`${E}[I`,`${E}[O`])for(let split=1;split<seq.length;split++){
    const focus:boolean[]=[];const f=createFocusFilter(x=>focus.push(x));
    /* REV-ESC-PTY: at split=1 the bare ESC goes straight through (armed) instead of being held. */
    assert.equal(f.take(`a${seq.slice(0,split)}`),split===1?`a${E}`:'a');
    assert.equal(f.take(`${seq.slice(split)}b`),'b');assert.deepEqual(focus,[seq.endsWith('I')]);
  }
  const focus:boolean[]=[];const f=createFocusFilter(x=>focus.push(x));
  const paste=`${E}[200~literal ${E}[O inside${E}[201~`;
  let text='';for(const ch of paste)text+=f.take(ch);
  assert.equal(text,paste);assert.deepEqual(focus,[]);
  assert.equal(f.take(`${E}[A${E}[Z`),`${E}[A${E}[Z`);
  assert.equal(f.take(E),E,'a lone Esc goes straight through (REV-ESC-PTY)');assert.equal(f.flush(),'');assert.equal(f.flush(),'');
});
test('P4-FOCUS read wrapper releases lone Esc at once and restores input on disposal',async()=>{
  const stdin=new EventEmitter() as any;const q=[Buffer.from(E)];const original=()=>q.shift()??null;stdin.read=original;
  const off=installFocusFilter(stdin,()=>{});
  /* REV-ESC-PTY: the Esc key is never held — it goes straight through to Ink. */
  assert.equal(stdin.read().toString(),E);
  off();assert.equal(stdin.read,original);
});
test('P4-UTF8 Buffer fragments retain accented text, CJK and emoji',()=>{
  const original=Buffer.from('caffè 中文 👩🏽‍💻');
  const chunks=Array.from(original,byte=>Buffer.from([byte]));
  const stdin={read:()=>chunks.shift()??null};const off=installFocusFilter(stdin,()=>{});
  const result:Buffer[]=[];let chunk;while((chunk=stdin.read())!==null)result.push(chunk);
  off();assert.equal(Buffer.concat(result).toString('utf8'),original.toString('utf8'));
});
test('P4-QUIET streamed token events never write terminal progress or notifications',()=>{
  const f=fixture();f.n.focus(false);f.n.event({type:'run.started',runId:'stream'});
  const count=f.writes.length;
  for(let i=0;i<10000;i++)f.n.event({type:'assistant.delta',text:'word',runId:'stream'});
  assert.equal(f.writes.length,count);f.n.dispose();
});
test('P4-LIFECYCLE unknown and foreground stay silent; live completion occurs once outside focus',()=>{
  const f=fixture();
  f.n.event({type:'run.started',runId:'a'});f.n.event({type:'run.completed',runId:'a'});f.flush();assert.equal(f.bells(),0);
  f.n.focus(true);f.n.event({type:'run.started',runId:'b'});f.n.event({type:'run.completed',runId:'b'});f.flush();assert.equal(f.bells(),0);
  f.n.focus(false);f.n.event({type:'run.started',runId:'c'});f.n.event({type:'run.completed',runId:'c'});f.n.event({type:'run.completed',runId:'c'});f.flush();assert.equal(f.bells(),1);
  assert.ok(f.writes.includes(`${E}]9;4;3;0\u0007`));assert.ok(f.writes.includes(`${E}]9;4;0;0\u0007`));
  f.n.dispose();assert.equal(f.writes.at(-1),FOCUS_OFF+`${E}]9;4;0;0\u0007`);
  const count=f.writes.length;f.n.dispose();f.n.approval('after');assert.equal(f.writes.length,count);
});
test('P4-LIFECYCLE replay, stale run, queue, retry, cancellation and return to focus suppress alerts',()=>{
  const f=fixture();f.n.focus(false);
  f.n.event({type:'run.started',history:true,runId:'old'});f.n.event({type:'run.completed',runId:'old'});f.flush();assert.equal(f.bells(),0);
  f.n.event({type:'run.started',runId:'new'});f.n.event({type:'run.completed',runId:'old'});f.flush();assert.equal(f.bells(),0);
  f.n.event({type:'run.completed',runId:'new'},true);f.flush();assert.equal(f.bells(),0);
  f.n.event({type:'run.started',runId:'next'});f.n.event({type:'run.failed',runId:'next'});
  f.n.event({type:'run.started',runId:'retry'});f.flush();assert.equal(f.bells(),0);
  f.n.event({type:'run.cancelled',runId:'retry'});f.flush();assert.equal(f.bells(),0);
  f.n.event({type:'run.started',runId:'final'});f.n.event({type:'run.completed',runId:'final'});f.n.focus(true);f.flush();assert.equal(f.bells(),0);
});
test('P4-LIFECYCLE approval deduplicates; off still reports progress, error uses state 2',()=>{
  const f=fixture();f.n.focus(false);f.n.approval('r1');f.n.approval('r1');assert.equal(f.bells(),1);
  f.n.approval(null);f.n.approval('r1');assert.equal(f.bells(),1);f.n.approval('r2');assert.equal(f.bells(),2);
  const off=fixture({setting:'off'});off.n.focus(false);off.n.approval('x');off.n.event({type:'run.started'});off.n.event({type:'run.failed'});off.flush();
  assert.equal(off.bells(),0);assert.ok(off.writes.includes(`${E}]9;4;2;100\u0007`));
});
test('P4-CHANNEL routes known protocols, SSH/multiplexer to BEL; sanitizes controls',()=>{
  assert.equal(notificationChannel('auto',{WT_SESSION:'fake'},'win32','x64'),'windows');
  assert.equal(notificationChannel('auto',{TERM_PROGRAM:'iTerm.app'},'darwin','arm64'),'iterm');
  assert.equal(notificationChannel('auto',{KITTY_WINDOW_ID:'1'},'linux','x64'),'kitty');
  assert.equal(notificationChannel('auto',{TERM_PROGRAM:'ghostty'},'linux','x64'),'ghostty');
  for(const env of [{WT_SESSION:'x',SSH_CONNECTION:'x'},{TERM_PROGRAM:'ghostty',TMUX:'x'}])assert.equal(notificationChannel('auto',env,'win32','x64'),'bell');
  assert.equal(notificationChannel('bell',{WT_SESSION:'x'},'win32','x64'),'bell');
  assert.equal(notificationSequence('iterm','done'),`${E}]9;TALOS: done\u0007`);
  assert.equal(notificationSequence('ghostty','done'),`${E}]777;notify;TALOS;done\u0007`);
  assert.match(notificationSequence('kitty','done'),/^\u001b\]99;i=talos:o=unfocused;TALOS: done\u001b\\$/u);
  assert.equal(notificationSequence('iterm',`x${E}]9;evil\u0007\n`),`${E}]9;TALOS: x]9;evil\u0007`);
});
test('P4-PRIVACY native notification receives only fixed text; failure fallback suppressed after focus/exit',async()=>{
  const calls:Array<{message:string;signal:AbortSignal}>=[];let finish:(ok:boolean)=>void=()=>{};
  const f=fixture({env:{WT_SESSION:'x'},platform:'win32',arch:'x64',nativeNotify:(message:string,signal:AbortSignal)=>{calls.push({message,signal});return new Promise<boolean>(resolve=>{finish=resolve;});}});
  f.n.focus(false);f.n.event({type:'run.started',prompt:'PRIVATE',runId:'secret'});f.n.event({type:'run.completed',runId:'secret'});f.flush();
  assert.equal(calls.length,1);assert.equal(calls[0]!.message,'Turn complete.');
  f.n.focus(true);assert.ok(calls[0]!.signal.aborted);finish(false);await Promise.resolve();await Promise.resolve();assert.equal(f.bells(),0);
  f.n.focus(false);f.n.approval('new');finish(false);await Promise.resolve();await Promise.resolve();assert.equal(f.bells(),1);
  f.n.dispose();
});
test('P4-WINDOWS hidden shell-free bounded invocation accepts upstream benign status codes',async()=>{
  let invocation:any;
  const exec=(file:any,args:any,options:any,callback:any)=>{invocation={file,args,options};queueMicrotask(()=>callback({code:3},'',''));return{unref(){}};};
  assert.equal(await sendWindowsNotification('Approval needed.',new AbortController().signal,{exec:exec as any,executable:'snoretoast.exe'}),true);
  assert.equal(invocation.file,process.execPath);assert.match(invocation.args[0],/windows-notification-worker\.(?:ts|js)$/u);
  assert.equal(invocation.args[1],'snoretoast.exe');
  assert.deepEqual(invocation.args.slice(2),['-t','TALOS','-m','Approval needed.','-silent']);
  assert.equal(invocation.options.windowsHide,true);assert.equal(invocation.options.shell,false);assert.ok(invocation.options.timeout>0&&invocation.options.timeout<=15000);
  const failing=(_f:any,_a:any,_o:any,cb:any)=>{queueMicrotask(()=>cb({code:'ENOENT'}));return{unref(){}};};
  assert.equal(await sendWindowsNotification('x',new AbortController().signal,{exec:failing as any,executable:'missing.exe'}),false);
});

test('P4-UPSTREAM real SnoreToast executable accepts -v without notification or registration',{skip:process.platform!=='win32'},async()=>{
  assert.equal(await runWindowsNotifier(['-v'],new AbortController().signal),true);
});
test('P4-NATIVE-TIMEOUT an indeterminate native outcome does not trigger a duplicate BEL',async()=>{
  const exec=(_f:any,_a:any,_o:any,cb:any)=>{queueMicrotask(()=>cb({killed:true,signal:'SIGTERM',code:null}));return{unref(){}};};
  assert.equal(await sendWindowsNotification('Turn complete.',new AbortController().signal,{exec:exec as any,executable:'snoretoast.exe'}),true,
    'a toast may already have been shown before its process timed out');
});
test('P4-NATIVE-ENV helper inherits only the existing OS allowlist, no credentials or arbitrary values',async()=>{
  let options:any;
  const exec=(_f:any,_a:any,opts:any,cb:any)=>{options=opts;queueMicrotask(()=>cb(null));return{unref(){}};};
  const names=['OPENAI_API_KEY','DATABASE_URL','NODE_OPTIONS','GH_PAT','TALOS_NOTIFY_TEST_LOG'];
  const previous=names.map(name=>process.env[name]);
  try{
    for(const name of names)process.env[name]='P4_FAKE_ENV_CANARY';
    await sendWindowsNotification('Turn complete.',new AbortController().signal,{exec:exec as any,executable:'snoretoast.exe'});
    assert.ok(options.env,'an omitted env would inherit everything');
    for(const name of names)assert.equal(Object.hasOwn(options.env,name),false,name);
    assert.ok(options.env.PATH);
  }finally{
    for(const [index,name] of names.entries()){
      if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];
    }
  }
});

test('P4-METER counts split focus/progress protocol bytes once',()=>{
  const meter=new OutputMeter();const sequence=FOCUS_ON+`${E}]9;4;3;0\u0007`+FOCUS_OFF+`${E}]9;4;0;0\u0007`;
  for(const char of sequence)meter.feed(char);
  const output=meter.stop();assert.equal(output.focusEnables,1);assert.equal(output.focusDisables,1);assert.deepEqual(output.progress,[3,0]);
  assert.equal(output.bells,0,'OSC terminators are not notification bells');
  const bell=new OutputMeter();bell.feed('\u0007');assert.equal(bell.stop().bells,1);
});

/* Stage 6b (owner 02/10, «avviso del mockup + notifica»): a sub-agent's question notifies as an approval does — once per
   question, only when TALOS is not in front — and says so in its own words. */
test('6b: an agent\'s question notifies once per question, only when TALOS is not in front',()=>{
  const f=fixture();f.n.agentQuestion('q0');assert.equal(f.bells(),0,'in front: nothing (it was seen)');
  f.n.focus(false);f.n.agentQuestion('q1');f.n.agentQuestion('q1');assert.equal(f.bells(),1,'once per question');
  f.n.agentQuestion(null);f.n.agentQuestion('q2');assert.equal(f.bells(),2);
});
