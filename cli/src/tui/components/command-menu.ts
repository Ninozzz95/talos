import {t} from '../../i18n/index.ts';
import {SLASH_COMMANDS,SLASH_GROUPS,slashCommandGroup,slashCommandHelpRank,type SlashCommand} from '../slash-commands.ts';
import {filterItems,moveSelection,type SelectionState} from '../selection-list.ts';
import {pickerSection,type OverlayContent,type OverlayLine} from '../overlays/scroll-window.ts';

function commandQuery(input:string){return input.trim().replace(/^\//u,'');}
export function commandMenuItems(input:string):Array<{command:SlashCommand;score:number}>{
  const query=commandQuery(input);
  const items=SLASH_COMMANDS.map(command=>({id:command.name,label:command.name,searchText:`${command.name} ${command.description}`,value:command}));
  /* stage 8 C3 (mockup paletteList): with no query the palette is the catalogue in the mockup's order (HELP_ORDER),
     not the fuzzy-then-alphabetical ranking; a typed query keeps the existing fuzzy filter. */
  if(!query)return [...items].sort((a,b)=>slashCommandHelpRank(a.value.name)-slashCommandHelpRank(b.value.name)).map((item,index)=>({command:item.value,score:items.length-index}));
  return filterItems(items,query).map((item,index)=>({command:item.value,score:items.length-index}));
}
export function completeCommandSelection(command:SlashCommand){return `/${command.name} `;}

/* R4 lane N — the menu's selection: `moved` is true once the person has chosen a row with the arrows. */
export type CommandMenuSelection=SelectionState&{moved?:boolean};
/*
 * R4 Q-R4-5 / gate E6: which row Enter runs, or -1 for none. The top row is highlighted while the typed text is the start
 * of its name (`/mo` → /model; `/` alone → the first row); a row the person moved to stays highlighted. After a typo (a
 * fuzzy match only) or once arguments are typed nothing is highlighted, so Enter sends the text as typed and the existing
 * "Did you mean" answer appears (Claude Code "Commands" :171-173, 2.1.269 → 2026-09-11, gate B.1).
 */
export function commandMenuHighlight(input:string,selection:CommandMenuSelection):number{
  const rows=commandMenuItems(input);if(!rows.length)return -1;
  if(selection.moved)return Math.max(0,Math.min(rows.length-1,Math.trunc(selection.selected)||0));
  const query=commandQuery(input);
  return rows[0]!.command.name.startsWith(query)?0:-1;
}

export type CommandMenuSelectionMove=Parameters<typeof moveSelection>[2];
export type CommandMenuSelectionStore={
  getSnapshot:()=>CommandMenuSelection;
  subscribe:(listener:()=>void)=>(()=>void);
  reset:()=>CommandMenuSelection;
  move:(count:number,action:CommandMenuSelectionMove)=>CommandMenuSelection;
  /** Highlights `index` as if the person had moved there (the first arrow key after a typo lands on the top row). */
  highlight:(index:number)=>CommandMenuSelection;
};

const initialCommandMenuSelection=():CommandMenuSelection=>({query:'',selected:0,pageSize:10,moved:false});

export function createCommandMenuSelectionStore():CommandMenuSelectionStore{
  let snapshot=initialCommandMenuSelection();
  const listeners=new Set<()=>void>();
  const publish=(next:CommandMenuSelection)=>{
    if(next.query===snapshot.query&&next.selected===snapshot.selected&&next.pageSize===snapshot.pageSize&&Boolean(next.moved)===Boolean(snapshot.moved))return snapshot;
    snapshot=next;
    for(const listener of [...listeners])listener();
    return snapshot;
  };
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    reset(){return publish(initialCommandMenuSelection());},
    move(count,action){return publish({...moveSelection(snapshot,count,action),moved:true});},
    highlight(index){return publish({...snapshot,selected:Math.max(0,Math.trunc(index)||0),moved:true});},
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

// R1 Q-R1-3: the slash-command menu as app.ts draws it (single border), capped to lane L's `maxRows` and scrolled
// around the selection by overlays/scroll-window.ts. R4: `selected` is the highlight (-1: none, see commandMenuHighlight);
// an empty menu says so and what Enter will do (Q-R4-13; Claude Code `No commands match "/name"`, gate §5.2).
export function commandMenuOverlay({text,selected}:{text:string;selected:number}):OverlayContent{
  const head:OverlayLine[]=[{text:t('screen.help.commands'),tone:'strong'}];
  const rows=commandMenuItems(text);
  if(!rows.length)return{
    head,
    sections:[{lines:[{text:t('screen.commands.none',{query:commandQuery(text)}),tone:'dim'}]}],
    borderStyle:'single',
  };
  /* stage 8 C3 (mockup paletteList t0): with no query the palette is the catalogue — the five group headers, then each
     command in the mockup's order, the name column padded so the descriptions align in one column, the usage shown on
     the highlighted row; a click still accepts the suggestion (stage 6c, `slash:/name`). A typed query keeps the flat
     fuzzy list. */
  if(!commandQuery(text)){
    const lines:OverlayLine[]=[];let flat=0;let chosen:number|undefined;
    for(const group of SLASH_GROUPS){
      const groupRows=rows.filter(row=>slashCommandGroup(row.command.name)===group);
      if(!groupRows.length)continue;
      lines.push({text:t(`screen.help.group.${group}`),tone:'strong'});
      for(const row of groupRows){
        const highlighted=flat===selected;
        lines.push({text:`${highlighted?'›':' '} ${('/'+row.command.name).padEnd(14)}${row.command.description}${highlighted&&row.command.usage?`  ${row.command.usage}`:''}`,tone:highlighted?'selected':'accent',action:`slash:/${row.command.name}`});
        if(highlighted)chosen=lines.length-1;
        flat++;
      }
    }
    return{head,sections:[{lines,selected:chosen}],borderStyle:'single'};
  }
  return{
    head,
    sections:[pickerSection(rows,selected,row=>`/${row.command.name} · ${row.command.description}`,row=>`slash:/${row.command.name}`)],
    borderStyle:'single',
  };
}
