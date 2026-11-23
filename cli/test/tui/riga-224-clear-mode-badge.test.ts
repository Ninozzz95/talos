/*
 * Row 224, T2 (from the reproduction reviewer of 23/11/2026, its P4). The REAL TuiApp (r5a-s-fixture.ts) at 80×24 and 120×40,
 * temp profile, no kernel, no network.
 *   From Full access /clear goes back to Default and the badge says so; from Accept edits it stays (a choice of the person, not a reset).
 *   Kills the mutants «/clear resets Accept edits too» and «after /clear from Full access the badge still says full access».
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
let n=0;const project=()=>{const root=join(env.root,`clear-mode-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');
const SIZES=[[80,24],[120,40]] as const;

for(const [cols,rows] of SIZES){
  const tag=`${cols}x${rows}`;
  for(const [start,label,badge] of [['bypassPermissions','full access','ask before edits'],['acceptEdits','accept edits','accept edits']] as const){
    test(`T2 ${tag}: /clear from ${label}: the badge says ${badge} and the new conversation starts in it`,async()=>{
      const modes:unknown[]=[];
      const app=await mountR5a({cols,rows,root:project(),paths:env.paths,props:{invocation:{model:'ollama:qwen3-coder-test',permissionMode:start,resume:'s1'}},
        runtimeExtra:{start:async(x:any)=>{modes.push(x?.permissionMode);return 's9';}}});
      try{
        await app.waitFor('the badge before',x=>x.text.includes(label));
        await app.type('/clear');app.press('\r');await app.waitFor('the sheet',x=>/Start a new conversation/u.test(x.text));await sleep(200);
        app.press('\x1b[B');app.press('\r');
        await app.waitFor('the new conversation',x=>/New conversation/u.test(flat(x.lines)));await sleep(300);
        const s=await app.screen();
        assert.ok(s.lines.some(l=>new RegExp(`^ ${badge} ·`,'u').test(l)),`the badge does not say «${badge}»:\n${s.text}`);
        await app.type('hello again');app.press('\r');for(let i=0;i<80&&!modes.length;i++)await sleep(25);
        assert.equal(modes[0],start==='bypassPermissions'?'default':start,'the mode of the new conversation');
      }finally{app.unmount();await sleep(50);}
    });
  }
}
