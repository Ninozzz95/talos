/*
 * Stage 7 (owner 01/10: the approved mockup to the letter; 02/10: «Faint alzato a 4,5:1»; registro 12). The mockup derives
 * every colour of a theme from its two seeds (`themeVars`: text, dim, faint, band, code, panel, border, highlight,
 * selection, the add/del/warn backgrounds, ok/warn/err). The formula is written again here, from the mockup, so the product
 * is compared with the mockup and not with itself; the one owner change is faint, raised along the same line toward the
 * text only until it reads at 4.5:1 (D3).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {TALOS_THEME_ACCENTS,contrastRatio,themePalette} from '../../src/tui/theme-catalog.ts';

const rgb=(h:string)=>[0,2,4].map(i=>parseInt(h.slice(1).slice(i,i+2),16));
const mix=(a:string,b:string,t:number)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]!-v)*t).toString(16).padStart(2,'0')).join('');
function mockup(acc:string,bg:string){
  const fg=mix('#ece9e2',acc,0.05);
  return{background:bg,foreground:fg,dim:mix(fg,bg,0.40),faint:mix(fg,bg,0.62),accent:acc,ok:'#7ccf8a',warn:'#e3b341',err:'#f07a7a',
    band:mix(bg,fg,0.07),code:mix(bg,fg,0.05),panel:mix(bg,fg,0.06),border:mix(bg,fg,0.2),highlight:mix(bg,acc,0.42),selection:mix('#000000',acc,0.5),
    addBackground:mix(bg,'#7ccf8a',0.12),delBackground:mix(bg,'#f07a7a',0.12),warnBackground:mix(bg,'#e3b341',0.12),
    /* the charts' series, `motore.js` of the bozzetto */
    s1:acc,s2:fg,s3:mix(acc,bg,0.5),s4:mix(fg,bg,0.40),s5:mix(acc,fg,0.55),s6:mix(fg,bg,0.68)};
}

test('every theme\'s palette is the mockup\'s, colour for colour',()=>{
  for(const theme of TALOS_THEME_ACCENTS){
    const {faint,...expected}=mockup(theme.accent,theme.background);
    const {faint:ours,...palette}=themePalette(theme);
    assert.deepEqual(palette,expected,theme.id);
    assert.ok(faint,theme.id);assert.ok(ours,theme.id);
  }
});

test('faint is the mockup\'s tint raised toward the text only until it reads at 4.5:1; dim already reads',()=>{
  for(const theme of TALOS_THEME_ACCENTS){
    const palette=themePalette(theme);
    assert.ok(contrastRatio(palette.dim,palette.background)>=4.5,`${theme.id} dim`);
    assert.ok(contrastRatio(palette.faint,palette.background)>=4.5,`${theme.id} faint reads at 4.5:1`);
    /* the smallest raise: one step less toward the text (1% of the way) reads below 4.5:1 */
    const steps=Math.round((0.62-tFor(palette.faint,palette.foreground,palette.background))*100);
    const lower=mix(palette.foreground,palette.background,0.62-(steps-1)/100);
    assert.ok(steps>=1&&contrastRatio(lower,palette.background)<4.5,`${theme.id}: raised no further than needed (${steps} steps)`);
    assert.ok(contrastRatio(palette.faint,palette.background)<contrastRatio(palette.dim,palette.background),`${theme.id}: faint stays below dim`);
  }
});
/* where on the line from the text to the background a colour sits (the faint is on it by construction) */
function tFor(color:string,fg:string,bg:string){for(let k=0;k<=100;k++){if(mix(fg,bg,k/100)===color)return k/100;}throw new Error(`${color} is not on the line ${fg} → ${bg}`);}
