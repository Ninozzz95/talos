/*
 * R5b D4 (owner decision Q-R5-14, gate E10): the theme is live. `/theme` opens the ten product themes plus mono; the arrows
 * PREVIEW each one on the whole screen (the painted background too), Enter keeps it and saves `ui.theme` in the user
 * configuration, Esc puts back the theme in use. `/theme <name>` sets one at once; an unknown name is refused with the
 * list. Before R5b the theme was read once at startup and changing it meant editing the config and restarting.
 * Hermetic (r1-layout-fixture.ts hermeticProfile): nothing touches the real profile.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {THEME_CHOICES,createThemeStore,parseThemeChoice} from '../../src/tui/theme-store.ts';
import {themePickerOverlay} from '../../src/tui/overlays/theme-picker.ts';
import {runInkTui} from '../../src/tui/run.ts';

/* Ink's chalk decides its colour level when it is imported: force truecolour so the cells carry the theme's RGB. */
process.env.FORCE_COLOR='3';
const env=hermeticProfile();after(()=>env.restore());
const DOWN='\x1b[B',UP='\x1b[A',ENTER='\r',ESC='\x1b';
const YOU=/^ › hello there/u;/* the person's prompt row (the approved mockup: ` › ` in the accent) */
const colour={interactive:true,color:true,motion:true,unicode:true};

test('R5b D4: the store holds the theme in use and tells its readers when it changes; mono has no colour and no motion',()=>{
  assert.deepEqual([...THEME_CHOICES],['calm','forge','terminal','aurora','ember','atlas','noir','signal','violet','telemetry','mono']);
  assert.equal(parseThemeChoice(' Ember '),'ember');assert.equal(parseThemeChoice('coral'),null,'a v1 id is not a theme any more');
  const store=createThemeStore(colour,'calm');let told=0;const stop=store.subscribe(()=>told++);
  assert.equal(store.getSnapshot().theme.colors.background,'#1e1f22');
  store.set('ember');
  assert.equal(told,1);assert.equal(store.getSnapshot().theme.colors.accent,'#ff5c62');assert.equal(store.getSnapshot().theme.colors.background,'#10090a');
  store.set('ember');assert.equal(told,1,'the same theme again is not a change');
  store.set('mono');
  assert.deepEqual(store.getSnapshot().theme.colors,{});assert.equal(store.getSnapshot().capabilities.motion,false);
  store.set('aurora');assert.equal(store.getSnapshot().capabilities.color,true,'leaving mono gives the colours back');
  stop();store.set('noir');assert.equal(told,3,'an unsubscribed reader is not told');
  const noColour=createThemeStore({...colour,color:false},'ember');
  assert.deepEqual(noColour.getSnapshot().theme.colors,{},'a terminal without colour stays without colour');
});

test('R5b D4: the picker lists the ten themes and mono, marks the one in use, and draws each swatch in its own accent',()=>{
  const content=themePickerOverlay({selected:1,current:'calm',colors:true});
  const rows=content.sections[0]!.lines;
  assert.equal(rows.length,11);
  assert.match(rows[0]!.text,/■ Calm · in use/u);assert.equal(rows[0]!.accentColor,'#c08b3c');assert.equal(rows[0]!.accentTo,1);
  assert.match(rows[1]!.text,/■ Forge$/u);assert.equal(rows[1]!.tone,'selected');
  assert.match(rows[10]!.text,/Mono · no colour/u);assert.equal(rows[10]!.accentTo,undefined,'mono has no swatch');
  assert.match(content.foot![0]!.text,/↑ ↓ preview · Enter keep · Esc back to Calm/u);
  const plain=themePickerOverlay({selected:0,current:'mono',colors:false});
  assert.ok(plain.sections[0]!.lines.every((line:any)=>line.accentTo===undefined),'no colour, no swatches');
});

test('R5b D4 /theme in the real app: the arrows preview, Esc puts the old theme back, Enter keeps and saves it',async()=>{
  const store=createThemeStore({interactive:true,color:false,motion:false,unicode:true},'calm');
  const app=await mountR5a({cols:100,rows:36,root:env.root,paths:env.paths,themeStore:store});
  try{
    await app.type('/theme');app.press(ENTER);
    /* stage 7.18: the mockup's page — the themes in its order (Forge, Calm, Terminal…), Mono named under the list */
    let s=await app.waitFor('the theme page',x=>/› ██ Calm +in use/u.test(x.text));
    assert.match(s.text,/^ Theme · ↑\/↓ preview live · enter keep · esc put back/mu);
    assert.match(s.text,/██ Telemetry/u);assert.match(s.text,/Mono \(no colour\) stays available/u);
    app.press(DOWN);await app.waitFor('terminal previewed',()=>store.getSnapshot().id==='terminal');
    app.press(DOWN);await app.waitFor('aurora previewed',()=>store.getSnapshot().id==='aurora');
    app.press(UP);await app.waitFor('terminal again',()=>store.getSnapshot().id==='terminal');
    app.press(ESC);
    s=await app.waitFor('Esc closed the page',x=>!/preview live/u.test(x.text));
    assert.equal(store.getSnapshot().id,'calm','Esc puts the theme in use back');
    await app.type('/theme');app.press(ENTER);
    await app.waitFor('the page again',x=>/› ██ Calm +in use/u.test(x.text));
    app.press(UP);await sleep(60);app.press(ENTER);
    s=await app.waitFor('kept',x=>/Theme: Forge/u.test(x.text));
    assert.equal(store.getSnapshot().id,'forge');
    const saved=JSON.parse(await readFile(join(env.paths.configRoot,'config.json'),'utf8'));
    assert.equal(saved.ui.theme,'forge','Enter saves the choice in the user configuration');
  }finally{app.unmount();}
});

test('R5b D4 /theme <name>: a theme is set at once and saved; an unknown one is refused with the list',async()=>{
  const store=createThemeStore({interactive:true,color:false,motion:false,unicode:true},'calm');
  const app=await mountR5a({cols:100,rows:36,root:env.root,paths:env.paths,themeStore:store});
  try{
    await app.type('/theme noir');app.press(ENTER);
    await app.waitFor('noir set',x=>/Theme: Noir/u.test(x.text));
    assert.equal(store.getSnapshot().id,'noir');
    assert.equal(JSON.parse(await readFile(join(env.paths.configRoot,'config.json'),'utf8')).ui.theme,'noir');
    await app.type('/theme coral');app.press(ENTER);
    const s=await app.waitFor('the refusal',x=>/"coral" is not a theme/u.test(x.text));
    assert.match(s.text.replace(/\s+/gu,' '),/calm, forge, terminal, aurora, ember, atlas, noir, signal, violet, telemetry, mono/u);
    assert.equal(store.getSnapshot().id,'noir');
  }finally{app.unmount();}
});

test('R5b D4: the painted background follows the live theme (run.ts reads the same store)',async()=>{
  let given:any=null;let frame:any=null;
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get()};
  const Ink={Box:'Box',render(element:any){frame=element;return{waitUntilExit:async()=>{}};}};
  const stdout={isTTY:true,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:(...args:any[])=>{given=args;return function TuiApp(){return null;};}}),stdin:{isTTY:true},stdout,env:{} as Record<string,string|undefined>};
  await runInkTui({invocation:{color:true},uiTheme:'calm'} as any,io as any);
  const store=given[4];assert.ok(store&&typeof store.set==='function','run.ts hands the app the store');
  assert.equal(frame.type().props.backgroundColor,'#1e1f22');
  store.set('ember');assert.equal(frame.type().props.backgroundColor,'#10090a','the background follows the theme');
  /* P11: mono keeps a background NAME that Ink leaves unpainted, so the frame never changes shape (p11-theme-frame.test.ts). */
  store.set('mono');assert.equal(frame.type().props.backgroundColor,'transparent','mono paints no background, with the frame shape unchanged');
  store.set('violet');assert.equal(frame.type().props.backgroundColor,'#0d0a19','and paints it again after mono');
});

test('R5b D4: rows already on screen take the new colours too (a change of theme redraws the memoised transcript)',async()=>{
  const store=createThemeStore(colour,'calm');
  const app=await mountR5a({cols:100,rows:36,root:env.root,paths:env.paths,themeStore:store,capabilities:colour});
  try{
    await app.type('hello there');app.press(ENTER);
    let s=await app.waitFor('the message',x=>x.lines.some(line=>YOU.test(line)));
    const y=s.lines.findIndex(line=>YOU.test(line)),x=s.lines[y]!.indexOf('›');
    assert.equal(await app.fg(y,x),0xc08b3c,'Calm draws the prompt marker in its accent');
    await app.type('/theme ember');app.press(ENTER);
    s=await app.waitFor('ember kept',z=>/Theme: Ember/u.test(z.text));
    const y2=s.lines.findIndex(line=>YOU.test(line));
    assert.equal(await app.fg(y2,s.lines[y2]!.indexOf('›')),0xff5c62,'the same row, drawn again in Ember');
  }finally{app.unmount();}
});
