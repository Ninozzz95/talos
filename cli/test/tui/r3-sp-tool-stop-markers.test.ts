/*
 * R3 lane SP — R3-INT (coordinator, measured): after Esc on a running shell command the compact transcript showed the
 * kernel's Italian marker `⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.` as the tool output.
 * Owner decision Q-R3-8: a person's interrupt is neutral English and the cut tool is marked interrupted (never failed).
 * The kernel appends its stop and timeout sentences to the tool RESULT (talosHarness.mjs:4040, 4806-4808, 4947) and
 * cancels announced calls with a whole sentence (:684); the model reads them unchanged (R2 E2). The TUI adapter replaces
 * only these exact sentences, as whole lines, in the DISPLAY copy of the result and marks a person's stop `cancelled`.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {KERNEL_TOOL_STOP,KERNEL_TOOL_STOP_EN} from '../../src/i18n/error-view.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';
import {EXECUTION_TEXT} from '../../src/runtime/brokered-executor.ts';
import {t} from '../../src/i18n/index.ts';

const KERNEL_FILE=fileURLToPath(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url));
const RUNNING='⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.';

function completed(content:string,extra:Record<string,unknown>={}){
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const event=adapter.translate({type:'ToolCallResult',toolCallId:'t1',content,receipt:{status:'failed',consentito:true,evidence:{exitCode:130}},...extra});
  assert.equal(event?.type,'tool.completed');
  return event as Extract<NonNullable<typeof event>,{type:'tool.completed'}>;
}

test('R3-SP R3-INT: a command stopped while running shows English words and is marked cancelled, not failed',()=>{
  const event=completed(`building…\nstep 2\n\n${RUNNING}`);
  assert.equal(event.content.includes('Fermato'),false,`R3-INT: the kernel's Italian stop marker reached the screen: ${event.content}`);
  assert.equal(looksItalian(event.content),false,event.content);
  assert.ok(event.content.startsWith('building…\nstep 2'),'the command output itself is kept');
  assert.ok(event.content.endsWith(t('error.toolStop.whileRunning')),event.content);
  assert.equal(event.outcome?.status,'cancelled','Q-R3-8: the cut tool is interrupted, never failed');
  assert.equal(event.result?.content,event.content,'the expanded view reads the same display copy');
});

test('R3-SP R3-INT: the WSL form (marker first) and the test form are replaced too',()=>{
  const wsl=completed(`${RUNNING}\n\nwsl output`);
  assert.equal(wsl.content,`${t('error.toolStop.whileRunning')}\n\nwsl output`);
  assert.equal(wsl.outcome?.status,'cancelled');
  const prova=completed('out\n\n⛔ Fermato su richiesta: la prova e stata interrotta mentre girava.');
  assert.equal(prova.content,`out\n\n${t('error.toolStop.whileRunning')}`);
  assert.equal(prova.outcome?.status,'cancelled');
});

test('R3-SP R3-INT: a call cancelled before it ran is English',()=>{
  const event=completed('⛔ Fermato su richiesta: non riesco a eseguirlo, la sessione e stata interrotta prima. Questo attrezzo non e stato eseguito.',{outcome:'cancelled',receipt:undefined});
  assert.equal(event.content,t('error.toolStop.notRun'));
  assert.equal(event.outcome?.status,'cancelled');
});

test('R3-SP R3-INT: a timeout is English and stays what it was (not an interrupt)',()=>{
  const event=completed('partial\n\n⛔ Fermato allo scadere dei 120 secondi: non ha finito da solo.',{receipt:{status:'failed',consentito:true,evidence:{exitCode:124}}});
  assert.equal(event.content,`partial\n\n${t('error.toolStop.timedOut',{seconds:120})}`);
  assert.equal(event.outcome?.status,'failed');
});

test('R3-SP R3-INT: only the exact kernel sentence as a whole line is replaced; the model\'s own words are never touched',()=>{
  const quoted=`echo "${RUNNING} (quoted)"`;
  const event=completed(quoted,{receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0}}});
  assert.equal(event.content,quoted);
  assert.equal(event.outcome?.status,'completed');
});

/* K3 (desktop 03/10, «chi legge riconosce per sempre tutte e due le forme»): the kernel's English sentences read the same way
   as the Italian ones, which the sessions already saved keep */
test('K3: the kernel\'s English stop sentences are read as the Italian ones are',()=>{
  const running=completed('building…\n\n⛔ Stopped on request: the command was stopped while it ran.');
  assert.equal(running.content,`building…\n\n${t('error.toolStop.whileRunning')}`);assert.equal(running.outcome?.status,'cancelled');
  const prova=completed('out\n\n⛔ Stopped on request: the test was stopped while it ran.');
  assert.equal(prova.content,`out\n\n${t('error.toolStop.whileRunning')}`);assert.equal(prova.outcome?.status,'cancelled');
  const notRun=completed('⛔ Stopped on request: it could not run, the session was stopped first. This tool did not run.',{outcome:'cancelled',receipt:undefined});
  assert.equal(notRun.content,t('error.toolStop.notRun'));
  const timeout=completed('partial\n\n⛔ Stopped when the 120 seconds ran out: it did not finish on its own.',{receipt:{status:'failed',consentito:true,evidence:{exitCode:124}}});
  assert.equal(timeout.content,`partial\n\n${t('error.toolStop.timedOut',{seconds:120})}`);assert.equal(timeout.outcome?.status,'failed');
  const quoted=completed('echo "⛔ Stopped on request: the command was stopped while it ran. (quoted)"',{receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0}}});
  assert.equal(quoted.outcome?.status,'completed','only the whole line');
});

test('R3-SP R3-INT: the replaced sentences are the kernel\'s own literals (drift is caught here)',async()=>{
  const source=await readFile(KERNEL_FILE,'utf8');
  /* K4: the kernel writes the English forms (KERNEL_TOOL_STOP_EN) and still reads the Italian ones of saved histories */
  assert.equal(KERNEL_TOOL_STOP_EN.commandWhileRunning,`${EXECUTION_TEXT.marker.stoppedOnRequest} ${EXECUTION_TEXT.marker.stoppedOnRequestSentence}`);
  assert.ok(source.includes("const MARCA_FERMATO_MENTRE_GIRAVA = '⛔ Stopped on request:'"),'kernel stop mark changed');
  assert.ok(source.includes("return `${MARCA_FERMATO_MENTRE_GIRAVA} ${prova ? 'the test was stopped' : 'the command was stopped'} while it ran.`"),'kernel command and test stop sentences changed');
  assert.ok(source.includes(`'${KERNEL_TOOL_STOP_EN.notRun}'`),'kernel not-run sentence changed');
  assert.ok(source.includes(EXECUTION_TEXT.marker.timedOut(120_000)),'kernel timeout sentence changed');
  assert.ok(KERNEL_TOOL_STOP_EN.timedOut.test(EXECUTION_TEXT.marker.timedOut(45_000)));
  assert.ok(source.includes(`const MARCA_FERMATO_MENTRE_GIRAVA_IT = '${KERNEL_TOOL_STOP.commandWhileRunning.split(' il comando')[0]}'`),'the kernel still reads the Italian mark of saved histories');
});
