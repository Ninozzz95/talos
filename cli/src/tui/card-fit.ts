/*
 * D2 of MAPPA-RIDISEGNO (the mockup's `righeCarta`): a card taller than the window keeps its title, its choices and its closing row, and the
 * selected choice is always in view. A choice and its description enter and leave together. What is left over goes to the rest of the
 * body, from the top. The card's rows do not change when they fit, so the golden frames stay as they are.
 */
import type {CardRow} from './question-card-rows.ts';

const textOf=(row:CardRow)=>row.map(segment=>segment.text).join('');
/* a description stands deeper than its choice: past the `│` and the marker of the choice */
const DESCRIPTION_FROM=5;
const indentOf=(row:CardRow)=>{const text=textOf(row).replace(/^│/u,'');return text.length-text.trimStart().length;};

export function fitCardRows(rows:readonly CardRow[],height:number):CardRow[]{
  if(rows.length<=height||height<3)return[...rows];
  const last=rows.length-1;const keep=new Set([0,last]);
  /* the choices, each with the rows that belong to it */
  const groups:number[][]=[];
  rows.forEach((row,index)=>{
    if(index===0||index===last)return;
    if(row.some(segment=>segment.action))groups.push([index]);
    else if(groups.length&&groups.at(-1)!.at(-1)===index-1&&textOf(row).trim()!=='│'&&indentOf(row)>=DESCRIPTION_FROM)groups.at(-1)!.push(index);
  });
  let room=height-2;
  const take=(group:readonly number[])=>{for(const index of group)keep.add(index);room-=group.length;};
  const fits=(group:readonly number[]|undefined)=>group!==undefined&&group.length<=room;
  const selected=Math.max(0,groups.findIndex(group=>textOf(rows[group[0]!]!).includes(' › ')));
  if(groups[selected]){
    /* the selected choice comes first, cut to its own row if even that is too tall */
    const own=groups[selected];take(own.length<=room?own:own.slice(0,1));
    for(let step=1,open=true;open;step+=1){
      open=false;
      if(fits(groups[selected+step])){take(groups[selected+step]!);open=true;}
      if(fits(groups[selected-step])){take(groups[selected-step]!);open=true;}
    }
  }
  const chosen=new Set(groups.flat());
  for(let index=1;index<last&&room>0;index+=1)if(!keep.has(index)&&!chosen.has(index)){keep.add(index);room-=1;}
  return rows.filter((_,index)=>keep.has(index));
}
