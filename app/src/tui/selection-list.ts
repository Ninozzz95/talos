export type SelectItem<T>={id:string;label:string;searchText:string;group?:string;value:T};
export type SelectionState={query:string;selected:number;pageSize:number};

function score(text:string,query:string){
  const t=text.toLowerCase(),q=query.toLowerCase();if(!q)return 0;
  if(t.startsWith(q))return 3000-q.length;
  if(t.includes(q))return 2000-t.indexOf(q);
  let at=0,gaps=0;for(const ch of q){const next=t.indexOf(ch,at);if(next<0)return-1;gaps+=next-at;at=next+1;}return 1000-gaps;
}

export function filterItems<T>(items:readonly SelectItem<T>[],query:string):SelectItem<T>[] {
  return items.map(item=>({item,score:score(item.searchText,query)})).filter(x=>x.score>=0)
    .sort((a,b)=>b.score-a.score||(a.item.group??'').localeCompare(b.item.group??'')||a.item.label.localeCompare(b.item.label)||a.item.id.localeCompare(b.item.id))
    .map(x=>x.item);
}

export function moveSelection(state:SelectionState,count:number,action:'up'|'down'|'page-up'|'page-down'|'home'|'end'):SelectionState{
  const max=Math.max(0,count-1);const delta=action==='up'?-1:action==='down'?1:action==='page-up'?-state.pageSize:action==='page-down'?state.pageSize:0;
  const selected=action==='home'?0:action==='end'?max:Math.max(0,Math.min(max,state.selected+delta));return{...state,selected};
}
