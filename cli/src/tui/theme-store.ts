/*
 * R5b D4 (owner decision Q-R5-14): the theme is live. One small store holds the theme in use; the app and the painted
 * background (run.ts) read it through useSyncExternalStore, so /theme previews a theme as the arrows move and puts the
 * old one back on Esc, without a restart. Before R5b the theme was read once at startup. `mono` is the no-colour theme:
 * no colour and no motion, as run.ts has always derived it; a terminal without colour stays without colour whatever the
 * theme.
 */
import type {UiTheme} from '../config/types.ts';
import type {TerminalCapabilities} from './terminal-capabilities.ts';
import {createTuiTheme,type TuiTheme} from './theme.ts';
import {DEFAULT_THEME_ACCENT,TALOS_THEME_ACCENTS,isThemeAccentId} from './theme-catalog.ts';

export type LiveTheme={id:UiTheme;theme:TuiTheme;capabilities:TerminalCapabilities};
export type ThemeStore={getSnapshot():LiveTheme;subscribe(listener:()=>void):()=>void;set(id:UiTheme):void};

/** What /theme offers, in the product's order, mono last. */
export const THEME_CHOICES:readonly UiTheme[]=Object.freeze([...TALOS_THEME_ACCENTS.map(row=>row.id),'mono']);
export function parseThemeChoice(value:unknown):UiTheme|null{
  const id=typeof value==='string'?value.trim().toLowerCase():'';
  return (THEME_CHOICES as readonly string[]).includes(id)?id as UiTheme:null;
}

export function liveTheme(base:TerminalCapabilities,id:UiTheme):LiveTheme{
  const capabilities=id==='mono'?{...base,color:false,motion:false}:base;
  return{id,capabilities,theme:createTuiTheme(capabilities,isThemeAccentId(id)?id:DEFAULT_THEME_ACCENT)};
}

export function createThemeStore(base:TerminalCapabilities,id:UiTheme=DEFAULT_THEME_ACCENT):ThemeStore{
  let snapshot=liveTheme(base,id);const listeners=new Set<()=>void>();
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    set(next){if(next===snapshot.id)return;snapshot=liveTheme(base,next);for(const listener of [...listeners])listener();},
  };
}
