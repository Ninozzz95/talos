/*
 * FE-048, owner 01/11 («la schermata … che la stiamo facendo a fare se appena faccio partire la cli appare la schermata legacy?»; he chose
 * «Home col prompt»): at an empty conversation the centre is the Home of the mockup (frame 30), the prompt stays under it with the focus.
 * Words are the PC's Home (Frontend). What falls, in order: from 100 columns everything; under 100 the right column; the medal needs 64×26;
 * under 60 the sentence; under 20 rows of the page the medal, under 10 the head, under 6 all but the project.
 */
import type {StyledRow,StyledSegment} from './styled-rows.ts';
import {sessionMark,sessionStateText,type SessionState} from '../session-state.ts';
import {loadingRow} from '../panel/loading.ts';
import {displayWidth,truncateDisplay,truncateMiddle} from '../text-width.ts';
import {t} from '../../i18n/index.ts';

export type HomeSession={id:string;title:string;state:SessionState;when:string};
export type HomeInput={width:number;height:number;workspace:string;model:string|null;provider?:string|null;
  /* null while the list is read: loading is never empty */sessions:readonly HomeSession[]|null;loadingMs:number;now:number;glyph:string;motion:boolean;unicode:boolean;
  /* the medal at rest, when the colours can draw it */medal?:(()=>readonly StyledRow[])|null};

const S=(text:string,role='',action?:string):StyledSegment=>({text,roles:role.split(' ').filter(Boolean),...(action?{action,element:action}:{})});
const blank:StyledRow=[S('')];
const rowWidth=(row:StyledRow)=>displayWidth(row.map(segment=>segment.text).join(''));
/* rows of the page: the mockup's 26, 16 and 12 are window rows, six more */
const MEDAL_FROM={columns:64,rows:20},RIGHT_COLUMN_FROM=100,STATE_FROM=80,SENTENCE_FROM=60,HEAD_FROM=10,LIST_FROM=6,AIR_FROM=14;

function wrapWords(text:string,width:number){
  const lines:string[]=[];let line='';
  for(const word of text.split(' ')){const next=line?`${line} ${word}`:word;if(displayWidth(next)>width&&line){lines.push(line);line=word;}else line=next;}
  return line?[...lines,line]:lines;
}
function headText(width:number){
  const room=Math.max(10,width-2);
  return[
    [S(truncateDisplay(t('screen.home.title'),room),'acc b')],
    ...(width>=SENTENCE_FROM?wrapWords(t('screen.home.sentence'),room).map(line=>[S(line,'dim')] as StyledRow):[]),
    blank,
    [S(` ${t('screen.home.openProject')} `,'pill','open:new'),S('  alt+o','acc','open:new')],
    blank,
    [S(truncateDisplay(t('screen.home.nothingStarts'),room),'faint')],
  ] as StyledRow[];
}
function sessionRow(session:HomeSession,input:HomeInput,width:number):StyledRow{
  const action=`session:${session.id}`,[sign,signRole]=sessionMark(session.state,input);
  const tail=[...(input.width>=STATE_FROM?[sessionStateText(session.state)]:[]),...(session.when?[session.when]:[])].join(' · ');
  const title=truncateDisplay(session.title,Math.max(6,width-displayWidth(tail)-7));
  return[S('  '),S(`${sign} `,signRole,action),S(title,'',action),S(' '.repeat(Math.max(2,width-displayWidth(tail)-displayWidth(title)-5))),S(tail,'faint',action)];
}
function listRows(input:HomeInput,width:number,room:number):StyledRow[]{
  const rows:StyledRow[]=[[S(t('screen.home.pickUp'),'b'),S('  alt+h','acc','open:home')]];
  if(input.sessions===null)return[...rows,loadingRow(t('screen.loading.sessions'),input.loadingMs,{now:input.now,motion:input.motion})];
  if(!input.sessions.length)return[...rows,...wrapWords(t('screen.home.empty'),Math.max(10,width-3)).map(line=>[S(`  ${line}`,'dim')] as StyledRow)];
  const shown=input.sessions.slice(0,Math.max(1,room-2));
  return[...rows,...shown.map(session=>sessionRow(session,input,width)),[S('  '),S(t('screen.home.allSessions'),'dim','open:resume')]];
}
function agentRows(input:HomeInput,width:number):StyledRow[]{
  const room=Math.max(10,width);
  return[
    [S(t('screen.home.nextRequest'),'faint')],
    [S(t('screen.home.yourAgent'),'b')],
    input.model?[S(truncateDisplay(input.model,room),'acc'),...(input.provider?[S(`  ${input.provider}`,'faint')]:[])]:[S(t('screen.welcome.noModel'),'warn','open:provider')],
    ...wrapWords(t('screen.home.modelNote'),room).map(line=>[S(line,'dim')] as StyledRow),
  ];
}

export const homeSign=(state:SessionState,input:{glyph:string;unicode:boolean})=>sessionMark(state,input)[0];

export function homeRows(input:HomeInput):StyledRow[]{
  const {width,height,workspace}=input;
  if(height<LIST_FROM)return[[S(truncateMiddle(workspace,Math.max(8,width-2)),'dim')]];
  const rows:StyledRow[]=height>=AIR_FROM?[blank]:[];
  if(height>=HEAD_FROM){
    const medal=width>=MEDAL_FROM.columns&&height>=MEDAL_FROM.rows&&input.medal?input.medal():null;
    if(medal){
      const side=headText(width-24),top=Math.max(0,Math.floor((medal.length-side.length)/2));
      medal.forEach((row,index)=>{const beside=side[index-top];rows.push(beside?[S('  '),...row,S(' '.repeat(Math.max(1,22-rowWidth(row)))),...beside]:[S('  '),...row]);});
    }else rows.push(...headText(width).map(row=>[S('  '),...row]));
    rows.push(blank);
  }
  const room=Math.max(2,height-rows.length-1);
  if(width<RIGHT_COLUMN_FROM)return[...rows,...listRows(input,width-2,room).map(row=>[S(' '),...row])];
  const left=Math.floor(width*.55),list=listRows(input,left-2,room),agent=agentRows(input,width-left-4);
  for(let index=0;index<Math.max(list.length,agent.length);index+=1){
    const row=list[index]??[];
    rows.push([S(' '),...row,S(' '.repeat(Math.max(1,left-1-rowWidth(row)))),S(input.unicode?'│ ':'| ','faint'),...(agent[index]??[])]);
  }
  return rows.slice(0,height);
}
