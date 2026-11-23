import assert from 'node:assert/strict';
import test from 'node:test';
import {routeInput} from '../../src/tui/input-router.ts';
import {hermeticProfile,KEY,mountApp} from './r1-layout-fixture.ts';

test('REV-COMMAND-CHUNK: a coalesced slash prefix routes to the menu without treating ordinary text as a command',()=>{
 for(const ch of ['/','/m','/mo','/model']){
  assert.deepEqual(routeInput({ch,key:{},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'action',action:'command-menu'},ch);
 }
 for(const ch of ['/mo','https://example.com','Caffè 中文']){
  assert.deepEqual(routeInput({ch,key:{},focus:'composer',composerText:'already typing ',commandMenuOpen:false}),{kind:'text',text:ch});
 }
 assert.deepEqual(routeInput({ch:'/mo',key:{},focus:'model-picker',composerText:'',commandMenuOpen:false}),{kind:'text',text:'/mo'});
 for(const ch of ['/mo\nplain text','/mo\targument'])assert.deepEqual(routeInput({ch,key:{},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'text',text:ch});
 for(const key of [{ctrl:true},{meta:true}])assert.deepEqual(routeInput({ch:'/mo',key,focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'ignore'});
});

test('REV-COMMAND-CHUNK: real Ink preserves the whole prefix and Enter selection; bracketed paste stays literal',async()=>{
 const profile=hermeticProfile();let app:Awaited<ReturnType<typeof mountApp>>|undefined;
 try{
  app=await mountApp({cols:100,rows:30,root:profile.root,paths:profile.paths});
  for(const chunks of [['/he'],['/h','e'],['/','he']]){
   for(const chunk of chunks){app.press(chunk);await app.settle();}
   const menu=await app.waitFor('coalesced /he highlights help',s=>s.text.includes('› /help ·'),1500);
   assert.match(menu.text,/│ › \/he\s*│/u,'the prefix is neither dropped nor duplicated');
   /* stage 7.17: /help is the mockup's sheet */
   app.press(KEY.enter);await app.waitFor('Enter opens help',s=>/── Help TALOS/u.test(s.text));
   app.press(KEY.esc);await app.waitFor('help closes',s=>!/── Help TALOS/u.test(s.text));
  }
  app.press('\x1b[200~/he\x1b[201~');
  const pasted=await app.waitFor('literal paste appears',s=>/│ › \/he\s*│/u.test(s.text));
  assert.doesNotMatch(pasted.text,/│Commands/u);
  app.press('\x03');await app.waitFor('clear literal paste',s=>/│ › (?:Ask TALOS, \/ for commands, @ for files)?\s*│/u.test(s.text));
  app.press('Caffè 中文 /he https://example.com');
  const text=await app.waitFor('ordinary Unicode text remains intact',s=>s.text.includes('Caffè 中文 /he https://example.com'));
  assert.doesNotMatch(text.text,/│Commands/u);assert.deepEqual(app.exits(),[]);
 }finally{app?.unmount();profile.restore();}
});
