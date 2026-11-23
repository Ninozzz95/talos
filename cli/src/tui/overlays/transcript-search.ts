import {t} from '../../i18n/index.ts';
import {transcriptItemRaw,transcriptItemText,type TranscriptItem} from '../transcript-model.ts';
import {listOverlay,type OverlayContent} from './scroll-window.ts';

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
  const header=t('screen.search.header',{mode:state.mode,position,total:matches.length,view:t(raw?'screen.search.viewRaw':'screen.search.viewSemantic')});
  const query=t('screen.search.query',{query:state.query||t('screen.none')});
  if(!selected)return[header,query,state.notice??t('screen.search.none')];
  const item=items[selected.index]!;
  const preview=(raw?transcriptItemRaw(item):transcriptItemText(item)).split(/\r?\n/u).slice(0,10);
  return[header,query,...(state.notice?[state.notice]:[]),t('screen.search.selected',{id:item.id}),...preview];
}

// R1 Q-R1-3: the preview scrolls under the header and the query. The `selected:` row heads the scrolling part as its
// selected line, so a short budget drops the query before it drops the name of the item Enter would jump to.
export function transcriptSearchOverlay(input:{items:readonly TranscriptItem[];state:TranscriptSearchState;raw?:boolean}):OverlayContent{
  const lines=transcriptSearchLines(input),marker=t('screen.search.selected',{id:''}),selected=lines.findIndex(line=>line.startsWith(marker));
  const head=selected<0?2:selected;
  return listOverlay(lines,{head,list:selected<0?0:lines.length-head,selected:0,foot:0,tones:(_line,index)=>index===0?'accent':'dim'});
}
