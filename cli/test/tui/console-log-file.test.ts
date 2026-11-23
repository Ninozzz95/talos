/*
 * Owner decision 02/10 («Nel registro + avviso discreto»): the console output captured during the TUI must be readable with
 * `talos logs`, which the status segment names. `talos logs` reads the `*.log` files at the top of the logs folder
 * (commands/system-cli.ts readLogs), while the development log is off by default and lives in logs/development/*.jsonl —
 * so the capture writes its own `console.log` there: one line per message, secrets redacted like every TALOS log, bounded
 * in size (the older half moves to `console.1.log`, as rotation does elsewhere).
 */
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createConsoleLogFile} from '../../src/tui/console-log-file.ts';

function folder(t:any){const dir=mkdtempSync(join(tmpdir(),'talos-console-log-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}

test('one line per message, with time and level, in the file talos logs reads',t=>{
  const dir=folder(t);
  const write=createConsoleLogFile({dir,clock:()=>new Date('2026-10-02T12:00:00.000Z'),env:{}});
  write('warn','Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.');
  write('error','[session-store] risposta non salvata\n    at somewhere');
  const lines=readFileSync(join(dir,'console.log'),'utf8').split('\n').filter(Boolean);
  assert.deepEqual(lines,[
    '2026-10-02T12:00:00.000Z WARN  Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.',
    '2026-10-02T12:00:00.000Z ERROR [session-store] risposta non salvata ⏎     at somewhere',
  ],'a message stays on one line, so `talos logs --tail` counts it once');
});

test('secrets from the environment never reach the file',t=>{
  const dir=folder(t);
  const write=createConsoleLogFile({dir,env:{OPENROUTER_API_KEY:'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789'}});
  write('error','request failed with key sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789');
  assert.doesNotMatch(readFileSync(join(dir,'console.log'),'utf8'),/abcdefghijklmnopqrstuvwxyz0123456789/u);
});

test('bounded: past the limit the file moves to console.1.log and starts again',t=>{
  const dir=folder(t);
  const write=createConsoleLogFile({dir,maxBytes:300,env:{}});
  for(let i=0;i<20;i++)write('warn',`message number ${i} ${'x'.repeat(20)}`);
  assert.ok(existsSync(join(dir,'console.1.log')),'rotated');
  assert.ok(statSync(join(dir,'console.log')).size<=300+120,'the live file stays near the limit');
  assert.match(readFileSync(join(dir,'console.log'),'utf8'),/message number 19/u,'the newest is in the live file');
});

test('a folder that cannot be written never throws into the caller',()=>{
  const write=createConsoleLogFile({dir:join(tmpdir(),'talos-console-log-missing','\u0000bad'),env:{}});
  assert.doesNotThrow(()=>write('error','still fine'));
});
