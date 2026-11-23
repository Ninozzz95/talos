/*
 * Rule 17 measure (03/11/2026, built CLI): after a delegation, `/resume` then Enter resumed the delegated agent's own conversation
 * («SLOW child work», the newest row), not the chat the person had. The Board of this CLI already leaves agents out
 * (app.ts `boardRowsOf`: `!row.parentId`); an agent is reached from its chat (/agents). Hermes leaves them out of its session list
 * by default (hermes_state_sessions.py `exclude_children`, quoted in the kernel's `elenca`). The picker now lists conversations
 * only, for /resume and for /fork, with or without the metadata store.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionPickerModel} from '../../src/tui/overlays/session-picker.ts';

const ROWS=[
  {id:'chat',sessionId:'chat',title:'DELEGATE look at the repo',parentId:null,updatedAt:'2026-11-03T20:50:00Z'},
  {id:'agent',sessionId:'agent',title:'SLOW child work',parentId:'chat',updatedAt:'2026-11-03T20:51:00Z'},
];

for(const action of ['resume','fork'] as const){
  test(`/${action} lists the chat, never its delegated agent, and Enter takes the chat`,async()=>{
    const taken:string[]=[];
    const controller:any={listSessions:async()=>ROWS,resumeSession:async(id:string)=>{taken.push(id);return id;},forkSession:async(id:string)=>{taken.push(id);return id;}};
    const model=createSessionPickerModel(controller,action);
    await model.open();
    assert.deepEqual(model.rows().map(row=>row.id),['chat']);
    await model.confirm();
    assert.deepEqual(taken,['chat']);
  });
}

test('the same with the metadata store (the screen\'s picker)',async()=>{
  const root=mkdtempSync(join(tmpdir(),'talos-resume-agents-'));
  try{
    const controller:any={listSessions:async()=>ROWS,resumeSession:async(id:string)=>id,forkSession:async(id:string)=>id};
    const model=createSessionPickerModel(controller,'resume',{metadataRoot:root});
    await model.open();
    assert.deepEqual(model.rows().map(row=>row.id),['chat']);
  }finally{rmSync(root,{recursive:true,force:true});}
});
