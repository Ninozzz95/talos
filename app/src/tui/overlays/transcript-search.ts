import {transcriptItemRaw,transcriptItemText,type TranscriptItem} from '../transcript-model.ts';

export type TranscriptSearchMode='literal'|'fuzzy';
export type TranscriptSearchState={query:string;mode:TranscriptSearchMode;selectedId:string|null;raw:boolean;notice:string|null};
export type TranscriptSearchMatch={itemId:string;index:number};

export function createTranscriptSearchState(selectedId:string|null=null):TranscriptSearchState{return{query:'',mode:'literal',selectedId,raw:false,notice:null};}

function haystack(item:TranscriptItem){return (item.id+'\n'+item.kind+'\n'+transcriptItemText(item)).toLocaleLowerCase();}
function fuzzyIncludes(text:string,query:string){
  let at=0;
  for(const character of query){at=text.indexOf(character,at);if(at<0)return false;at++;}
  return true;
}
export function transcriptSearchMatches(items:readonly TranscriptItem[],query:string,mode:TranscriptSearchMode):TranscriptSearchMatch[]{
  const needle=String(query??'').trim().toLocaleLowerCase();
  const matches:TranscriptSearchMatch[]=[];
  for(let index=0;index<items.length;index++){
    const item=items[index]!,text=haystack(item);
    if(!needle||(mode==='literal'?text.includes(needle):fuzzyIncludes(text,needle)))matches.push({itemId:item.id,index});
  }
  return matches;
}
export function selectedTranscriptMatch(matches:readonly TranscriptSearchMatch[],selectedId:string|null):TranscriptSearchMatch|null{
  if(matches.length===0)return null;
  return matches.find(row=>row.itemId===selectedId)??matches[0]??null;
}
export function moveTranscriptSearchSelection(matches:readonly TranscriptSearchMatch[],selectedId:string|null,delta:-1|1):string|null{
  if(matches.length===0)return null;
  const index=matches.findIndex(row=>row.itemId===selectedId);
  if(index<0)return matches[0]!.itemId;
  const next=Math.max(0,Math.min(matches.length-1,index+delta));
  return matches[next]!.itemId;
}
export function transcriptSearchLines({items,state,raw=state.raw}:{items:readonly TranscriptItem[];state:TranscriptSearchState;raw?:boolean}):string[]{
  const matches=transcriptSearchMatches(items,state.query,state.mode);
  const selected=selectedTranscriptMatch(matches,state.selectedId);
  const position=selected?matches.findIndex(row=>row.itemId===selected.itemId)+1:0;
  const header='Transcript search · '+state.mode+' · '+position+'/'+matches.length+' matches · '+(raw?'raw':'semantic');
  const query='query: '+(state.query||'—')+' · Tab literal/fuzzy · Alt+R raw · Alt+C copy · Enter jump · Esc close';
  if(!selected)return[header,query,state.notice??'No matches.'];
  const item=items[selected.index]!;
  const preview=(raw?transcriptItemRaw(item):transcriptItemText(item)).split(/\r?\n/u).slice(0,10);
  return[header,query,...(state.notice?[state.notice]:[]),'selected: '+item.id,...preview];
}
