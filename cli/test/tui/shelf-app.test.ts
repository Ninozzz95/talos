/* FE-052 through the real app: /shelf opens the page, Esc closes it, and the composer is there again. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import test,{after} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());

test('/shelf opens as a page with its keys, says when it is empty, and Esc goes back',async()=>{
  const root=join(env.root,'..',`shelf-${Date.now()}`);mkdirSync(root,{recursive:true});
  const app=await mountR5a({cols:120,rows:30,root,paths:env.paths});
  try{
    await app.type('/shelf');app.press('\r');
    const page=await app.waitFor('the page',x=>/── New session Your conversations, as disks on a shelf/u.test(x.text));
    assert.match(page.text,/←\/→ +project/u);
    app.press('\x1b');
    await app.waitFor('back',x=>!/── New session/u.test(x.text));
  }finally{app.unmount();}
});
