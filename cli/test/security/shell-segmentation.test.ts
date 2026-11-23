import assert from 'node:assert/strict';
import test from 'node:test';
import {segmentShellCommand} from '../../src/security/shell-segmentation.ts';

test('shell segmentation preserves quoted operators and records every boundary',()=>{
  assert.deepEqual(segmentShellCommand('echo "a && b" && git status | rg src'),[
    {command:'echo "a && b"',operatorBefore:null},
    {command:'git status',operatorBefore:'&&'},
    {command:'rg src',operatorBefore:'|'}
  ]);
  assert.deepEqual(segmentShellCommand('git status\nrg src'),[
    {command:'git status',operatorBefore:null},
    {command:'rg src',operatorBefore:'newline'}
  ]);
});

/* CLI 0.6.10, from the 0.6.9 stress test: the tester's progress command ended with a line break and was refused in Full access. */
test('a line with nothing on it is not a command: trailing, leading and blank line breaks split nothing',()=>{
  const progress='node harness/progress.mjs 17:59 S0/S1 R91 PASS "" "Focused .env read matrix only: 6 modes; all 25 exchanges verified. Next R93."\n';
  assert.deepEqual(segmentShellCommand(progress),[{command:progress.trim(),operatorBefore:null}]);
  assert.deepEqual(segmentShellCommand('git status\r\n'),[{command:'git status',operatorBefore:null}]);
  assert.deepEqual(segmentShellCommand('\ngit status\n\n\nrg src\n'),[
    {command:'git status',operatorBefore:null},
    {command:'rg src',operatorBefore:'newline'}
  ]);
  assert.deepEqual(segmentShellCommand('npm ci &&\n  npm test'),[
    {command:'npm ci',operatorBefore:null},
    {command:'npm test',operatorBefore:'&&'}
  ]);
  assert.deepEqual(segmentShellCommand('git status;'),[{command:'git status',operatorBefore:null}]);
  assert.deepEqual(segmentShellCommand('git status;\n'),[{command:'git status',operatorBefore:null}]);
});

test('unsupported or malformed shell composition fails closed',()=>{
  for(const command of ['cat secret > out','(git status)','echo $(whoami)','echo `whoami`','git status &&','&& git status','echo "open',
    'git status &&\n','git status |\n\n','; git status','git status ;; rg src','\n\n','echo "x\n$(whoami)"\n',
    /* 0.6.10 bugfixer: only spaces and tabs make a line empty; a line of other blanks is a word to the shell, so it is not dropped */
    ' \nrm -rf x','rm -rf x\n　','git status\n﻿','git status\n\v']){
    assert.throws(()=>segmentShellCommand(command),(error:any)=>String(error?.code).startsWith('SHELL_COMPOSITION_'));
  }
});
