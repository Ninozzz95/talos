/*
 * Stage 3 (owner 01/10: the approved mockup to the letter). The mockup draws its cards as rows of segments carrying style
 * ROLES (acc, b, i, u, dim, faint, inv, ok, warn, warnbg, code, add, del, pill); the conformance gate compares those roles with the
 * golden frames. This is the ONE place a role becomes an Ink text style, so every card drawn from the mockup (questions
 * now; plan, agent dialogue later) looks the same. Colours come from the theme; without colour the roles keep their
 * attributes (bold, italic, inverse, dim) and lose only the hue. Stage 7 gives every role the mockup's colour (theme-catalog.ts `themePalette`).
 */
import type {TuiTheme} from '../theme.ts';
import {QR_DARK,QR_LIGHT} from '../../remote/terminal.ts';

/* stage 6c (owner 01/10 «tutto cliccabile»): `action` is the mockup's `data-a` — a click on the segment runs it (hit-map.ts; on the release, owner 02/10) */
export type StyledSegment={text:string;roles:readonly string[];action?:string;element?:string};
/** Stage 6c: where a block of rows tells the screen it was drawn (its Ink element), so its actions become click targets. */
/* `clip`: the region the block is seen through (stage 6c: a transcript item is cut where the transcript region ends) */
export type HitRegister=(key:string,node:unknown,rows:readonly StyledRow[],clip?:string)=>void;
export type StyledRow=readonly StyledSegment[];
export type TextStyle={color?:string;backgroundColor?:string;bold?:true;italic?:true;underline?:true;dimColor?:true;inverse?:true};

/* Stage 7: the mockup's classes in the order its style sheet defines them (MOCKUP-FASE-UI-2026-10-01.html:44-48): where two
   roles of one segment set the same property, the later class wins, as in the mockup. .c-inv and .c-pill are the accent
   BEHIND text in the background colour, not the terminal's inverse; .c-hl the highlight behind the text; .c-band and
   .c-code a surface; .c-add, .c-del and .c-warnbg a colour on its tinted background. */
const COLOR_RULES:ReadonlyArray<[string,keyof TuiTheme['colors']]>=[['dim','muted'],['faint','faint'],['acc','accent'],['ok','success'],['warn','warning'],['err','danger'],
  ['inv','background'],['hl','foreground'],['pill','background'],['add','success'],['del','danger'],['warnbg','warning']];
const BACKGROUND_RULES:ReadonlyArray<[string,keyof TuiTheme['colors']]>=[['band','band'],['code','code'],['inv','accent'],['hl','highlight'],['pill','accent'],
  ['add','addBackground'],['del','delBackground'],['warnbg','warnBackground']];
const last=(roles:readonly string[],rules:ReadonlyArray<[string,keyof TuiTheme['colors']]>,colors:TuiTheme['colors'])=>{let found:string|undefined;for(const [role,key] of rules)if(roles.includes(role)&&colors[key])found=colors[key];return found;};

/* B1 of the redesign (the mockup's `f:` and `g:`): the text or the background of a cell, by a name of the theme or a colour of its own; never without colour */
function chartColor(roles:readonly string[],prefix:'f:'|'g:',colors:TuiTheme['colors']):string|undefined{
  if(!colors.accent)return undefined;
  const role=roles.findLast(item=>item.startsWith(prefix));if(!role)return undefined;
  const name=role.slice(2);
  return/^#[0-9a-f]{6}$/iu.test(name)?name:colors[name as keyof TuiTheme['colors']];
}

export function roleStyle(roles:readonly string[],colors:TuiTheme['colors']):TextStyle{
  const has=(role:string)=>roles.includes(role);
  /* 0.6.15 T4: the pairing QR (remote-card.ts) is dark modules on a light ground whatever the theme, colour or not — as `talos
     remote` paints it (remote/terminal.ts QR_DARK, QR_LIGHT): a camera reads the modules, not the theme */
  if(has('qr'))return{color:QR_DARK,backgroundColor:QR_LIGHT};
  /* stage 7.18 (mockup themesFrame `style:'color:'+acc`): a «#rrggbb» role is a colour of its own, drawn only with colour */
  const own=colors.accent?roles.find(role=>/^#[0-9a-f]{6}$/iu.test(role)):undefined;
  const color=chartColor(roles,'f:',colors)??own??last(roles,COLOR_RULES,colors),backgroundColor=chartColor(roles,'g:',colors)??last(roles,BACKGROUND_RULES,colors);
  /* without colour (NO_COLOR, a monochrome terminal) the attributes carry the difference: faint dims, a pill or a marked row inverts */
  const plain=!colors.accent;
  return{...(color?{color}:{}),...(backgroundColor?{backgroundColor}:{}),...(has('b')||has('pill')?{bold:true as const}:{}),...(has('i')?{italic:true as const}:{}),...(has('u')?{underline:true as const}:{}),
    ...(plain&&has('faint')?{dimColor:true as const}:{}),...(plain&&(has('inv')||has('pill')||has('warnbg')||has('hl'))?{inverse:true as const}:{})};
}

/** One Ink line per row, its segments as nested texts; rows never wrap (the card rows are already fitted to the width). */
export function renderStyledRows(h:(...args:any[])=>any,Ink:any,rows:readonly StyledRow[],colors:TuiTheme['colors'],key='styled',hit?:HitRegister){
  const clickable=hit&&rows.some(row=>row.some(segment=>segment.action));
  /* an empty row keeps its row: Ink lays out a Text with no content zero rows high (the sheet's blank rows, gate probe 02/10) */
  return h(Ink.Box,{key,flexDirection:'column',...(clickable?{ref:(node:unknown)=>hit(key,node,rows)}:{})},...rows.map((row,index)=>h(Ink.Text,{key:index,wrap:'truncate'},
    ...(row.some(segment=>segment.text)?row.map((segment,at)=>{const style=roleStyle(segment.roles,colors);return Object.keys(style).length?h(Ink.Text,{key:at,...style},segment.text):segment.text;}):[' ']))));
}
