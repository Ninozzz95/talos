import assert from 'node:assert/strict';
import test from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {loadEffectiveConfig,readConfigScope,writeConfigScope} from '../../src/config/load.ts';

test('P5-APP /config saves width, owns typing and Escape restores the composer',async()=>{
  const env=hermeticProfile();const app=await mountR5a({cols:100,rows:30,root:env.root,paths:env.paths});
  try{
    /* stage 7.11 (mockup Settings): /config is the Settings sheet's Config tab; Response width is the seventh field since View and Language left the form (C10, 01/11) */
    await app.type('/config');app.press('\r');
    await app.waitFor('the config tab',s=>/── Settings this project/u.test(s.text)&&/Response width {9}Full width/u.test(s.text),3000);
    await app.type('accidental');
    for(let i=0;i<6;i++){app.press('\u001b[B');await sleep(30);}
    app.press('\u001b[C');await sleep(40);app.press('\r');
    await app.waitFor('saved width',s=>/Saved for this project/u.test(s.text));
    const value=(await loadEffectiveConfig({paths:env.paths,projectRoot:env.root})).value;
    assert.equal(value.ui?.maxProseWidth,60);
    assert.equal((await readConfigScope({paths:env.paths,projectRoot:env.root,scope:'user'})).ui?.maxProseWidth,undefined);
    app.press('\u001b');await sleep(80);
    const screen=await app.waitFor('panel closed',s=>!s.text.includes('Response width'));
    assert.doesNotMatch(screen.text,/accidental/u);
    await app.type('/config');app.press('\r');
    await app.waitFor('reopened persisted width',s=>/Response width/u.test(s.text));
    for(let i=0;i<6;i++){app.press('\u001b[B');await sleep(30);}
    app.press('\r');await app.waitFor('nothing changed: 60 was read back',s=>/Nothing changed/u.test(s.text));
    app.press('\u0003');await app.waitFor('Ctrl+C closes config',s=>!s.text.includes('Response width'));
  }finally{app.unmount();env.restore();}
});

test('P5-APP-LAYOUT live cap wraps only prose, remeasures old rows and preserves the exit transcript',async()=>{
  const env=hermeticProfile();let exit:any=null;
  const source=['# '+ 'H'.repeat(105),'P'.repeat(105),'> '+ 'Q'.repeat(105),'- '+ 'L'.repeat(105),'```js\n'+ 'K'.repeat(95)+'\n```','| '+ 'A'.repeat(35)+' | '+ 'B'.repeat(35)+' |\n| --- | --- |\n| one | two |'].join('\n\n');
  await writeConfigScope({paths:env.paths,projectRoot:env.root,scope:'project-user',patch:{ui:{maxProseWidth:60}}});
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,props:{maxProseWidth:60,onExit:(value:any)=>{exit=value;}}});
  try{
    app.emit('message.started',{messageId:'p5',role:'assistant'});app.emit('message.delta',{messageId:'p5',delta:source});app.emit('message.completed',{messageId:'p5'});
    const first=await app.waitFor('all blocks rendered',s=>s.text.includes('K'.repeat(95))&&s.text.includes('two'));
    for(const char of ['H','P','Q','L'])assert.ok(!first.text.includes(char.repeat(61)),char+' is constrained');
    assert.ok(first.lines.some(line=>line.trimStart().startsWith('┌')&&line.length>60&&line.includes('┬')),'table keeps full width');
    await app.type('/config');app.press('\r');await app.waitFor('width menu',s=>/Response width/u.test(s.text));
    for(let i=0;i<6;i++){app.press('\u001b[B');await sleep(30);}
    app.press('\u001b[C');await sleep(40);app.press('\r');await app.waitFor('width saved 80',s=>/Saved for this project/u.test(s.text));
    app.press('\u001b');const wider=await app.waitFor('old message rewrapped live',s=>s.text.includes('P'.repeat(80)));
    assert.ok(!wider.text.includes('P'.repeat(81)));assert.ok(wider.text.includes('K'.repeat(95)));
  }finally{app.unmount();env.restore();}
  assert.equal(exit?.items.find((item:any)=>item.kind==='message'&&item.role==='assistant')?.text,source,'saved source has no layout line breaks');
});
