/*
 * R1 lane L, gate E11 step 3: the screen's regions as small Ink views, split out of `app.ts` behind `budget()`.
 *
 * Every region is a box of EXACTLY the height `budget()` gave it, `flexShrink:0`, overflow hidden (E1/E2). The frame
 * is therefore the sum of its regions whatever their content does: a region whose content is taller is clipped inside
 * its own rows instead of pushing the composer off the screen or overwriting the footer (review D-02/D-03). Single
 * lines of chrome are pre-truncated to the width with the width function Ink uses and rendered with
 * `wrap:'truncate-end'`, so a line can never become two rows (E4).
 */
import {t} from '../../i18n/index.ts';
import {composerLayout,type ComposerStore} from '../components/composer.ts';
import {composerDisplay} from '../components/composer.ts';
import type {EditorState} from '../editor.ts';
import {displayWidth,splitGraphemes,truncateDisplay} from '../text-width.ts';
import type {HitRegister} from '../components/styled-rows.ts';
import {TOO_SMALL_TEXT,type Budget} from './budget.ts';
import type {StatusSegment,StatusTone} from '../status-bar.ts';

export type RegionViews=ReturnType<typeof createRegionViews>;

export function createRegionViews(React:any,Ink:any){
  const h=React.createElement;
  /* A region: fixed height, never shrinks, never overflows. `bottom` anchors the content to the last row (transcript). */
  function Region({rows,bottom=false,boxRef,children,...rest}:{rows:number;bottom?:boolean;boxRef?:(node:unknown)=>void;children?:any;[key:string]:any}){
    if(rows<=0)return null;
    /* The inner box keeps the content at its natural height: a bordered panel squeezed by Yoga would draw its text
       over its own border (the D-02 trace); taller content is clipped by the region instead. */
    return h(Ink.Box,{flexDirection:'column',height:rows,flexShrink:0,overflowY:'hidden',...(bottom?{justifyContent:'flex-end'}:{}),...(boxRef?{ref:boxRef}:{}),...rest},h(Ink.Box,{flexDirection:'column',flexShrink:0},children));
  }
  /* One row of chrome, whatever the text. */
  function Line({text,columns,...style}:{text:string;columns:number;[key:string]:any}){
    return h(Ink.Text,{wrap:'truncate-end',...style},truncateDisplay(String(text??''),Math.max(1,columns))||' ');
  }
  /* Q-R1-8: below 40×12 the frame is the notice and nothing else: one line whenever it fits. Narrower than the notice
     itself (31 columns) it wraps at a word instead of being cut, so "need 40×12" — the one thing the line is for — is
     never lost; a person can still read it at 20 columns. */
  function TooSmall({columns}:{columns:number}){
    return h(Ink.Box,{flexDirection:'column',width:Math.max(1,columns)},h(Ink.Text,{wrap:'wrap'},TOO_SMALL_TEXT));
  }
  /*
   * The transcript region (E9, Q-R1-2/9): the dim announcement row (latest prompt above the view, messages above it),
   * then the items, bottom-anchored. `clipBelow` shifts the items down by the rows scrolled up inside the last one;
   * the rows that fall below the region are clipped by the region itself.
   */
  /* Stage 6c: the row's text before a cell and from it (the hit map needs the «You: …» part on its own). */
  const splitAt=(text:string,cell:number)=>{let at=0,before='';const graphemes=splitGraphemes(text);let index=0;for(;index<graphemes.length&&at<cell;index++){before+=graphemes[index];at+=displayWidth(graphemes[index]!);}return[before,graphemes.slice(index).join('')] as const;};
  function TranscriptRegion({rows,announcement,promptFrom=null,pill=null,hit,clipRef,clipBelow,color,children}:{rows:number;announcement:string|null;promptFrom?:number|null;pill?:{text:string;targetFrom:number}|null;hit?:HitRegister|undefined;clipRef?:((key:string,node:unknown)=>void)|undefined;clipBelow:number;color?:string;children?:any}){
    if(rows<=0)return null;
    const itemRows=rows-(announcement?1:0)-(pill?1:0);
    return h(Region,{rows},
      /* stage 6c (mockup `jumpprompt`): the «You: …» part is the target, where it was laid out */
      announcement?(hit&&promptFrom!==null
        ?h(Ink.Box,{key:'announce',ref:(node:unknown)=>{const [before,prompt]=splitAt(announcement,promptFrom);hit('announce',node,[[{text:before,roles:[]},{text:prompt,roles:[],action:'jumpprompt'}]]);}},h(Line,{text:announcement,columns:Number.MAX_SAFE_INTEGER,dimColor:true,color}))
        :h(Line,{key:'announce',text:announcement,columns:Number.MAX_SAFE_INTEGER,dimColor:true,color})):null,
      /* stage 6c: the items' region, so a title cut above or below it takes no click */
      itemRows>0?h(Region,{key:'items',rows:itemRows,bottom:true,...(clipRef?{boxRef:(node:unknown)=>clipRef('transcript',node)}:{})},h(Ink.Box,{flexDirection:'column',flexShrink:0,marginBottom:-Math.max(0,clipBelow)},children)):null,
      /* Tappa 8 C1 (mockup :701-702, :1122): the jump pill on the last row, under the items (owner 09/10: it stood on the first), its label the click target (action `jump`). */
      pill?(hit&&pill.targetFrom<pill.text.length
        ?h(Ink.Box,{key:'pill',ref:(node:unknown)=>{const [before,target]=splitAt(pill!.text,pill!.targetFrom);hit('pill',node,[[{text:before,roles:[]},{text:target,roles:[],action:'jump'}]]);}},h(Line,{text:pill.text,columns:Number.MAX_SAFE_INTEGER,color}))
        :h(Line,{key:'pill',text:pill.text,columns:Number.MAX_SAFE_INTEGER,color})):null,
    );
  }
  /*
   * The composer (E3): a bordered box whose text rows are laid out by `composerLayout` (exact row count, scrolled to
   * the cursor) and capped at `contentRows`. It subscribes to the composer store itself, so a keystroke re-renders the
   * composer and not the whole app (the fast input path of B1); the app re-renders only when the ROW COUNT changes.
   */
  /* The approved mockup (07/10 `composerRows`): a rounded frame in the faint colour, `│ › ` before the text, the marker in
     the accent, and while the composer is empty a faint placeholder that says what typing does now. */
  const ComposerRegion=React.memo(function ComposerRegion({store,vimHint,contentRows,hintRows,columns,placeholder='',accent,faint,frameless=false}:{frameless?:boolean;store:ComposerStore;vimHint:string;contentRows:number;hintRows:number;columns:number;placeholder?:string;accent?:string;faint?:string}){
    const editor:EditorState=React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
    const contentWidth=composerContentWidth(columns);
    const layout=composerLayout(composerDisplay(editor),{contentWidth,maxRows:contentRows});
    const hints=composerHints(editor,vimHint).slice(0,hintRows);
    const empty=editor.text===''&&placeholder!=='';
    /* FE-048, Zen: no frame, a blank row above the prompt (the mockup's `rigaPrompt`) */
    return h(Ink.Box,{...(frameless?{paddingTop:1}:{borderStyle:'round',...(faint?{borderColor:faint}:{})}),paddingX:1,flexDirection:'column',flexShrink:0,height:(frameless?1:2)+contentRows+hints.length,overflowY:'hidden'},
      ...layout.rows.map((row,index)=>{
        /* The marker `›` leads the first visible row; an arrow beside it says the text continues above or below. */
        const marker=index===0?(layout.hiddenAbove?'›↑':'› '):index===layout.rows.length-1&&layout.hiddenBelow?' ↓':'  ';
        const lead=h(Ink.Text,{key:'marker',...(accent?{color:accent}:{})},marker);
        if(empty&&index===0){const shown=truncateDisplay(placeholder,contentWidth),[first='',rest='']=[splitGraphemes(shown)[0],splitGraphemes(shown).slice(1).join('')];
          return h(Ink.Text,{key:`composer-row-${layout.start+index}`,wrap:'truncate-end'},lead,h(Ink.Text,{inverse:true,...(faint?{color:faint}:{dimColor:true})},first),h(Ink.Text,{...(faint?{color:faint}:{dimColor:true})},rest));}
        return h(Ink.Text,{key:`composer-row-${layout.start+index}`,wrap:'truncate-end'},lead,...row.map((piece,pieceIndex)=>h(Ink.Text,{key:pieceIndex,inverse:piece.kind==='cursor'||piece.selected,dimColor:piece.kind==='paste'},piece.text)));
      }),
      ...hints.map((hint,index)=>h(Ink.Text,{key:`composer-hint-${index}`,dimColor:true,wrap:'truncate-end'},truncateDisplay(hint,Math.max(1,columns-4)))),
    );
  },(previous:any,next:any)=>previous.store===next.store&&previous.vimHint===next.vimHint&&previous.contentRows===next.contentRows&&previous.hintRows===next.hintRows&&previous.frameless===next.frameless&&previous.columns===next.columns&&previous.placeholder===next.placeholder&&previous.accent===next.accent&&previous.faint===next.faint);
  /* The header row (dropped third when rows run out, E13). */
  /* stage 6c: `target` — the part of the header a click takes (the agent view's way back, mockup `unwatch`) */
  function Header({rows,text,color,hit,target}:{rows:number;text:string;color?:string;hit?:HitRegister|undefined;target?:{from:number;action:string}|null|undefined}){
    const line=h(Ink.Text,{bold:true,color,wrap:'truncate-end'},text);
    if(!hit||!target)return h(Region,{rows},line);
    const [before,part]=splitAt(text,target.from);
    return h(Region,{rows},h(Ink.Box,{ref:(node:unknown)=>hit('header',node,[[{text:before,roles:[]},{text:part,roles:[],action:target.action}]])},line));
  }
  /* The overlay host wiring (Q-R1-3): diff, overlay, completions and command menu, each in the rows the budget gave it,
     in the order they stack above the status row. An overlay taller than its rows is clipped by its region, never drawn
     over the composer; lane O fits every overlay to `maxRows` so that clip does not happen in practice. */
  function Panels({budget,diff,overlay,aux,menu}:{budget:Budget;diff:any;overlay:any;aux:any[];menu:any}){
    return h(React.Fragment,null,
      h(Region,{key:'diff',rows:budget.diff},diff),
      h(Region,{key:'overlay',rows:budget.overlay},overlay),
      h(Region,{key:'aux',rows:budget.aux},...aux),
      h(Region,{key:'menu',rows:budget.menu},menu));
  }
  /* The rows under the composer, each one row and only if the budget kept it: dropped roster first, then the shortcut
     strip; the footer stays longest (E13). */
  /* `shortcutNode` / `footerNode`: the rows already drawn (the mockup's footer, components/chrome-rows.ts), in place of the strings. */
  function StatusBar({budget,shortcutLine,shortcutAside,shortcutNode=null,footerNode=null,rosterLines,queueLine,reasoningLine,footerLine,color,statusSegments,toneColors}:{budget:Budget;shortcutLine:string;shortcutAside?:any;shortcutNode?:any;footerNode?:any;rosterLines:any[];queueLine:string;reasoningLine:string|null;footerLine:string;color?:string;statusSegments?:readonly StatusSegment[];toneColors?:Partial<Record<StatusTone,string>>}){
    const line=(key:string,text:string)=>h(Ink.Text,{key,dimColor:true,color,wrap:'truncate-end'},text||' ');
    const keys=(key:string)=>shortcutNode?h(Ink.Box,{key},shortcutNode):line(key,shortcutLine);
    /* Stage 6a: the agents pill sits at the right of the mode row (mockup footerRows); the keys give way to it. Under 100
       columns the mode row is the footer row, and the pill sits beside it there. */
    const withAside=(key:string,node:any)=>shortcutAside?h(Ink.Box,{key,flexDirection:'row'},h(Ink.Box,{key:'keys',flexGrow:1,flexShrink:1},node),h(Ink.Box,{key:'aside',flexShrink:0},shortcutAside)):node;
    return h(React.Fragment,null,
      budget.shortcut?withAside('shortcut',keys('keys')):null,
      ...(budget.roster?rosterLines.slice(0,budget.roster):[]),
      budget.extras&&queueLine?line('queue',queueLine):null,
      budget.extras&&reasoningLine?line('reasoning',reasoningLine):null,
      budget.footer?(footerNode?(budget.shortcut?h(Ink.Box,{key:'footer'},footerNode):withAside('footer',h(Ink.Box,{key:'footer-row'},footerNode)))
        :statusSegments?.length?h(StatusRow,{key:'footer',segments:statusSegments,color,toneColors}):line('footer',footerLine)):null);
  }
  /* R5a S1 (Q-R5-2): the status row, one Text; the context percentage takes Hermes's colours at 50 / 80 / 95 (bold at 95)
     and every other segment stays dim like the chrome. The segments already fit the width (status-bar.ts). */
  function StatusRow({segments,color,toneColors}:{segments:readonly StatusSegment[];color?:string;toneColors?:Partial<Record<StatusTone,string>>}){
    return h(Ink.Text,{wrap:'truncate-end'},...segments.flatMap((segment,index)=>{
      const toned=segment.tone!=='normal';
      const piece=h(Ink.Text,{key:segment.id,dimColor:!toned,color:toned?(toneColors?.[segment.tone]??color):color,bold:segment.tone==='critical'},segment.text);
      return index?[h(Ink.Text,{key:`sep-${segment.id}`,dimColor:true,color},' · '),piece]:[piece];
    }));
  }
  return{Region,Line,TooSmall,TranscriptRegion,ComposerRegion,Header,Panels,StatusBar};
}

/* Text columns inside the composer: the two border cells, the space inside each (the mockup's `│ ` and ` │`) and the
   two-cell marker (`› `) are not text. */
export function composerContentWidth(columns:number){return Math.max(1,Math.floor(columns)-6);}

/* What the budget needs from the composer: its text rows at this width and its hint rows. The app subscribes to this
   PRIMITIVE through the store, so it re-renders when the composer grows or shrinks by a row, not on every key. */
/* The dim lines under the composer, one list for the drawing and the height budget. UI Phase 1 (owner 27/09): with the
   cursor right after a collapsed paste, Claude Code's "paste again to expand" (pasting the same text there expands it). */
export function composerHints(editor:EditorState,vimHint:string):string[]{
  const afterPaste=editor.collapsedPastes.some(paste=>paste.end===editor.cursor);
  return[vimHint,afterPaste?t('screen.composer.pasteAgainHint'):'',editor.text.includes('\n')?t('screen.composer.multilineHint'):''].filter(Boolean);
}
export function composerMeasure(editor:EditorState,columns:number,vimHint:string){
  const rows=composerLayout(composerDisplay(editor),{contentWidth:composerContentWidth(columns),maxRows:Number.MAX_SAFE_INTEGER}).total;
  return{lines:rows,hints:composerHints(editor,vimHint).length};
}
