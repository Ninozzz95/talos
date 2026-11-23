import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiTheme,themeColor} from '../../src/tui/theme.ts';

const colorCaps={interactive:true,color:true,motion:true,unicode:true} as const;
const monoCaps={interactive:true,color:false,motion:false,unicode:false} as const;

test('one theme maps every TUI surface to a semantic color when color is enabled',()=>{
  const theme=createTuiTheme(colorCaps);
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(themeColor(theme,'boot'),'#c98b32');
  assert.equal(themeColor(theme,'transcript'),'#c98b32');
  assert.equal(themeColor(theme,'picker'),'#c98b32');
  // M2-C (453ed1db5) moved the semantic tokens to the TALOS hex palette; each surface still maps to its token.
  assert.equal(themeColor(theme,'approval'),theme.colors.warning);
  /* Stage 7 (the approved mockup's palette, theme-catalog.ts `themePalette`): ok #7ccf8a, warn #e3b341, and the chrome's dim
     is the mockup's neutral dim (the text 40% toward the background), #908d89 on Forge at 6.0:1 — no longer the accent mixed
     into the background (#a0702b, UI Phase 0 D3), which the mockup does not use. */
  assert.equal(themeColor(theme,'approval'),'#e3b341');
  assert.equal(themeColor(theme,'tool'),theme.colors.success);
  assert.equal(themeColor(theme,'tool'),'#7ccf8a');
  assert.equal(themeColor(theme,'footer'),'#908d89');
});

test('no-color keeps semantic surfaces but removes all surface colors',()=>{
  const theme=createTuiTheme(monoCaps);
  for(const surface of ['boot','transcript','picker','approval','tool','footer'] as const)assert.equal(themeColor(theme,surface),undefined);
  assert.deepEqual(theme.glyphs.spinner,['-','\\','|','/']);
});


test('M2-C theme uses the default (Forge since 0.2.0, P15) and a dark background only when color is active',()=>{
  const full=createTuiTheme(colorCaps);
  assert.equal(full.id,'forge');
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(full.colors.accent,'#c98b32');
  assert.equal(full.colors.background,'#080b11');
  const mono=createTuiTheme(monoCaps);
  assert.equal(mono.colors.background,undefined);
});


test('M2-E named accent selection changes semantic palette while mono capabilities remain colorless',()=>{
  const ember=createTuiTheme(colorCaps,'ember' as any);
  assert.equal(ember.id,'ember');
  /* R5b D4 (owner decision Q-R5-14): the product's ten dark themes and their own backgrounds; config v2. */
  assert.equal(ember.colors.accent,'#ff5c62');
  assert.equal(ember.colors.background,'#10090a');
  const mono=createTuiTheme(monoCaps,'ember' as any);
  assert.equal(mono.id,'ember');
  assert.equal(mono.colors.accent,undefined);
  assert.equal(mono.colors.background,undefined);
});
