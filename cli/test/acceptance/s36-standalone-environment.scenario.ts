import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {CLI_ROOT} from './profile.ts';

test('REV-RELEASE-PTY-ENV: installed package paints and completes a turn under a non-interactive parent', {timeout:280_000}, async()=>{
  const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/prove-standalone.ts','--keep'],{
      cwd:CLI_ROOT,env:{...process.env,CI:'true',CONTINUOUS_INTEGRATION:'true',TERM:'dumb'},
      windowsHide:true,stdio:['ignore','pipe','pipe'],
    });
    let stdout='';let stderr='';
    child.stdout.setEncoding('utf8').on('data',chunk=>{stdout+=chunk;});
    child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
    const timer=setTimeout(()=>{child.kill();reject(new Error('standalone proof exceeded 260 seconds'));},260_000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
  const report=JSON.parse(result.stdout);
  assert.equal(report.checks['TUI turn and /status (tasks and notes read back)']?.ok,true,JSON.stringify(report));
  assert.equal(report.checks['no outbound request']?.ok,true);
  assert.equal(report.checks['modules only from the install']?.ok,true);
  assert.equal(report.checks['nothing written in the package']?.ok,true);
  assert.equal(report.checks.version?.detail,JSON.parse(readFileSync(join(CLI_ROOT,'package.json'),'utf8')).version);
  assert.equal(report.ok,true,JSON.stringify(report));
  assert.equal(existsSync(report.tarball.file),true,'--keep retains the verified artifact inside the private runner folder');
  assert.equal(result.code,0,result.stderr);
});
