/*
 * Stage 7.21 (mockup permissions; owner 03/10: rules obeyed at once, saved where the person chooses, the project's trust in
 * one row and at /permissions trust): /permissions in the real app, on a temporary profile — Enter uses a mode; on Rules, n
 * asks where to save and the rule is in force at once (/permissions dry-run reads the session's rule set), space turns it,
 * e edits it, d twice deletes it, each written to the person's file for this project. Mount: the REAL TuiApp
 * (r5a-s-fixture.ts), no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {projectId} from '../../src/paths.ts';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',TAB='\t',ESC='\x1b';
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

test('stage 7.21: /permissions — a mode, then a rule added, turned, edited and deleted, obeyed at once',async()=>{
  const root=join(env.root,'perm-project');mkdirSync(root,{recursive:true});
  const mine=join(env.paths.projectOverridesRoot,projectId(root),'config.json');
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    /* before any rule, the same request is asked */
    await app.type('/permissions dry-run npm test');app.press(ENTER);
    await app.waitFor('asked before the rule',x=>/Permission dry-run: ask/u.test(x.text));
    await app.type('/permissions');app.press(ENTER);
    let s=await app.waitFor('the Mode tab',x=>/── Permissions what TALOS may do without asking/u.test(x.text)&&/› ● Ask before edits/u.test(x.text));
    assert.match(s.text,/This project: (not )?trusted · \/permissions trust/u,'the project\'s trust over the modes');
    app.press('\x1b[B');app.press(ENTER);
    s=await app.waitFor('Accept edits in use',x=>/Mode: Accept edits/u.test(flat(x.lines))&&!/── Permissions/u.test(x.text));
    await app.type('/permissions');app.press(ENTER);
    await app.waitFor('the sheet again, Accept edits current',x=>/● Accept edits/u.test(x.text));
    app.press(TAB);
    await app.waitFor('the Rules tab',x=>/No rules yet/u.test(x.text));
    await app.type('n');await app.type('Bash(npm test:*)');app.press(ENTER);
    await app.waitFor('where to save',x=>/── Save rule allow Bash\(npm test:\*\)/u.test(x.text)&&/● Only you, in this project/u.test(x.text));
    app.press(ENTER);
    s=await app.waitFor('added, under the cursor',x=>/› Bash\(npm test:\*\) +allow +you/u.test(x.text));
    assert.match(flat(s.lines),/Rule added: allow Bash\(npm test:\*\)/u);
    assert.deepEqual(JSON.parse(readFileSync(mine,'utf8')).permissions,{allow:['Bash(npm test:*)']},'the person\'s file for this project');
    /* in force at once: the session's rule set allows it */
    app.press(ESC);await app.waitFor('closed',x=>!/── Permissions/u.test(x.text));
    await app.type('/permissions dry-run npm test');app.press(ENTER);
    s=await app.waitFor('the dry run allows it',x=>/Permission dry-run: allow/u.test(x.text)&&/Rule: Bash\(npm test:\*\)/u.test(x.text));
    await app.type('/permissions');app.press(ENTER);await app.waitFor('the sheet',x=>/── Permissions/u.test(x.text));
    app.press(TAB);await app.waitFor('the rule',x=>/› Bash\(npm test:\*\) +allow/u.test(x.text));
    await app.type(' ');
    await app.waitFor('ask',x=>/› Bash\(npm test:\*\) +ask +you/u.test(x.text));
    assert.deepEqual(JSON.parse(readFileSync(mine,'utf8')).permissions,{allow:[],ask:['Bash(npm test:*)']});
    await app.type('e');for(let i=0;i<'*)'.length;i++)app.press('\x7f');await app.type('x)');app.press(ENTER);
    await app.waitFor('edited',x=>/› Bash\(npm test:x\) +ask/u.test(x.text));
    await app.type('d');await app.type('d');
    s=await app.waitFor('deleted',x=>/No rules yet/u.test(x.text));
    assert.match(flat(s.lines),/Rule deleted/u);
    assert.deepEqual(JSON.parse(readFileSync(mine,'utf8')).permissions,{allow:[],ask:[]});
    /* the trust centre is /permissions trust */
    app.press(ESC);await app.waitFor('closed',x=>!/── Permissions/u.test(x.text));
    await app.type('/permissions trust');app.press(ENTER);
    await app.waitFor('the trust centre',x=>/Security & trust/u.test(x.text));
    app.press(ESC);await app.waitFor('closed',x=>!/Security & trust/u.test(x.text));
    /* Full access from the sheet keeps its confirmation, as Shift+Tab does */
    await app.type('/permissions');app.press(ENTER);await app.waitFor('the sheet',x=>/── Permissions/u.test(x.text));
    for(let i=0;i<3;i++)app.press('\x1b[B');
    await app.waitFor('on Full access',x=>/› ○ Full access/u.test(x.text));
    app.press(ENTER);
    await app.waitFor('asked first',x=>/Enable Full access\?/u.test(x.text));
    await sleep(50);
  }finally{app.unmount();}
});
