export type ThemeAccentId='calm'|'ember'|'coral'|'rose'|'violet'|'indigo'|'azure'|'cyan'|'teal'|'jade';
export type ThemeAccent={id:ThemeAccentId;label:string;accent:string;muted:string;background:'#0B0D10'};

export const DEFAULT_THEME_ACCENT:ThemeAccentId='calm';
export const TALOS_THEME_ACCENTS:ReadonlyArray<ThemeAccent>=Object.freeze([
  {id:'calm',label:'Calm',accent:'#D4AF37',muted:'#9D7F24',background:'#0B0D10'},
  {id:'ember',label:'Ember',accent:'#F97316',muted:'#A84D0E',background:'#0B0D10'},
  {id:'coral',label:'Coral',accent:'#FB7185',muted:'#A94A59',background:'#0B0D10'},
  {id:'rose',label:'Rose',accent:'#F472B6',muted:'#A44C7D',background:'#0B0D10'},
  {id:'violet',label:'Violet',accent:'#A78BFA',muted:'#715CA8',background:'#0B0D10'},
  {id:'indigo',label:'Indigo',accent:'#818CF8',muted:'#5861A8',background:'#0B0D10'},
  {id:'azure',label:'Azure',accent:'#60A5FA',muted:'#4072AA',background:'#0B0D10'},
  {id:'cyan',label:'Cyan',accent:'#22D3EE',muted:'#188D9F',background:'#0B0D10'},
  {id:'teal',label:'Teal',accent:'#2DD4BF',muted:'#1E8C80',background:'#0B0D10'},
  {id:'jade',label:'Jade',accent:'#34D399',muted:'#238C66',background:'#0B0D10'},
]);

export function themeAccent(id:string|undefined|null):ThemeAccent{
  return TALOS_THEME_ACCENTS.find(row=>row.id===id)??TALOS_THEME_ACCENTS.find(row=>row.id===DEFAULT_THEME_ACCENT)!;
}
