import {KEYBINDINGS,keybindingHelp,type Keybinding} from '../keybindings.ts';
import {slashCommandHelp,type HelpLocale} from '../slash-commands.ts';

export const HELP_DIALOG_COPY:Readonly<Record<HelpLocale,{commands:string;keyboard:string}>>=Object.freeze({
  en:Object.freeze({commands:'Commands',keyboard:'Keyboard'}),
});

export function helpDialogText(keymap:ReadonlyArray<Keybinding>=KEYBINDINGS,locale:HelpLocale='en'){
  const copy=HELP_DIALOG_COPY[locale]??HELP_DIALOG_COPY.en;
  return copy.commands+'\n'+slashCommandHelp(locale)+'\n\n'+copy.keyboard+'\n'+keybindingHelp(keymap);
}
