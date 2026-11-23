import type {TerminalCapabilities} from './terminal-capabilities.ts';
import {DEFAULT_THEME_ACCENT,themeAccent,themePalette,type ThemeAccentId} from './theme-catalog.ts';

export type TuiTheme={
  id:ThemeAccentId;
  /* stage 7: the mockup's palette (theme-catalog.ts `themePalette`); `muted` is its dim */
  colors:{background?:string;foreground?:string;accent?:string;muted?:string;faint?:string;success?:string;warning?:string;danger?:string;
    band?:string;code?:string;panel?:string;border?:string;highlight?:string;selection?:string;addBackground?:string;delBackground?:string;warnBackground?:string;
    s1?:string;s2?:string;s3?:string;s4?:string;s5?:string;s6?:string};
  glyphs:{spinner:readonly string[];success:string;error:string;branch:string;bullet:string};
};

export function createTuiTheme(c:TerminalCapabilities,accentId:ThemeAccentId=DEFAULT_THEME_ACCENT):TuiTheme{
  const accent=themeAccent(accentId);const p=themePalette(accent);
  return{
    id:accent.id,
    /* stage 7: the approved mockup's palette, derived from the two seeds; dim and faint read at 4.5:1 or more (D3, owner 02/10) */
    colors:c.color?{
      background:p.background,foreground:p.foreground,accent:p.accent,muted:p.dim,faint:p.faint,
      success:p.ok,warning:p.warn,danger:p.err,
      band:p.band,code:p.code,panel:p.panel,border:p.border,highlight:p.highlight,selection:p.selection,
      addBackground:p.addBackground,delBackground:p.delBackground,warnBackground:p.warnBackground,
      s1:p.s1,s2:p.s2,s3:p.s3,s4:p.s4,s5:p.s5,s6:p.s6,
    }:{},
    glyphs:c.unicode
      ?{spinner:['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'],success:'✓',error:'!',branch:'├',bullet:'•'}
      :{spinner:['-','\\','|','/'],success:'OK',error:'!',branch:'+',bullet:'*'},
  };
}

export type ThemeSurface='boot'|'transcript'|'picker'|'approval'|'tool'|'footer';
const SURFACE_COLOR:Record<ThemeSurface,keyof TuiTheme['colors']>={
  boot:'accent',transcript:'accent',picker:'accent',approval:'warning',tool:'success',footer:'muted',
};
export function themeColor(theme:TuiTheme,surface:ThemeSurface):string|undefined{return theme.colors[SURFACE_COLOR[surface]];}
