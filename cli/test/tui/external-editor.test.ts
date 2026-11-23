import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {editExternally,parseEditorCommand} from '../../src/tui/external-editor.ts';

test('external editor uses exec-file style spawn with shell disabled',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-editor-'));const calls:any[]=[];
  const text=await editExternally({text:'hello',editor:'code --wait',tmpRoot:root,spawn:((cmd:any,args:any,opts:any)=>{calls.push({cmd,args,opts});return{status:0} as any;}) as any});
  assert.equal(calls[0].opts.shell,false);assert.equal(calls[0].cmd,'code');assert.equal(text,'hello');
});

test('editor command parser handles quoted executable args and rejects unterminated quotes',()=>{
  assert.deepEqual(parseEditorCommand('code --wait "two words"'),['code','--wait','two words']);
  assert.throws(()=>parseEditorCommand('code "oops'),(e:any)=>e.code==='EXTERNAL_EDITOR_PARSE_FAILED');
});
