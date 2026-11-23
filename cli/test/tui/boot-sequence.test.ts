import assert from 'node:assert/strict';
import test from 'node:test';
import {DESKTOP_LOGO_SOURCE,TALOS_ASCII_FRAMES,asciiLogoFrame} from '../../src/tui/boot/desktop-logo.ts';
import {TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';
import {bootFrameAt,bootLinesAt,bootPhaseAt,createBootSequenceComponent,createBootState,markBootReady,shouldRenderBootLogo,skipBoot} from '../../src/tui/boot/boot-sequence.ts';
import {createTuiTheme,themeColor} from '../../src/tui/theme.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

test('boot asset records exact Desktop source paths and cinematic duration',()=>{
  assert.equal(DESKTOP_LOGO_SOURCE.commit,'0c432153a288f64237e98403869d02d20d8fabc7');
  assert.equal(DESKTOP_LOGO_SOURCE.nominalRevealMs,7200);
  assert.match(DESKTOP_LOGO_SOURCE.svg,/logo-short\.svg$/u);
});

test('runtime readiness does not truncate the cinematic boot',()=>{
  const s=createBootState(0);
  const readyRuntime=markBootReady(s,120);
  assert.notEqual(readyRuntime.phase,'ready');
  assert.equal(bootPhaseAt(readyRuntime,120),'revealing');
  assert.equal(bootPhaseAt(readyRuntime,TALOS_BOOT_DURATION_MS-1),'revealing');
});

test('skip renders final frame and can finish immediately once runtime is ready',()=>{
  const runtimeReady=markBootReady(createBootState(0),120);
  const skipped=skipBoot(runtimeReady);
  assert.equal(skipped.phase,'ready');
  const lines=bootLinesAt(skipped,120,{motion:true,unicode:true,width:110} as never);
  assert.match(lines.join('\n'),/TALOS|████/u);
});

test('cinematic boot reaches a TALOS wordmark and keeps rows within requested layout',()=>{
  const state=createBootState(0);
  const wide=bootLinesAt(state,TALOS_BOOT_DURATION_MS-100,{motion:true,unicode:true,width:110} as never);
  assert.match(wide.join('\n'),/TALOS|████/u);
  assert.ok(wide.length>=12);
  assert.ok(wide.every(line=>displayWidth(line)<=110));

  const compact=bootLinesAt(state,TALOS_BOOT_DURATION_MS-100,{motion:true,unicode:true,width:60} as never);
  assert.match(compact.join('\n'),/TALOS|╔╦╗/u);
  assert.ok(compact.every(line=>displayWidth(line)<=60));
});

test('reduced motion uses the final cinematic frame',()=>{
  const state=createBootState(0);
  assert.equal(bootFrameAt(state,10,false),TALOS_ASCII_FRAMES.length-1);
  const lines=bootLinesAt(state,10,{motion:false,unicode:true,width:90} as never);
  assert.match(lines.join('\n'),/TALOS|████|╔╦╗/u);
});

test('no-color suppresses the branded boot logo while reduced motion with color keeps it',()=>{
  assert.equal(shouldRenderBootLogo({interactive:true,color:false,motion:false,unicode:true}),false);
  assert.equal(shouldRenderBootLogo({interactive:true,color:true,motion:false,unicode:true}),true);
});

test('shared TALOS theme uses gold as the default accent',()=>{
  const theme=createTuiTheme({interactive:true,color:true,motion:true,unicode:true});
  /* R5b D4 (owner decision Q-R5-14): the default's accent is the product's own seed; P15 (0.2.0): Forge, #c98b32. */
  assert.equal(theme.colors.accent,'#c98b32');
  assert.equal(themeColor(theme,'boot'),'#c98b32');
  assert.equal(themeColor(theme,'picker'),'#c98b32');
});

test('boot component consumes shared theme colors',()=>{
  const React:any={useState:(init:any)=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children})};
  const Ink:any={Box:'Box',Text:'Text'};
  const Component=createBootSequenceComponent(React,Ink);
  const tree:any=Component({state:createBootState(Date.now()),motion:false,unicode:true,width:90,accentColor:'#D4AF37',mutedColor:'#9D7F24'});
  assert.equal(tree.children[0].props.color,'#D4AF37');
  assert.equal(tree.children.at(-1).props.color,'#9D7F24');
});
