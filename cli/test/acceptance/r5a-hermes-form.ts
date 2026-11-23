/**
 * R5a exit frames (R5 gate §16, E13): "the Hermes form and no silent truncation", one fresh profile per terminal size,
 * behind the refusing sink (sink.ts): no request may leave 127.0.0.1, and models.dev (Q-R5-3) is off in test profiles.
 * The steps only drive TALOS and keep frames; the checks come after them, each failing with its own id (owner decisions
 * Q-R5-2…11, Q-R5-17, D-14). Written as declared reds before the lanes landed; lanes R and S are integrated (22acdb1f7,
 * d32f01b72, 8273b5e65), so they are plain checks now, and a build mutation proves they bite (ledger, R5a close).
 * The fake's /api/show states only the model's TRAINED maximum, which lane R rightly does not take as the running window
 * (Ollama envconfig), so the main stage shows `ctx ?` (E1); a second stage sets the window as a person would
 * (`models.<id>.contextWindow`) for the percentage and the Context Engine's compaction at half of it (Q-R5-4, E9).
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {MODE_ROW,approvalVisible,assertEnglishOnly,brokenBorders,composerReady,idleFooter,italianOn} from './checks.ts';
import {SLOW_ANSWER} from './fake-provider.ts';
import {answerApproval,clearComposer,exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,type RefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** 3,000 numbered lines, about 60,000 characters: far past the kernel's 8,000-character tool-result cut. */
export const BIG_LINES=3000;
export const BIG_FILE=Array.from({length:BIG_LINES},(_,i)=>`big file line ${String(i+1).padStart(4,'0')} of ${BIG_LINES}`).join('\n')+'\n';
/** The last screen line that holds `pattern` (a row), or '' when none does. */
const rowWith=(s:Screen,pattern:RegExp)=>[...s.lines].reverse().find(line=>pattern.test(line))??'';
/** The frame's lines from the last one that holds `marker` (a prompt) to the end: what this turn drew. */
function below(s:Screen,marker:string):string{
  const at=s.lines.map(line=>line.includes(marker)).lastIndexOf(true);
  return at<0?'':s.lines.slice(at).join('\n');
}
const REASONING='Looking at the files.';
/** The Settings sheet's Usage tab (stage 7.11; C5: `s` on the /usage page opens it): from its title row to its keys. */
function usageBlock(s:Screen):string{const at=s.lines.findIndex(line=>/^── Settings this project/u.test(line));return at<0?'':s.lines.slice(at,at+12).join('\n');}
/* COMPACTME's ten files, about 9 KB each (fake-provider.ts). */
const COMPACT_FILES=Object.fromEntries(Array.from({length:10},(_,k)=>[`c${k+1}.txt`,Array.from({length:180},(_,i)=>`compact file ${k+1} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n']));
const MODEL_ID='ollama:qwen3-coder-test';

export function registerHermesForm(label:string,size:{cols:number;rows:number},sink:RefusingSink){
  const wide=size.cols>=100;
  const s=stage({name:label,files:{'README.md':'# demo\n','big.txt':BIG_FILE,...COMPACT_FILES},extraEnv:sinkEnv(sink)});
  /* The window stage: the same kind of project, a person-set window of 16k tokens (Q-R5-3 override). */
  const w=stage({name:`${label}-window`,files:{'README.md':'# demo\n',...COMPACT_FILES},extraEnv:sinkEnv(sink)});
  let t:TerminalSession;
  const frames:Record<string,Screen>={};
  const name=(what:string)=>`${label} · ${size.cols}×${size.rows} · ${what}`;
  /* The requests of a stage's own fake (the window stage has its own). */
  let current=()=>s.fake;
  /* 0.6.13 gate (25/10/2026): once COMPACTME compacts, the kept requests (HUGE, BIGREAD, COMPACTME) have no answer between them any
     more, and toward a local engine the kernel sends them as ONE user message (r4 c722f55c9, see typedLast in fake-provider.ts):
     its text starts with «HUGE print everything» and its tool results are COMPACTME's reads. A turn's requests are the ones sent
     before that step, unless the prompt is COMPACTME's own. */
  let compactFrom=Number.POSITIVE_INFINITY;
  const sent=(prompt:string)=>{const fake=current();return fake.chatRequests().filter((r,i)=>(fake!==s.fake||i<compactFrom||prompt.startsWith('COMPACTME'))&&r.lastUser?.startsWith(prompt));};
  /** Wait for a state and keep the frame; on a timeout keep the frame anyway (the declared reds judge it). */
  async function soft(what:string,predicate:(x:Screen)=>boolean,timeout:number):Promise<Screen>{
    try{return await t.waitFor(what,predicate,{timeout});}catch{return t.screen();}
  }
  /** Back to an idle, empty composer whatever the last step left open (a dialog, a view, typed text). */
  async function settle(){
    for(let i=0;i<3&&!(composerReady(t.screen())&&idleFooter(t.screen()));i++){
      if(approvalVisible(t.screen())){await answerApproval(t,'4');}
      else if(!composerReady(t.screen())&&idleFooter(t.screen()))await clearComposer(t).catch(()=>{});
      else t.press('esc');
      await sleep(400);
    }
    await t.waitFor('an idle, empty composer',x=>composerReady(x)&&idleFooter(x),{timeout:30_000});
  }
  /** Submit a prompt; answer any approval with `key`; wait until the fake has seen it and TALOS is idle with `done`. */
  async function run(prompt:string,done:RegExp,{key='1',timeout=60_000}:{key?:string;timeout?:number}={}):Promise<Screen>{
    await t.submit(prompt);
    const end=Date.now()+timeout;
    for(;;){
      /* `done` is read below the prompt's own row: text from an earlier turn (a `failed`, an `OK`) must not end this one. */
      const x=await soft(`the turn "${prompt}"`,y=>approvalVisible(y)||(sent(prompt).length>0&&idleFooter(y)&&composerReady(y)&&done.test(below(y,prompt.slice(0,20)))),Math.max(1_000,end-Date.now()));
      if(approvalVisible(x)&&Date.now()<end){await answerApproval(t,key);await sleep(300);continue;}
      return x;
    }
  }

  test(name('TALOS opens at the composer'),async()=>{t=s.launch([],size);await toComposer(t);await sleep(1500);frames.idle=t.screen();});

  test(name('USAGE: a turn with usage, then /usage'),async()=>{
    frames.afterTurn=await run('hello usage',/\bOK\b/u);
    await sleep(500);frames.afterTurn=t.screen();
    await t.submit('/usage');
    /* C5: /usage is the CLI usage page; this session's figures are one key away, in Settings */
    await t.waitFor('the usage page',x=>/── CLI usage/u.test(x.text),{timeout:10_000});
    t.send('s');
    frames.usageView=await soft('the /usage view',x=>/Compactions/u.test(usageBlock(x)),10_000);
    t.press('esc');await soft('settings closed',x=>!/── Settings this project/u.test(x.text),5_000);
    await settle();
  });

  test(name('RETRY: a 429 with Retry-After 2 twice, then the answer'),async()=>{
    await t.submit('RETRY please answer');
    frames.retrying=await soft('the retry line',x=>/Retrying/u.test(x.text),15_000);
    frames.recovered=await soft('the recovered answer',x=>idleFooter(x)&&x.text.includes('Recovered after retries.'),60_000);
    await settle();
  });

  test(name('ERR401 and ERR403: the two refusals'),async()=>{
    frames.e401=await run('ERR401 check the key',/failed|error|key/iu,{timeout:40_000});await settle();
    frames.e403=await run('ERR403 check the access',/failed|error|access/iu,{timeout:40_000});await settle();
  });

  test(name('BUSY: the fixed line during a turn, and a prompt queued behind it'),async()=>{
    await t.submit('SLOW busy check');
    frames.busy=await soft('the busy frame',x=>x.text.includes(SLOW_ANSWER.slice(0,30))&&!idleFooter(x),30_000);
    await t.submit('queued follow up');
    frames.queued=await soft('the queued prompt',x=>x.text.includes('queued follow up'),10_000);
    frames.afterQueue=await soft('both turns ended',x=>idleFooter(x)&&composerReady(x)&&sent('queued follow up').length>0,90_000);
    await settle();
  });

  test(name('THINK: a turn with reasoning, then Ctrl+T'),async()=>{
    frames.thought=await run('MD think first',/Summary of the project/u);
    await sleep(500);frames.thought=t.screen();
    const before=frames.thought.text;
    t.press('ctrl+t');
    frames.thoughtOpen=await soft('Ctrl+T redrew the transcript',x=>x.text!==before,5_000);
    await sleep(300);frames.thoughtOpen=t.screen();
    const open=frames.thoughtOpen.text;
    t.press('ctrl+t');
    await soft('Ctrl+T closed the thinking again',x=>x.text!==open,5_000);
    await settle();
  });

  test(name('DENYRULE: a command the policy refuses without asking'),async()=>{
    frames.denyRule=await run('DENYRULE loop three times',/Done: the command was refused/u,{key:'4'});
    /* stage 7.12 «+1 completa» (owner 03/10): Ctrl+O opens the full transcript, the refused row open; Ctrl+O comes back */
    t.press('ctrl+o');
    frames.denyRuleExpanded=await soft('the full transcript',x=>/^ Transcript · /mu.test(x.text),5_000);
    await sleep(300);frames.denyRuleExpanded=t.screen();
    t.press('ctrl+o');
    await soft('back at the prompt',x=>!/^ Transcript · /mu.test(x.text),5_000);
    await settle();
  });

  test(name('HUGE: a command printing 3,000 lines'),async()=>{
    frames.huge=await run('HUGE print everything',/Done: printed the long output/u,{timeout:90_000});
    /* the approved mockup folds the call into its group; the full transcript (Ctrl+O) keeps its row and what it says */
    t.press('ctrl+o');
    await soft('the full transcript',x=>/^ Transcript · /mu.test(x.text),5_000);
    t.send('{');await sleep(400);frames.hugeFull=t.screen();
    t.press('ctrl+o');
    await soft('back at the prompt',x=>!/^ Transcript · /mu.test(x.text),5_000);
    await settle();
  });

  test(name('BIGREAD: a read of a 3,000-line file'),async()=>{
    frames.bigRead=await run('BIGREAD read big.txt',/Done: read the big file/u,{timeout:60_000});
    /* the approved mockup folds the call into its group; the full transcript (Ctrl+O) keeps its row and what it says */
    t.press('ctrl+o');
    await soft('the full transcript',x=>/^ Transcript · /mu.test(x.text),5_000);
    t.send('{');await sleep(400);frames.bigReadFull=t.screen();
    t.press('ctrl+o');
    await soft('back at the prompt',x=>!/^ Transcript · /mu.test(x.text),5_000);
    await settle();
  });

  test(name('COMPACTME: ten reads with no window known, until the kernel compacts'),async()=>{
    /* 0.6.13 gate (25/10/2026; first red at 80a0d077e, the desktop adapter): «With an unknown window the conversation is compacted
       at 200,000 tokens» and «it starts at 0.75 of the model's window, or at `context.compactAtTokens` when that is lower»
       (CHANGELOG 0.6.13), no longer «every 8 rounds» as the bare kernel did. Ten reads of 9 KB never reach 200,000, so the person
       sets the cap, as `talos config set` does; the CLI reads it again at every turn (talos-composition.ts compactAtTokensSetting).
       30,000 is measured: above the ~11k of TALOS's instructions and tools plus what a summary keeps, and crossed during this turn
       (a probe on the built CLI with only BIGREAD before it: after the seventh read, «Context compacted by the kernel … earlier
       messages summarized · 30.4k → 6.2k tokens»; here the earlier turns only make it come sooner). */
    const cap=await s.profile.talos(['config','set','context.compactAtTokens','30000','--scope','user']);
    assert.equal(cap.status,0,`config set failed: ${cap.stdout}${cap.stderr}`);
    compactFrom=s.fake.chatRequests().length;
    await t.submit('COMPACTME read the ten files');
    frames.compactKernel=await soft('the kernel compaction notice',x=>/Context compacted by the kernel/u.test(x.text),180_000);
    await soft('the compaction turn ended',x=>idleFooter(x)&&composerReady(x),180_000);
    await settle();
  });

  test(name('close'),async()=>{await exitTalos(t);});

  /* Owner 2026-09-24: the Context Engine runs from a 64k window (below it, TALOS's own ~11k of instructions and tools do not
     fit its budget); 65,536 is the smallest common window it runs for. The Context Engine's compaction itself is proven
     through the real composition, kernel and engine in test/runtime/r5a-coord-ce-compaction.test.ts: on this Ollama fake the
     engine asked for a summary of the closed turns at every request and never committed one (ledger R5a: not verified end
     to end, and an open item: a refused summary is silent and retried at every request). */
  test(name('WINDOW: a person-set 64k window gives the context in use against it, with a percentage'),async()=>{
    const set=await w.profile.talos(['config','set',`models.${MODEL_ID}.contextWindow`,'65536','--scope','user']);
    assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
    current=()=>w.fake;
    t=w.launch([],size);await toComposer(t);
    frames.windowTurn=await run('hello window',/\bOK\b/u);await sleep(500);frames.windowTurn=t.screen();
    await exitTalos(t);
    current=()=>s.fake;/* the checks below read the main stage's requests */
  });
  after(async()=>{await sink.close();});

  test(name('no request left 127.0.0.1 (gate E7, E13)'),()=>{
    assert.deepEqual(sink.hits,[],`TALOS tried to reach the network: ${JSON.stringify(sink.hits)}`);
  });
  test(name('every frame is English and no frame mixes a border with content'),()=>{
    for(const [key,frame] of Object.entries(frames)){
      /* The expanded deny row is R5A-DENY's (its Italian kernel reason is finding 15); the others must be English now. */
      if(!['denyRuleExpanded','hugeFull','bigReadFull'].includes(key))assertEnglishOnly(frame.text,`D-05 ${key}`);
      assert.deepEqual(brokenBorders(frame),[],`${key}: rows mix a border with content`);
    }
  });

  /* ---- R5a checks, each failing with its own id (gate E13). ---- */
  test(name('R5a: R5A-STATUS one status row in the Hermes form'),()=>{
    const text=frames.afterTurn!.text;
    /* Q-R5-2 with the fake's usage (1,200 in, 340 out); no running window is known, so `ctx ?` (E1, kept at every width by
       E2); Q-R5-5: an Ollama model is local. */
    const row=[...frames.afterTurn!.lines].reverse().find(line=>/ctx /u.test(line))??'';
    /* the approved mockup draws the model row from 100 columns; under it the footer is the mode row alone, which keeps `ctx` (FE-048) */
    if(!wide){assert.match(text,MODE_ROW,`R5A-STATUS: no mode row:\n${text}`);assert.match(row,MODE_ROW,`R5A-STATUS: \`ctx\` outside the mode row under 100 columns: ${row}`);return;}
    assert.match(row,/ctx \?/u,`R5A-STATUS: the unknown window is not said as "ctx ?" (E1):\n${text}`);
    assert.doesNotMatch(row,/ctx [\d.]+k?\//u,`R5A-STATUS: a window nobody knows was given a figure (E1): ${row}`);
    if(wide){
      assert.match(row,/↑\s?1\.2k/u,`R5A-STATUS: no "↑1.2k" input tokens: ${row}`);
      assert.match(row,/↓\s?340\b/u,`R5A-STATUS: no "↓340" output tokens: ${row}`);
    }
  });
  test(name('R5a: R5A-USAGE /usage shows tokens, the window with its source, and the cost'),()=>{
    const view=usageBlock(frames.usageView!);
    assert.match(view,/1,200|1\.2k/u,`R5A-USAGE: /usage does not show the 1,200 input tokens (Q-R5-8):\n${view}`);
    assert.match(view,/\b340\b/u,`R5A-USAGE: /usage does not show the 340 output tokens:\n${view}`);
    assert.match(view,/window unknown/u,`R5A-USAGE: /usage does not say the window is unknown (E1):\n${view}`);
    assert.match(view,/\blocal\b/u,`R5A-USAGE: /usage does not say the engine is local (Q-R5-5):\n${view}`);
  });
  test(name('R5a: R5A-RETRY the wait is said and Retry-After is honoured'),()=>{
    const text=frames.retrying!.text;
    assert.match(text,/Retrying/u,`R5A-RETRY: no "Retrying" line while TALOS waits (Q-R5-6):\n${text}`);
    assert.match(text,/HTTP 429/u,`R5A-RETRY: the retry line does not name HTTP 429:\n${text}`);
    if(wide)assert.match(text,/Retrying · attempt \d of \d · HTTP 429 · in \d+s · esc to stop/u,`R5A-RETRY: the retry line is not "Retrying · attempt n of m · HTTP 429 · in Ns · esc to stop":\n${text}`);
    assert.doesNotMatch(text,/^ \S Thinking\b/mu,`R5A-RETRY: a wait is drawn as "thinking":\n${text}`);
    assert.ok(frames.recovered!.text.includes('Recovered after retries.'),'R5A-RETRY: the turn did not recover after two 429s');
    const at=sent('RETRY please answer').map(r=>r.at);
    assert.ok(at.length>=3,`R5A-RETRY: ${at.length} requests, expected 3`);
    for(let i=1;i<3;i++)assert.ok(at[i]!-at[i-1]!>=1_800,`R5A-RETRY: request ${i+1} came ${at[i]!-at[i-1]!} ms after the one before; Retry-After asked 2 s (Q-R5-6)`);
  });
  test(name('R5a: R5A-AUTH a 401 speaks of the key, a 403 of access'),()=>{
    const e401=below(frames.e401!,'ERR401'),e403=below(frames.e403!,'ERR403');
    assert.match(e401,/\bkey\b/iu,`R5A-AUTH: the 401 does not speak of the key:\n${e401}`);
    assert.match(e403,/\b403\b|\baccess\b|\bpermission\b|not allowed/iu,`R5A-AUTH: the 403 does not speak of access:\n${e403}`);
    /* The 403's own sentence and its next step; the kernel's key-bench notice that may come before it (a keyless local
       provider's "key was refused … paused") is recorded for R6, where the kernel's bench policy is reconciled. */
    const said403=e403.split('\n').filter(line=>/HTTP 403|denied access|may use this model/u.test(line)).join('\n');
    assert.doesNotMatch(said403,/\bkey\b/iu,`R5A-AUTH: the 403 is worded as a key problem (ledger R2: 401/403 share wording):\n${said403}`);
  });
  test(name('R5a: R5A-BUSY the fixed line says what Enter does, and the queued prompt waits its turn'),()=>{
    const busy=frames.busy!.text;
    /* the approved mockup: the empty composer says what typing does during a turn */
    assert.match(busy,/│ › Type to queue a message · esc to stop/u,`R5A-BUSY: no line says what Enter does during a turn (Q-R5-7, E8):\n${busy}`);
    assert.match(frames.queued!.text,/queued/iu,`R5A-BUSY: the prompt typed during the turn is not shown as queued:\n${frames.queued!.text}`);
    const lines=frames.afterQueue!.lines;
    const answer=lines.findIndex(line=>line.includes(SLOW_ANSWER.slice(0,20))),queued=lines.findIndex(line=>line.includes('queued follow up'));
    assert.ok(queued<0||answer<0||answer<queued,`R5A-BUSY: the queued prompt is drawn before the answer it waited for (E8):\n${frames.afterQueue!.text}`);
  });
  test(name('R5a: R5A-THINK the thinking is one collapsed line that Ctrl+T opens'),()=>{
    const text=frames.thought!.text;
    /* the approved mockup: `  ▸ Thought for 4s  click to read` (Ctrl+T still opens every block) */
    assert.match(text,/^ {2}▸ Thought for \d+s {2}click to read/mu,`R5A-THINK: no "Thought for N s" line (Q-R5-9):\n${text}`);
    assert.ok(!text.includes(REASONING),`R5A-THINK: the thinking is drawn open by default:\n${text}`);
    assert.ok(frames.thoughtOpen!.text.includes(REASONING),`R5A-THINK: Ctrl+T does not open the thinking:\n${frames.thoughtOpen!.text}`);
  });
  test(name('R5a: R5A-DENY a refusal nobody asked for names what decided'),()=>{
    const turn=below(frames.denyRule!,'DENYRULE');
    assert.doesNotMatch(turn,/you did not approve/iu,`R5A-DENY: a refusal the person never gave is worded as theirs (finding 15):\n${turn}`);
    assert.match(turn,/denied by (?:rule|policy)|\bpolicy\b|\brule\b/iu,`R5A-DENY: the row does not name the rule or policy that refused (Q-R5-17):\n${turn}`);
    const found=italianOn(frames.denyRuleExpanded!.text);
    assert.equal(found.length,0,`R5A-DENY: Italian on the expanded row: ${found.join(', ')}`);
  });
  test(name('R5a: R5A-SAVED a long output is kept in a private file, and the row and the model say where'),()=>{
    const turn=below(frames.hugeFull!,'HUGE');
    assert.match(turn,/\b(?:saved|kept|full output)\b/iu,`R5A-SAVED: the row does not say the full output was kept (Q-R5-10, E6):\n${turn}`);
    assert.match(turn,/\d[\d,.]*k?\s*(?:of|\/)\s*\d[\d,.]*k?/u,`R5A-SAVED: the row does not say kept/total:\n${turn}`);
    const result=sent('HUGE print everything').flatMap(r=>r.toolTexts??[]).at(-1);
    assert.ok(result,'R5A-SAVED: the model never received the tool result');
    const marker=result.text.split(/\r?\n/u).filter(line=>/\bTALOS\b|full output|kept/iu.test(line)).join('\n');
    assert.match(marker,/\b(?:saved|full output|kept)\b/iu,`R5A-SAVED: the model's copy has no marker saying the output was kept (${result.length} characters)`);
    assert.match(marker,/[A-Za-z]:\\[^\s"']+|\/[^\s"']+\.(?:txt|log|out)/u,`R5A-SAVED: the model's marker names no file: ${marker}`);
    assert.ok(!marker.includes(s.profile.project),'R5A-SAVED: the full output was kept under the project (E6)');
    assert.equal(italianOn(marker).length,0,`R5A-SAVED: Italian in the model's marker: ${italianOn(marker).join(', ')}`);
  });
  test(name('R5a: R5A-READCUT a cut read says how much was shown'),()=>{
    const turn=below(frames.bigReadFull!,'BIGREAD');
    const result=sent('BIGREAD read big.txt').flatMap(r=>r.toolTexts??[]).at(-1);
    assert.ok(result,'R5A-READCUT: the model never received the read result');
    if(result.length<BIG_FILE.length){
      assert.match(turn,/of 3,?000 lines/u,`R5A-READCUT: the row does not say how many of the 3,000 lines were shown (Q-R5-11):\n${turn}`);
      /* G02: the unified kernel cuts from the MIDDLE (head and tail kept), so its English marker is inside the text, not at its end.
         0.6.13 gate (25/10/2026): since 80a0d077e the CLI runs the desktop adapter and a read reaches the model whole («tool results
         are no longer cut at 8,000 characters: they reach the model whole», CHANGELOG 0.6.13); what the model gets short of the
         file is the kernel's own page (2,000 of 3,000 lines), whose English first line says so. Either marker names the cut. */
      const marker=/^\[TALOS read lines \d+-\d+ of 3000 in "big\.txt"; [^\n]*\]$/mu.exec(result.text)??/\n\n… \[TALOS cut \d+ characters from the middle of this output\] …\n\n/u.exec(result.text);
      assert.ok(marker,`R5A-READCUT: the model's copy is cut with no English marker: ${JSON.stringify(result.tail.slice(-300))}`);
      /* `leggi` is the name of the tool the model calls (the contract with the kernel, never translated), not Italian prose */
      const prose=marker[0].replace(/\bleggi\b/gu,'');
      assert.equal(italianOn(prose).length,0,`R5A-READCUT: Italian in the model's marker: ${italianOn(prose).join(', ')}`);
    }
  });
  test(name('R5a: R5A-CHROME the header and the last row do not repeat themselves'),()=>{
    const idle=frames.idle!;
    assert.doesNotMatch(idle.text,/\binteractive\b/u,`R5A-CHROME: the header still says "interactive" (D-14):\n${idle.text}`);
    assert.ok(!idle.lines.some(line=>line.replace(/[│\s]/gu,'')==='idle'),`R5A-CHROME: an "idle" row is still reserved above the composer (D-14):\n${idle.text}`);
    const last=[...idle.lines].reverse().find(line=>line.trim()!=='')??'';
    assert.doesNotMatch(last,/session [0-9a-f]{8}-/u,`R5A-CHROME: the last row repeats the session id (D-14): ${last}`);
  });
  test(name('R5a: R5A-WINDOW a person-set window gives ctx used/65.5k and a percentage'),()=>{
    const row=[...frames.windowTurn!.lines].reverse().find(line=>/ctx /u.test(line))??'';
    /* the approved mockup's model row says `ctx N%`; the used/window figures are in /usage (and under 100 columns there is no model row) */
    if(wide)assert.match(row,/ctx ~?(?:<1|\d+)%/u,`R5A-WINDOW: no percentage with the 65,536 window (Q-R5-2/3): ${row}`);
  });
  test(name('R5a: R5A-COMPACT the kernel compaction is named on screen, in English'),()=>{
    const kernel=frames.compactKernel!.text;
    assert.match(kernel,/Context compacted by the kernel/u,`R5A-COMPACT: the kernel compacted with no notice (Q-R5-4):\n${kernel}`);
    assert.equal(italianOn(kernel).length,0,`R5A-COMPACT: Italian on the compaction frame: ${italianOn(kernel).join(', ')}`);
  });
}
