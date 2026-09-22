import {SLASH_COMMANDS,type SlashCommand} from '../slash-commands.ts';
import {filterItems,moveSelection,type SelectionState} from '../selection-list.ts';

export function commandMenuItems(input:string):Array<{command:SlashCommand;score:number}>{
  const query=input.trim().replace(/^\//u,'');
  const items=SLASH_COMMANDS.map(command=>({id:command.name,label:command.name,searchText:`${command.name} ${command.description}`,value:command}));
  return filterItems(items,query).map((item,index)=>({command:item.value,score:items.length-index}));
}
export function completeCommandSelection(command:SlashCommand){return `/${command.name} `;}

export type CommandMenuSelectionMove=Parameters<typeof moveSelection>[2];
export type CommandMenuSelectionStore={
  getSnapshot:()=>SelectionState;
  subscribe:(listener:()=>void)=>(()=>void);
  reset:()=>SelectionState;
  move:(count:number,action:CommandMenuSelectionMove)=>SelectionState;
};

const initialCommandMenuSelection=():SelectionState=>({query:'',selected:0,pageSize:10});

export function createCommandMenuSelectionStore():CommandMenuSelectionStore{
  let snapshot=initialCommandMenuSelection();
  const listeners=new Set<()=>void>();
  const publish=(next:SelectionState)=>{
    if(next.query===snapshot.query&&next.selected===snapshot.selected&&next.pageSize===snapshot.pageSize)return snapshot;
    snapshot=next;
    for(const listener of [...listeners])listener();
    return snapshot;
  };
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    reset(){return publish(initialCommandMenuSelection());},
    move(count,action){return publish(moveSelection(snapshot,count,action));},
  };
}

export type CommandMenuFastTextInput={
  bootPhase:string;
  focus:string;
  modalOwner:boolean;
  key:{ctrl?:boolean;meta?:boolean};
  routed:null|{kind:string;text?:string};
};

export function commandMenuFastTextInput(input:CommandMenuFastTextInput):string|null{
  if(input.bootPhase!=='ready'||input.focus!=='command-menu'||input.modalOwner)return null;
  if(input.key.ctrl||input.key.meta)return null;
  if(input.routed?.kind!=='text'||typeof input.routed.text!=='string'||input.routed.text.length===0)return null;
  return input.routed.text;
}
