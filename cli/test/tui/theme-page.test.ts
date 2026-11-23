/*
 * Stage 7.18 (mockup themesFrame «Theme · ↑/↓ preview live · enter keep · esc put back»; Claude Code /theme previews live in
 * a list that fits the terminal, Hermes /skin repaints every surface live): /theme is a page of its own — the ten themes in
 * the mockup's order, a swatch in each one's accent, the one in use marked; Mono stays /theme mono, named under the list.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {THEME_PAGE,themePageRows} from '../../src/tui/overlays/theme-picker.ts';
import {roleStyle,type StyledRow} from '../../src/tui/components/styled-rows.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/theme-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{height:number;text:string[];style:string[]}>};
const text=(rows:readonly StyledRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));
/* the golden style dump has the mockup's classes; the swatch's colour is an inline style there, a «#rrggbb» role here */
const style=(rows:readonly StyledRow[])=>rows.map(row=>{let x=0;const out:string[]=[];for(const s of row){const n=[...s.text].length;const roles=s.roles.filter(r=>!r.startsWith('#'));if(roles.length&&n)out.push(`${x}+${n}:${[...roles].sort().join(',')}`);x+=n;}return out.join(' ');});

for(const [size,w,h] of [['120x40',120,40],['80x24',80,24]] as const){
  test(`cmd-theme at ${size}: the page is the mockup's`,()=>{
    const frame=golden.frames[size]!;const rows=themePageRows({selected:0,current:'forge',width:w,height:h,colors:true});
    assert.equal(rows.length,frame.text.length);
    assert.deepEqual(text(rows),frame.text);assert.deepEqual(style(rows),frame.style);
  });
}

test('each swatch is drawn in its theme\'s accent; without colour no swatch colour; the selection and «in use» follow',()=>{
  assert.deepEqual(THEME_PAGE.map(row=>row.id),['forge','calm','terminal','aurora','ember','atlas','noir','signal','violet','telemetry']);
  const rows=themePageRows({selected:2,current:'calm',width:120,height:20,colors:true});
  const swatch=rows[2]![1]!;assert.equal(swatch.text,'██ ');assert.deepEqual(swatch.roles,['#c98b32']);
  assert.equal(text(rows)[3],'   ██ Calm        in use');assert.equal(text(rows)[4],' › ██ Terminal');
  assert.deepEqual(roleStyle(['#c98b32'],{accent:'#ffffff'} as any),{color:'#c98b32'});
  assert.deepEqual(roleStyle(['#c98b32'],{} as any),{},'a terminal without colour draws the swatch plain');
  assert.deepEqual(themePageRows({selected:0,current:'mono',width:80,height:14,colors:false})[2]![1]!.roles,[]);
});
