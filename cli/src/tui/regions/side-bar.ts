/*
 * FE-048: the left bar (the mockup's `righeBarra`, bozzetto-cli/src/guscio.js). Pure rows, on the `band` surface. Each voice opens what the
 * CLI has today, by its command: a voice with no surface yet is not drawn (no fake feature). The letter is the voice's icon and its key.
 * Groups are closed by default, as on the PC, and their letters work anyway. A voice is one element across its whole band (owner 01/11,
 * «Fascia intera»), so hover and click take the band of that voice and nothing else.
 */
import {t} from '../../i18n/index.ts';
import type {SessionState} from '../session-state.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';

export type BarVoice={id:string;key:string;command:string};
export type BarGroup={id:string;voices:readonly BarVoice[]};
export type BarSession={id:string;title:string;mark:string;role:string;when:string;current:boolean;/* C6: the PC's cascade */state?:SessionState;/* a session at work, from when */startedAtMs?:number;/* where it lives, for the shelf */project?:string|null;path?:string|null;parent?:string|null;/* when it last moved, for the Home */at?:string|null};
export type BarState={width:number;height:number;open:ReadonlySet<string>;selected:number;focused:boolean;sessions:readonly BarSession[]};
export type BarEntry={kind:'voice';voice:BarVoice}|{kind:'group';group:BarGroup}|{kind:'session';session:BarSession};

export const BAR_TOP:readonly BarVoice[]=[{id:'new',key:'+',command:'/clear'},{id:'search',key:'/',command:'/resume'}];
export const BAR_GROUPS:readonly BarGroup[]=[
  {id:'spaces',voices:[{id:'conversations',key:'c',command:'/resume'},{id:'notes',key:'n',command:'/notes'},{id:'tasks',key:'a',command:'/tasks'},{id:'library',key:'l',command:'/library'},{id:'memory',key:'m',command:'/memory'},{id:'research',key:'r',command:'/research'},/* C11b (bozzetto-cli-retro/index.html:647) */{id:'projects',key:'p',command:'/projects'}]},
  {id:'tools',voices:[{id:'models',key:'o',command:'/model'},{id:'capabilities',key:'y',command:'/mcp'},{id:'forge',key:'f',command:'/forge'},{id:'automations',key:'u',command:'/automations'},{id:'doctor',key:'d',command:'/doctor'}]},
];
export const BAR_BOTTOM:readonly BarVoice[]=[{id:'settings',key:'i',command:'/config'}];

const word=(key:string)=>t(key as Parameters<typeof t>[0]);
const band=(text:string,...roles:string[]):StyledSegment=>({text,roles:[...roles,'band']});
const pad=(text:string,width:number)=>text+' '.repeat(Math.max(0,width-displayWidth(text)));

/** What the keyboard walks through, in the order drawn. */
export function barEntries(state:Pick<BarState,'open'|'sessions'|'height'>):BarEntry[]{
  const out:BarEntry[]=BAR_TOP.map(voice=>({kind:'voice',voice}));
  for(const group of BAR_GROUPS){
    out.push({kind:'group',group});
    if(state.open.has(group.id))for(const voice of group.voices)out.push({kind:'voice',voice});
  }
  const room=Math.max(0,state.height-out.length-BAR_BOTTOM.length-4);
  for(const session of state.sessions.slice(0,room))out.push({kind:'session',session});
  for(const voice of BAR_BOTTOM)out.push({kind:'voice',voice});
  return out;
}

export function sideBarRows(state:BarState):StyledSegment[][]{
  const {width,height}=state;const entries=barEntries(state);
  const line=(index:number,body:(selected:boolean)=>StyledSegment[],action?:string):StyledSegment[]=>{
    const selected=state.focused&&index===state.selected;
    const lead:StyledSegment={text:selected?' › ':'   ',roles:selected?['acc','hl']:['acc','band']};
    const element=action;
    const row=[lead,...body(selected)];
    const used=row.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
    const filled=[...row,{text:' '.repeat(Math.max(0,width-used)),roles:[selected?'hl':'band']}];
    return filled.map(segment=>action?{...segment,action,...(element?{element}:{})}:segment);
  };
  const voiceRow=(index:number,voice:BarVoice,detail='')=>line(index,selected=>{
    const room=width-5-displayWidth(detail);
    return[{text:`${voice.key} `,roles:selected?['acc','b','hl']:['acc','band']},{text:pad(truncateDisplay(word(`screen.bar.${voice.id}`),room),room),roles:selected?['hl','b']:['band']},...(detail?[band(detail,'faint')]:[])];
  },`bar:${voice.id}`);
  /* owner 01/11: every column closes with a button too, the ✕ of the sheets */
  const rows:StyledSegment[][]=[[band(pad(' TALOS',width-3),'acc','b'),{text:' ✕ ',roles:['faint','band'],action:'frame:close-bar',element:'frame:close-bar'}],[band(pad('',width))]];
  const bottom:StyledSegment[][]=[];let sessionsTitled=false;
  entries.forEach((entry,index)=>{
    if(entry.kind==='group'){
      const opened=state.open.has(entry.group.id);
      rows.push(line(index,selected=>[{text:`${opened?'▾':'▸'} ${word(`screen.bar.group.${entry.group.id}`)}`,roles:selected?['hl','faint']:['faint','band']}],`group:${entry.group.id}`));
      return;
    }
    if(entry.kind==='session'){
      if(!sessionsTitled){sessionsTitled=true;rows.push([band(pad(`   ${t('screen.bar.sessions',{count:state.sessions.length})}`,width),'faint')]);}
      const session=entry.session;
      rows.push(line(index,selected=>{
        const room=Math.max(4,width-6-displayWidth(session.when));
        return[{text:`${session.mark} `,roles:[session.role,selected?'hl':'band']},{text:pad(truncateDisplay(session.title,room),room),roles:session.current?['acc','b',selected?'hl':'band']:[selected?'hl':'band']},band(` ${session.when}`,'faint')];
      },`session:${session.id}`));
      return;
    }
    if(BAR_BOTTOM.includes(entry.voice))bottom.push(voiceRow(index,entry.voice));
    else rows.push(voiceRow(index,entry.voice));
  });
  while(rows.length<height-bottom.length)rows.push([band(pad('',width))]);
  /* a long list slides so that the selected row stays in view; the title and the bottom voices do not move */
  const room=height-bottom.length;const selectedAt=rows.findIndex(row=>row[0]?.text===' › ');
  const from=selectedAt<room?0:selectedAt-room+1;
  return[...rows.slice(from,from+room),...bottom].slice(0,height);
}
