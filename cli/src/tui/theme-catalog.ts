/*
 * R5b D4 (owner decision Q-R5-14, gate E10): the product's ten DARK themes, the same seeds as the desktop and the mobile
 * (harness-ui/frontend/src/styles/temi.css `--talos-seme-accento` / `--talos-seme-fondo`, aligned to the mobile on 11/09;
 * r5b-themes.test.ts reads the CSS and compares). Forge (#c98b32 on #080b11) is the default since 0.2.0 (P15); Calm was. Before R5b the CLI had ten
 * accents of its own that no other TALOS surface has; their ids move to the nearest official theme in config v2
 * (config/migrations.ts). The light themes of the product (paper, glacier, claudius, basicus) are not here: the owner
 * decided no light theme for the CLI. `muted` is the accent mixed into the background, as the product's `color-mix` does.
 */
export type ThemeAccentId='calm'|'forge'|'terminal'|'aurora'|'ember'|'atlas'|'noir'|'signal'|'violet'|'telemetry';
export type ThemeAccent={id:ThemeAccentId;label:string;accent:string;muted:string;background:string};

/** `color-mix(in srgb, a amount%, b)` for #rrggbb. */
export function mixHex(a:string,amount:number,b:string):string{
  const parse=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [x,y]=[parse(a),parse(b)];const t=Math.max(0,Math.min(100,amount))/100;
  return `#${x.map((v,i)=>Math.round(v*t+y[i]!*(1-t)).toString(16).padStart(2,'0')).join('')}`;
}
/** WCAG 2.x contrast ratio of two #rrggbb colours (relative luminance, sRGB). */
export function contrastRatio(a:string,b:string):number{
  const luminance=(hex:string)=>{const [r,g,bl]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*r!+0.7152*g!+0.0722*bl!;};
  const [high,low]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (high!+0.05)/(low!+0.05);
}
/* UI Phase 0 D3 (dim text reads at 4.5:1) lives on in `themePalette`'s faint; the accent-tinted dim it raised is gone with
   stage 7 (the mockup's dim is neutral and reads at 5.5:1 or more). */
const theme=(id:ThemeAccentId,label:string,accent:string,background:string):ThemeAccent=>({id,label,accent,background,muted:mixHex(accent,62,background)});

/*
 * Stage 7 (owner 01/10: the approved mockup to the letter; registro 12). The mockup derives every colour of a theme from its
 * two seeds (`themeVars`, MOCKUP-FASE-UI-2026-10-01.html:117): a warm text, neutral dim and faint text taken toward the
 * background, the bands, code and panel surfaces, the border, the highlight and selection, and the tinted backgrounds of
 * added, removed and warning rows. OpenCode's themes name the same surfaces (`textMuted`, `backgroundPanel`, `border`,
 * `diffAddedBg`). The one owner change (02/10, «Faint alzato a 4,5:1», D3): faint keeps the mockup's tint and moves toward
 * the text one step at a time only until it reads at 4.5:1.
 */
export type ThemePalette={background:string;foreground:string;dim:string;faint:string;accent:string;ok:string;warn:string;err:string;
  band:string;code:string;panel:string;border:string;highlight:string;selection:string;addBackground:string;delBackground:string;warnBackground:string;
  /* B1 of the redesign: the six series of the charts (the mockup's `s1`…`s6`) */
  s1:string;s2:string;s3:string;s4:string;s5:string;s6:string};
/** The mockup's `mix(a, b, t)`: from `a`, the fraction `t` of the way to `b`. */
const toward=(a:string,b:string,t:number)=>mixHex(b,t*100,a);
export function themePalette(seed:Pick<ThemeAccent,'accent'|'background'>,floor=4.5):ThemePalette{
  const {accent,background}=seed,foreground=toward('#ece9e2',accent,0.05);
  let step=62,faint=toward(foreground,background,0.62);
  while(step>0&&contrastRatio(faint,background)<floor)faint=toward(foreground,background,--step/100);
  const ok='#7ccf8a',warn='#e3b341',err='#f07a7a';
  const dim=toward(foreground,background,0.40);
  return{background,foreground,dim,faint,accent,ok,warn,err,
    s1:accent,s2:foreground,s3:toward(accent,background,0.5),s4:dim,s5:toward(accent,foreground,0.55),s6:toward(foreground,background,0.68),
    band:toward(background,foreground,0.07),code:toward(background,foreground,0.05),panel:toward(background,foreground,0.06),border:toward(background,foreground,0.2),
    highlight:toward(background,accent,0.42),selection:toward('#000000',accent,0.5),
    addBackground:toward(background,ok,0.12),delBackground:toward(background,err,0.12),warnBackground:toward(background,warn,0.12)};
}

/* P15 (owner, 2026-09-25, "vorrei mettere forge come tema principale di default"): Forge is the default from 0.2.0. A theme
   the person chose stays theirs (it is in their configuration); the legacy migrations keep mapping to what they mapped to. */
export const DEFAULT_THEME_ACCENT:ThemeAccentId='forge';
export const TALOS_THEME_ACCENTS:ReadonlyArray<ThemeAccent>=Object.freeze([
  theme('calm','Calm','#c08b3c','#1e1f22'),
  theme('forge','Forge','#c98b32','#080b11'),
  theme('terminal','Terminal','#63f08e','#020403'),
  theme('aurora','Aurora','#42e7c7','#071113'),
  theme('ember','Ember','#ff5c62','#10090a'),
  theme('atlas','Atlas','#d49a52','#07101f'),
  theme('noir','Noir','#f2f2f2','#050505'),
  theme('signal','Signal','#ff6f61','#091011'),
  theme('violet','Violet','#b794f6','#0d0a19'),
  theme('telemetry','Telemetry','#6ad4d4','#0b0f11'),
]);

export function isThemeAccentId(id:unknown):id is ThemeAccentId{return TALOS_THEME_ACCENTS.some(row=>row.id===id);}
export function themeAccent(id:string|undefined|null):ThemeAccent{
  return TALOS_THEME_ACCENTS.find(row=>row.id===id)??TALOS_THEME_ACCENTS.find(row=>row.id===DEFAULT_THEME_ACCENT)!;
}
