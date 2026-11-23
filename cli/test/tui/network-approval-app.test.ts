/*
 * Network-path series through the REAL TuiApp (r3-sp-fixture.ts), owner decisions 02/10 («Solo tu, sempre»; dialog preview
 * approved): the kernel's network question opens the dialog, offers «Allow once» / «Deny», and the keys follow the choices on
 * screen — 2 is Deny here, 1 allows. Decision 157 (owner 04/11/2026): Full access opens a network path without the dialog, as
 * Claude Code's bypassPermissions (full-access-155-04-11.test.ts), so the dialog is shown in the default mode.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR3App} from './r3-sp-fixture.ts';

const env=hermeticProfile();
after(()=>env.restore());
const UNC='\\\\files.example\\share\\notes.txt';
const question=(requestId:string)=>({requestId,azione:{tipo:'leggi',toolCallId:`t-${requestId}`,percorso:UNC,percorsoDiRete:{ospite:'files.example',frase:'…',via:'stringa'}}});

test('a network path asks outside Full access; 2 denies, 1 allows once',async()=>{
  let now=50_000;
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths,clock:()=>now,permissionMode:'default'});
  try{
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',question('n1'));
    const shown=await app.waitFor('the network dialog',s=>s.text.includes('on a network computer'));
    assert.match(shown.text,/\[1\] Allow once/u);assert.doesNotMatch(shown.text,/Always allow/u);
    now+=1_000;app.press('2');
    await app.waitFor('the dialog closed',s=>!s.text.includes('on a network computer'));
    assert.deepEqual(app.answers.at(-1),{requestId:'n1',approved:false},'2 is Deny in this dialog');
    app.emit('approval.required',question('n2'));
    await app.waitFor('the second network dialog',s=>s.text.includes('on a network computer'));
    now+=1_000;app.press('1');
    await app.waitFor('the dialog closed',s=>!s.text.includes('on a network computer'));
    assert.deepEqual(app.answers.at(-1),{requestId:'n2',approved:true});
  }finally{app.unmount();}
});
