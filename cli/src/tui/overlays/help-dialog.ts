import {t} from '../../i18n/index.ts';
import {KEYBINDINGS,keybindingHelp,type Keybinding} from '../keybindings.ts';
import {slashCommandHelp} from '../slash-commands.ts';
import type {OverlayContent} from './scroll-window.ts';

/* R2 (Q-R2-1, gate E1): the headings are dictionary words; the per-locale copy table this file kept is the dictionary now. */
export function helpDialogText(keymap:ReadonlyArray<Keybinding>=KEYBINDINGS){
  return t('screen.help.commands')+'\n'+slashCommandHelp()+'\n\n'+t('screen.help.keyboard')+'\n'+keybindingHelp(keymap);
}

// R1 D-02 / Q-R1-3: the help is a text body that scrolls by `offset` (a line index) inside the budget; the title and the
// way out never scroll away. Measured before R1: 125 rows at 100 columns, drawn in one Text that Ink wrapped at will.
export function helpDialogOverlay(keymap:ReadonlyArray<Keybinding>=KEYBINDINGS,{offset=0}:{offset?:number}={}):OverlayContent{
  return{
    head:[{text:t('screen.help.title'),tone:'title'}],
    sections:[{lines:helpDialogText(keymap).split('\n').map(text=>({text,tone:'plain' as const})),offset}],
    foot:[{text:t('screen.help.close'),tone:'dim'}],
  };
}
