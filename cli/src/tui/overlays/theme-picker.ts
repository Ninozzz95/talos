/*
 * R5b D4 (owner decision Q-R5-14): the /theme picker — the ten product themes and mono, each with a swatch drawn in its
 * own accent, the one in use marked. The arrows preview a theme on the whole screen (theme-store.ts); Enter keeps it, Esc
 * puts back the one in use.
 */
import {t} from '../../i18n/index.ts';
import type {UiTheme} from '../../config/types.ts';
import {TALOS_THEME_ACCENTS} from '../theme-catalog.ts';
import {THEME_CHOICES} from '../theme-store.ts';
import type {OverlayContent,OverlayLine} from './scroll-window.ts';
import {pad,S,type SegRow} from '../panel/sheet.ts';

export function themeLabel(id:UiTheme):string{return TALOS_THEME_ACCENTS.find(row=>row.id===id)?.label??t('screen.theme.mono');}

/*
 * Stage 7.18 (mockup `themesFrame`; Claude Code /theme previews live in a list that fits the terminal, Hermes /skin repaints
 * every surface live): /theme is a page of its own — the ten themes in the mockup's order, a swatch in each one's accent (a
 * «#rrggbb» role, drawn only where the terminal has colour), the one in use marked, and Mono named under the list: it stays
 * /theme mono, for screen readers and logs.
 */
const PAGE_ORDER=['forge','calm','terminal','aurora','ember','atlas','noir','signal','violet','telemetry'] as const;
export const THEME_PAGE=PAGE_ORDER.map(id=>TALOS_THEME_ACCENTS.find(row=>row.id===id)!);
const fitRow=(row:SegRow,width:number):SegRow=>{const out:SegRow=[];let n=0;for(const seg of row){if(n>=width)break;const text=[...seg.text].slice(0,width-n).join('');if(text)out.push({...seg,text});n+=[...text].length;}return out;};
export function themePageRows({selected,current,width,height,colors}:{selected:number;current:UiTheme;width:number;height:number;colors:boolean}):SegRow[]{
  const rows:SegRow[]=[[S(` ${t('screen.theme.title')}`,'acc b'),S(` · ${t('screen.theme.pageKeys')}`,'faint')],[S('')]];
  THEME_PAGE.forEach((theme,index)=>{const on=index===selected;
    rows.push([S(on?' › ':'   ','acc'),S('██ ',colors?[theme.accent]:[]),S(pad(theme.label,12),on?'acc b':'',`theme:${index}`),S(theme.id===current?t('screen.theme.inUse'):'','faint')]);});
  rows.push([S('')],[S(`   ${t('screen.theme.pageNote')}`,'dim')]);
  while(rows.length<height)rows.push([S('')]);
  return rows.slice(0,height).map(row=>fitRow(row,width));
}
export function themePickerOverlay({selected,current,colors}:{selected:number;current:UiTheme;colors:boolean}):OverlayContent{
  const lines:OverlayLine[]=THEME_CHOICES.map((id,index)=>{
    const row=TALOS_THEME_ACCENTS.find(entry=>entry.id===id);
    const text=`${row?'■':' '} ${themeLabel(id)}${id==='mono'?' · '+t('screen.theme.noColour'):''}${id===current?' · '+t('screen.theme.inUse'):''}`;
    /* stage 6c (mockup `theme:i`): a click shows the theme, as ↑/↓ do; Enter keeps it */
    return{text,tone:index===selected?'selected':'plain',action:`theme:${index}`,...(row&&colors?{accentTo:1,accentColor:row.accent}:{})};
  });
  return{
    head:[{text:t('screen.theme.title'),tone:'title'}],
    sections:[{lines,selected}],
    foot:[{text:t('screen.theme.keys',{current:themeLabel(current)}),tone:'dim'}],
  };
}
