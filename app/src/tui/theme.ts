import type {TerminalCapabilities} from './terminal-capabilities.ts';
import {DEFAULT_THEME_ACCENT,themeAccent,type ThemeAccentId} from './theme-catalog.ts';

export type TuiTheme={
  id:ThemeAccentId;
  colors:{background?:string;foreground?:string;accent?:string;muted?:string;success?:string;warning?:string;danger?:string};
  glyphs:{spinner:readonly string[];success:string;error:string;branch:string;bullet:string};
};

export function createTuiTheme(c:TerminalCapabilities,accentId:ThemeAccentId=DEFAULT_THEME_ACCENT):TuiTheme{
  const accent=themeAccent(accentId);
  return{
    id:accent.id,
    colors:c.color?{
      background:accent.background,
      foreground:'#F5F5F4',
      accent:accent.accent,
      muted:accent.muted,
      success:'#34D399',
      warning:'#FBBF24',
      danger:'#FB7185',
    }:{},
    glyphs:c.unicode
      ?{spinner:['⠋','⠙','⠹','⠸'],success:'✓',error:'!',branch:'├',bullet:'•'}
      :{spinner:['-','\\','|','/'],success:'OK',error:'!',branch:'+',bullet:'*'},
  };
}

export type ThemeSurface='boot'|'transcript'|'picker'|'approval'|'tool'|'footer';
const SURFACE_COLOR:Record<ThemeSurface,keyof TuiTheme['colors']>={
  boot:'accent',transcript:'accent',picker:'accent',approval:'warning',tool:'success',footer:'muted',
};
export function themeColor(theme:TuiTheme,surface:ThemeSurface):string|undefined{return theme.colors[SURFACE_COLOR[surface]];}
