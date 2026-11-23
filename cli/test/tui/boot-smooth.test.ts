/*
 * Owner 02/10: the boot animation smoother («60 fps e solo righe cambiate»; registro 12). Measured on the synthetic
 * terminal: 24.3 frames a second, gaps p90 67 ms. The cause was not the clock but the scene: `renderCinematicBoot` stepped
 * its geometry 15 times a second and its particles 12 times, whatever the tick, so a faster tick drew the same frame again
 * (47% of 16 ms ticks). Now the scene follows continuous time (Gaffer on Games, «Fix your timestep») and the boot ticks at
 * 60 frames a second (Pi's 16 ms render floor); the rows that change are the only ones written (row-writer.ts).
 * Owner 14/10 («nuovo boot logo approvato, implementalo»): the boot is the approved mockup's, so the finished logo is compared
 * with the frames of the new design (the real mark in Braille, the gold as continuous intensities, the glow behind the nodes),
 * Owner 14/10 evening (0.6.6, «APPROVATA»): the mark is the medal of avvio-medaglia.html; the fixtures were taken again after the
 * renderer matched the mockup's medaglia.js on every cell (character, intensity, metal) every 40 ms at widths 44-120.
 * and «the same frame again» is judged on what reaches the terminal: the text AND its colours.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {renderCinematicBoot,rowsToSegments,TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';
import {BOOT_FRAME_MS} from '../../src/tui/boot/boot-sequence.ts';

const GOLDEN=JSON.parse(readFileSync(new URL('./fixtures/boot-final-golden.json',import.meta.url),'utf8'));

test('the boot ticks at 60 frames a second',()=>{
  assert.equal(BOOT_FRAME_MS,16);
});

test('at a 16 ms tick the scene moves on almost every frame (it stepped at 15 and 12 a second)',()=>{
  let same=0,total=0,run=0,longest=0,previous='';
  for(let at=0;at<TALOS_BOOT_DURATION_MS;at+=BOOT_FRAME_MS){
    const painted=JSON.stringify(rowsToSegments(renderCinematicBoot(at,120,true,false,{counter:true}),{glowBase:'#080b11'}));
    if(previous){total++;if(painted===previous){same++;run++;longest=Math.max(longest,run);}else run=0;}previous=painted;
  }
  /* the approved design has short holds (the shimmer crossing empty space, the top of a breath): measured 17%, never more than
     three ticks in a row; a scene stepped at 15 a second repeats each frame four times */
  assert.ok(same/total<0.2,`${same} of ${total} ticks drew the same frame again (${(100*same/total).toFixed(0)}%)`);
  assert.ok(longest<=3,`the same frame stayed for ${longest+1} ticks in a row`);
});

test('the finished logo is the approved one, at every width, with and without the counter',()=>{
  for(const [key,want] of Object.entries(GOLDEN) as Array<[string,{lines:string[];levels:number[][];intensities:number[][];metal:number[][]}]>){
    const [width,kind]=key.split('-');
    const frame=renderCinematicBoot(0,Number(width),true,true,{counter:kind==='counter'});
    assert.deepEqual({lines:frame.lines,levels:frame.levels,intensities:frame.intensities,metal:frame.metal},want,key);
  }
});

/* Owner 14/10: the movement is the approved mockup's, «alla lettera». These frames were taken from the renderer after it matched
   the mockup's own renderer (proposta.js) on every cell — character, intensity and glow — every 40 ms at widths 60-120; 0.6.6:
   taken again from the medal, after the same check against medaglia.js (character, intensity and metal, widths 44-120). */
const FRAMES=JSON.parse(readFileSync(new URL('./fixtures/boot-frames-golden.json',import.meta.url),'utf8'));
test('the reveal moves as the approved mockup: eight moments, two widths, text and colour',()=>{
  for(const [key,want] of Object.entries(FRAMES)){
    const [width,ms]=key.split('@').map(Number) as [number,number];
    assert.deepEqual(rowsToSegments(renderCinematicBoot(ms,width,true,false,{counter:true}),{glowBase:'#080b11'}),want,key);
  }
});
