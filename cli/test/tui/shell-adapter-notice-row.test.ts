/*
 * 0.6.13, release review S2-2 (22/10/2026): with the desktop adapter in front of the kernel, every executed shell result starts
 * with the adapter's own header line, `[shell output: stdout and stderr combined in arrival order; …]`, and a PowerShell command
 * that exited 0 with an error diagnostic gets a second one, `⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: …`
 * (harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs `correggiEsitoToolDesktop`, the `tool-esito` the CLI renders). The
 * kernel's `exit N [sandbox: …]` line was then the SECOND line, so it showed too, and a failed row showed the headers instead of
 * the error. The rows are fed here with the REAL output of the adapter, so a change of its wording turns this file red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {transcriptItemText,type TranscriptItem} from '../../src/tui/transcript-model.ts';
import {withoutKernelExitLine} from '../../src/tui/tools/shared.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';

const {correggiEsitoToolDesktop}=await import('../../../harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs') as {correggiEsitoToolDesktop:(input:{name:string;args:unknown;content:string;cartella:string})=>string};
const NOW=1_000_000;
const SANDBOX0='exit 0 [sandbox: ⛉ sandbox (microsoft-mxc-0.8.0) — isolation verified: AppContainer on]';
const SANDBOX1='exit 1 [sandbox: ⛉ sandbox (microsoft-mxc-0.8.0) — isolation verified: AppContainer on]';
const NOTICE=/stdout and stderr combined|stream identity/u;
const adapted=(comando:string,content:string)=>correggiEsitoToolDesktop({name:'shell',args:{comando},content,cartella:process.cwd()});
const row=(comando:string,finalOutput:string,over:Partial<ToolRowModel>={}):ToolRowModel=>({id:'t1',name:'shell',status:'completed',argsText:JSON.stringify({comando}),liveOutput:'',finalOutput,startedAt:NOW-10_000,endedAt:NOW-9_900,outcome:null,...over});
const detail=(r:ToolRowModel)=>toolRowView(r,120,false,NOW).detailLines;
const copied=(r:ToolRowModel)=>transcriptItemText({kind:'tool',...r} as TranscriptItem);

test('S2-2: the adapter does put its header in front of an executed shell result (the premise of this file)',()=>{
  const content=adapted('git status --short',`${SANDBOX0}\nM  src/app.ts`);
  assert.match(content.split('\n')[0]!,NOTICE,'the adapter still adds its notice: if not, this file pins nothing');
  assert.equal(content.split('\n')[1],SANDBOX0);
});

test('S2-2: a success with 2 and with 3 output lines shows the output, not the adapter\'s header nor the exit line',()=>{
  for(const lines of [['M  src/app.ts','?? notes.txt'],['M  src/app.ts','?? notes.txt','A  src/new.ts']]){
    const r=row('git status --short',adapted('git status --short',`${SANDBOX0}\n${lines.join('\n')}`),{facts:{exitCode:0,durationMs:100,isolation:'sandbox'}} as Partial<ToolRowModel>);
    assert.deepEqual(detail(r),lines,`${lines.length} lines`);
    assert.doesNotMatch(copied(r),NOTICE,'copy and search do not carry the header either');
    assert.doesNotMatch(copied(r),/\[sandbox:/u);
    assert.match(copied(r),/\?\? notes\.txt/u);
  }
});

test('S2-2: a failed command shows its error, not the headers',()=>{
  const content=adapted('npm run tset',`${SANDBOX1}\nnpm ERR! Missing script: "tset"\nnpm ERR! A complete log of this run can be found in: x.log`);
  const r=row('npm run tset',content,{status:'failed',facts:{exitCode:1,durationMs:100,isolation:'sandbox'}} as Partial<ToolRowModel>);
  assert.deepEqual(detail(r),['npm ERR! Missing script: "tset"','npm ERR! A complete log of this run can be found in: x.log']);
  /* row-format.ts: a failed row of a kind that does not show its output keeps the FIRST two lines of what withoutKernelExitLine leaves */
  assert.deepEqual(withoutKernelExitLine(content).split('\n').slice(0,2),['npm ERR! Missing script: "tset"','npm ERR! A complete log of this run can be found in: x.log']);
});

test('S2-2: the PowerShell zero-exit warning is the adapter\'s too; the diagnostic itself stays on screen',()=>{
  const body='Get-Item : Cannot find path \'C:\\nope\' because it does not exist.\nAt line:1 char:1\n+ Get-Item C:\\nope';
  const content=adapted('Get-Item C:\\nope',`${SANDBOX0}\n${body}`);
  assert.match(content.split('\n')[0]!,/SHELL_DIAGNOSTIC_WITH_ZERO_EXIT/u,'the premise: the adapter adds its warning first');
  assert.equal(withoutKernelExitLine(content),body);
  assert.doesNotMatch(copied(row('Get-Item C:\\nope',content)),/SHELL_DIAGNOSTIC_WITH_ZERO_EXIT|stream identity|\[sandbox:/u);
});

test('S2-2 verso contrario: only the adapter\'s exact header in front of the kernel\'s exit line is hidden; output is data',()=>{
  const notice=adapted('x',`${SANDBOX0}\nx`).split('\n')[0]!;
  assert.equal(withoutKernelExitLine(`${notice}\nhello`),`${notice}\nhello`,'without the exit line after it, it is the command\'s own output');
  assert.equal(withoutKernelExitLine(`${SANDBOX0}\n${notice}\nhello`),`${notice}\nhello`,'printed BY the command (after the exit line) it stays');
  assert.equal(withoutKernelExitLine(`[shell output: something else]\n${SANDBOX0}\nhello`),`[shell output: something else]\n${SANDBOX0}\nhello`,'a near miss is not the header');
  assert.equal(withoutKernelExitLine(`${SANDBOX0}\nhello`),'hello','the bare kernel (0.6.12) is unchanged');
});
