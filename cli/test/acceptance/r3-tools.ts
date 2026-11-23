/**
 * R3 exit frames (gate §8.3, E14): read / shell / write / edit / deny / failing command / interrupt / status words, one
 * fresh profile per terminal size (the gate measured a stale approval when a second TALOS reused a profile, §0.11).
 * The steps drive TALOS with keys that mean the same in the R2 and the R3 dialog (`1` = allow once, `4` = deny); what R3
 * must change is asserted as declared reds owned by R3, each failing with its own id, until the lanes land.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {approvalVisible,assertEnglishOnly,brokenBorders,composerReady,idleFooter} from './checks.ts';
import {SLOW_ANSWER} from './fake-provider.ts';
import {answerApproval,exitTalos,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const MARKER='dir-marker-r3.txt';
/** The last screen line that holds `pattern` (a row), or '' when none does. */
/* under the mockup's two-cell indent a 60-column row cuts the command in the middle to keep its facts (`cmd /…dir /b`) */
const SHELL_DIR=/Shell\s+cmd \/(?:c |…)dir \/b/u;
function rowWith(s:Screen,pattern:RegExp):string{return [...s.lines].reverse().find(line=>pattern.test(line))??'';}
const ISOLATION=/⛉ sandbox|⛶ host/u;
/* Labels by the R2 table (`Read file`) or the gate's short examples (`Read`): the label wording is R2's, not R3's. */
const READ=/Read(?: file)?\s+README\.md/u,WRITE_NOTES=/Write(?: file)?\s+notes\.txt/u,EDIT_INDEX=/(?:Edit|Write)(?: file)?\s+src\/index\.js/u;
/** A C0 or DEL control character: a key that reached a prompt as text. */
const CONTROL=/[\u0000-\u0008\u000b-\u001f\u007f]/u;
const quiet=async()=>{await new Promise(resolve=>setTimeout(resolve,300));};

export function registerToolFrames(label:string,size:{cols:number;rows:number}){
  const wide=size.cols>=100;
  const s=stage({name:label,files:{'README.md':'# demo\n','src/index.js':'console.log(1)\n',[MARKER]:'marker\n'}});
  let t:TerminalSession;
  const frames:Record<string,Screen>={};
  const name=(what:string)=>`${label} · ${size.cols}×${size.rows} · ${what}`;
  const idle=(prompt:string)=>(x:Screen)=>idleFooter(x)&&s.fake.chatRequests().some(r=>r.lastUser?.startsWith(prompt));
  /* An approval is answered at a person's pace, after the Q-R3-16 grace (harness.ts answerApproval). */
  const answer=(key:string)=>answerApproval(t,key);
  /* The dialog for THIS target: its own line reads `<Label> · <target>` (a transcript row reads `<Label> <target> · …`), so a
     target already on screen from an earlier turn (notes.txt in the dir listing) does not match a different dialog. */
  const asking=(target:string)=>(x:Screen)=>approvalVisible(x)&&x.text.includes(`· ${target}`);

  test(name('TALOS opens at the composer'),async()=>{t=s.launch([],size);await toComposer(t);});

  test(name('a streaming answer is on screen before the turn ends'),async()=>{
    await t.submit('SLOW tell me something');
    frames.streaming=await t.waitFor('part of the answer while it streams',x=>x.text.includes(SLOW_ANSWER.slice(0,30))&&!idleFooter(x),{timeout:30_000});
    await t.waitFor('the slow turn ended',idle('SLOW'),{timeout:60_000});
  });

  test(name('TOOLS: the shell command asks, is allowed once, then the write asks and is allowed once'),async()=>{
    await t.submit('TOOLS inspect the repo and write notes');
    frames.shellApproval=await t.waitFor('the shell approval',asking('cmd /c dir /b'),{timeout:30_000});
    /* Q-R3-16: a `1` sent the instant the dialog is drawn is typed ahead: it goes to the composer and never answers. */
    t.send('1');
    await quiet();frames.typedAhead=t.screen();
    await answer('1');
    frames.writeApproval=await t.waitFor('the write approval',asking('notes.txt'),{timeout:30_000});
    await answer('1');
    frames.tools=await t.waitFor('the tools turn ended',x=>idle('TOOLS')(x)&&/Done: used 3 tools/u.test(x.text),{timeout:30_000});
    assert.ok(existsSync(join(s.profile.project,'notes.txt')),'the allowed write happened');
    /* the approved mockup folds finished calls into groups; the full transcript (Ctrl+O) keeps one row per call */
    t.press('ctrl+o');
    await t.waitFor('the full transcript of the tools turn',x=>/^ Transcript · /mu.test(x.text),{timeout:10_000});
    /* each key waits for its redraw: ConPTY merges two chords sent together (R3-KEYS) */
    t.send('{');await quiet();
    frames.toolsFull=await t.waitFor('the TOOLS prompt in view',x=>SHELL_DIR.test(x.text),{timeout:10_000});
    t.press('ctrl+o');
    await t.waitFor('back to the prompt',x=>!/^ Transcript · /mu.test(x.text),{timeout:10_000});
    await quiet();
    /* The typed-ahead `1` is still in the composer: clear it before the next prompt. */
    t.press('backspace');
    await t.waitFor('the composer is empty again',composerReady,{timeout:10_000});
  });

  test(name('R3: R3-GRACE a key typed the instant the approval appears goes to the composer and does not answer it'),()=>{
    const frame=frames.typedAhead!;
    assert.ok(approvalVisible(frame)&&frame.text.includes('cmd /c dir /b'),`R3-GRACE: the typed-ahead key answered the approval:\n${frame.text}`);
    assert.ok(frame.lines.some(line=>/^│ ›\s*1\s*│?$/u.test(line.trimEnd())),`R3-GRACE: the typed-ahead key is not in the composer:\n${frame.text}`);
  });

  test(name('EDIT: the edit asks, is allowed once, and the full transcript opens its diff'),async()=>{
    await t.submit('EDIT change the log line');
    frames.editApproval=await t.waitFor('the edit approval',asking('src/index.js'),{timeout:30_000});
    await answer('1');
    frames.edit=await t.waitFor('the edit turn ended',x=>idle('EDIT')(x)&&/Done: edited 1 file/u.test(x.text),{timeout:30_000});
    /* Each press waits for its redraw: a second chord written before TALOS has read the first reaches it in the same read
       as the next prompt (ConPTY merges them), which is the R3-KEYS defect, measured on its own below.
       Stage 7.12 «+1 completa» (owner 03/10): Ctrl+O opens the full transcript, every call open with its diff; Ctrl+O again
       comes back to the prompt. */
    t.press('ctrl+o');
    await t.waitFor('Ctrl+O opened the full transcript',x=>/^ Transcript · /mu.test(x.text),{timeout:10_000});
    await quiet();frames.editExpanded=t.screen();
    t.press('ctrl+o');
    await t.waitFor('Ctrl+O came back to the prompt',x=>!/^ Transcript · /mu.test(x.text),{timeout:10_000});
    await quiet();
  });

  test(name('FAIL: a command that exits 3 is allowed once and ends'),async()=>{
    await t.submit('FAIL run the failing command');
    await t.waitFor('the failing command approval',asking('cmd /c exit 3'),{timeout:30_000});
    await answer('1');
    frames.fail=await t.waitFor('the fail turn ended',x=>idle('FAIL')(x)&&/Done: the command failed/u.test(x.text),{timeout:30_000});
  });

  test(name('DENY: the write is denied and the turn goes on'),async()=>{
    await t.submit('TOOLS again, write the notes');
    await t.waitFor('the shell approval (deny round)',asking('cmd /c dir /b'),{timeout:30_000});
    await answer('1');
    await t.waitFor('the write approval (deny round)',asking('notes.txt'),{timeout:30_000});
    await answer('4');
    frames.deny=await t.waitFor('the deny turn ended',x=>idle('TOOLS again')(x),{timeout:30_000});
  });

  test(name('LONG: a running command is interrupted with Esc'),async()=>{
    await t.submit('LONG print lines slowly');
    await t.waitFor('the long command approval',asking('powershell'),{timeout:30_000});
    await answer('1');
    frames.running=await t.waitFor('the long command is running',x=>!approvalVisible(x)&&!idleFooter(x)&&x.text.includes('powershell'),{timeout:30_000});
    t.press('esc');
    frames.interrupted=await t.waitFor('the interrupted turn is idle',x=>idleFooter(x),{timeout:30_000});
  });

  test(name('KEYS: Ctrl+O read together with typed text, then Enter'),async()=>{
    /* One write, as ConPTY delivers a chord typed while TALOS is busy drawing: Ctrl+O, then the prompt. Stage 7.12: Ctrl+O
       opens the transcript, which takes the text glued after it as its keys; nothing reaches the model, and never U+000F. */
    const before=s.fake.chatRequests().length;
    t.send('\u000fKEYS glued to the transcript key');
    await t.waitFor('the transcript mode',x=>/^ Transcript · /mu.test(x.text),{timeout:10_000});
    await new Promise(resolve=>setTimeout(resolve,60));
    t.press('enter');t.press('esc');
    await t.waitFor('back at the prompt',x=>!/^ Transcript · /mu.test(x.text)&&idleFooter(x),{timeout:10_000});
    await new Promise(resolve=>setTimeout(resolve,500));
    const after=s.fake.chatRequests().slice(before);
    assert.ok(after.every(r=>!r.lastUser?.includes('\u000f')&&!r.lastUser?.includes('KEYS glued')),`R3-KEYS: ${JSON.stringify(after.map(r=>r.lastUser))}`);
  });

  test(name('every frame is English and no frame mixes a border with content'),()=>{
    for(const [key,frame] of Object.entries(frames)){
      /* The interrupted frame's words are R3's (Q-R3-8): R3-INT checks them. The expanded frame shows the kernel's own
         originals (tool id, level id) by owner decision Q-R2-2, so its English is not asserted here. */
      if(key!=='interrupted'&&key!=='editExpanded'&&key!=='toolsFull')assertEnglishOnly(frame.text,`D-05 ${key}`);
      assert.deepEqual(brokenBorders(frame),[],`${key}: rows mix a border with content`);
    }
  });

  /* ---- R3 declared reds: each fails with its own id until the lanes land (gate E14). ---- */
  test(name('R3: R3-STATUS the status says writing, waiting for you and running, never thinking there'),()=>{
    /* Stage 4: the words of the approved mockup's activity line. */
    assert.match(frames.streaming!.text,/^ \S Writing the answer · /mu,`R3-STATUS: no "Writing the answer" while the answer streams:\n${frames.streaming!.text}`);
    assert.match(frames.shellApproval!.text,/^ \? Waiting for your answer · /mu,'R3-STATUS: no "Waiting for your answer" while the approval is open');
    assert.match(frames.running!.text,/^ \S Running \S.* · esc to stop/mu,'R3-STATUS: the running command is not named on the activity line');
    for(const key of ['streaming','shellApproval','running'])assert.doesNotMatch(frames[key]!.text,/^ \S Thinking\b/mu,`R3-STATUS: "Thinking" in the ${key} frame`);
  });

  test(name('R3: R3-APPROVAL the dialog asks a question with the four choices and names the isolation'),()=>{
    const text=frames.shellApproval!.text;
    for(const choice of ['Allow once','Allow for this session','Always allow','Deny'])assert.ok(text.includes(choice),`R3-APPROVAL: the choice "${choice}" is missing`);
    assert.match(text,/\?/u,'R3-APPROVAL: the dialog asks no question');
  });

  test(name('R3: R3-DIFF the write and edit approvals show a diff and the edit row expands to it'),()=>{
    assert.match(frames.writeApproval!.text,/\+\s*hello from the fake model/u,'R3-DIFF: the write approval shows no added lines');
    assert.match(frames.editApproval!.text,/-\s*console\.log\(1\)/u,'R3-DIFF: the edit approval shows no removed line');
    assert.match(frames.editApproval!.text,/\+\s*console\.log\(2\)/u,'R3-DIFF: the edit approval shows no added line');
    assert.match(frames.editExpanded!.text,/\+\s*console\.log\(2\)/u,'R3-DIFF: the full transcript (Ctrl+O) does not open the edit diff');
  });

  test(name('R3: R3-ROW tool rows follow the owner grammar'),()=>{
    const tools=frames.toolsFull!;
    const shell=rowWith(tools,SHELL_DIR);
    assert.match(shell,ISOLATION,`R3-ROW: the shell row names no isolation: ${shell}`);
    assert.match(shell,/you allowed once/u,`R3-ROW: the shell row does not say why it ran: ${shell}`);
    const edit=rowWith(frames.editExpanded!,EDIT_INDEX);
    assert.match(edit,/\+1 −1/u,`R3-ROW: the edit row has no +1 −1 summary: ${edit}`);
    const fail=rowWith(frames.fail!,/Shell\s+cmd \/(?:c e|…)xit 3/u);
    assert.match(fail,/exit 3/u,`R3-ROW: the failing command row does not say exit 3: ${fail}`);
    if(wide){
      assert.match(rowWith(tools,READ),/1 line/u,'R3-ROW: the read row has no line count');
      assert.match(shell,/exit 0/u,`R3-ROW: the shell row does not say exit 0: ${shell}`);
      assert.match(shell,/\d+(?:\.\d+)? s\b/u,`R3-ROW: the shell row has no duration: ${shell}`);
      assert.match(rowWith(tools,WRITE_NOTES),/new file/u,'R3-ROW: the write row does not say new file');
    }
  });

  test(name('R3: R3-DENY a denied write says denied, not failed'),()=>{
    const row=rowWith(frames.deny!,WRITE_NOTES);
    assert.match(row,/denied/u,`R3-DENY: the denied write row does not say denied: ${row}`);
    assert.doesNotMatch(row,/failed/u,`R3-DENY: the denied write row says failed: ${row}`);
  });

  test(name('R3: R3-INT an interrupt reads Interrupted, never failed, and there are no Run rows'),()=>{
    const text=frames.interrupted!.text;
    assert.match(text,/Interrupted/u,`R3-INT: the interrupt is not announced:\n${text}`);
    assertEnglishOnly(text,'R3-INT');
    assert.doesNotMatch(text,/Run · failed/u,'R3-INT: the interrupt is recorded as a failed run');
    for(const [key,frame] of Object.entries(frames))assert.ok(!frame.lines.some(line=>/^\s*Run · /u.test(line)),`R3-INT: a "Run ·" row is still drawn in the ${key} frame`);
  });

  test(name('R3: R3-KEYS a key chord never reaches the model as text'),()=>{
    const sent=s.fake.chatRequests().map(r=>r.lastUser??'');
    /* stage 7.12: the transcript mode Ctrl+O opened took the glued text as its keys */
    assert.ok(sent.every(text=>!text.includes('KEYS glued')),'R3-KEYS: text typed into the transcript mode reached the model');
    for(const text of sent)assert.doesNotMatch(text,CONTROL,`R3-KEYS: a control character reached the model in ${JSON.stringify(text.slice(0,60))}`);
  });

  test(name('close'),async()=>{await exitTalos(t);});
}
