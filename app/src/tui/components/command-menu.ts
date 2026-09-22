import {SLASH_COMMANDS,type SlashCommand} from '../slash-commands.ts';
import {filterItems} from '../selection-list.ts';

export function commandMenuItems(input:string):Array<{command:SlashCommand;score:number}>{
  const query=input.trim().replace(/^\//u,'');
  const items=SLASH_COMMANDS.map(command=>({id:command.name,label:command.name,searchText:`${command.name} ${command.description}`,value:command}));
  return filterItems(items,query).map((item,index)=>({command:item.value,score:items.length-index}));
}
export function completeCommandSelection(command:SlashCommand){return `/${command.name} `;}
