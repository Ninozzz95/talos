/*
 * ⭐⭐⭐ PO-26, parte 2 (decisione owner 24/09/2026 sera): la configurazione scritta dalla persona si legge da `.talos/` E dai
 * nomi vecchi nella radice del progetto, che non si spostano mai. `.talos/` vince su una voce con lo stesso id; una voce
 * che sta solo nel nome vecchio resta attiva (Claude Code ha smesso di leggere `~/.claude.json` e i server sparivano in
 * silenzio: anthropics/claude-code #15797, #32398). `.talos/` è controllo per intero, come `.claude/`.
 * Ricerca: `.claude/RICERCA-PO26-NOMI-E-CONFIGURAZIONE-2026-09-24.md`.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { caricaHooks } from '../src/hook-registry.mjs';
import { caricaServerMcp } from '../src/mcp-registry.mjs';
import { ePercorsoDiControllo } from '../src/path-policy.mjs';
import { caricaPlugin, improntaPacchettoPlugin } from '../src/plugin-registry.mjs';
import { caricaSkill } from '../src/skill-registry.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

function scrivi(cartella, relativo, contenuto) {
  const pieno = join(cartella, ...relativo.split('/'));
  mkdirSync(join(pieno, '..'), { recursive: true });
  writeFileSync(pieno, typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto));
}
const hook = (id, comando) => ({ id, eventi: ['session_start'], comando });
const server = (id, comando) => ({ id, comando, allowlist: ['leggi'] });
const skill = (nome) => `---\nname: ${nome}\ndescription: skill ${nome}\n---\nCorpo di ${nome}.`;
const manifesto = (nome) => ({ nome, descrizione: `plugin ${nome}`, hooks: [], tools: [] });

test('CONFIG-HOOKS-BOTH: gli hook si leggono da `.talos/hooks.json` e dal nome vecchio; stesso id ⇒ vince `.talos/`', async () => {
  const c = cartellaDiProva('talos-config-');
  scrivi(c, '.talos/hooks.json', { hooks: [hook('comune', 'echo nuovo'), hook('solo-nuovo', 'echo a')] });
  scrivi(c, '.harness-ui-hooks.json', { hooks: [hook('comune', 'echo vecchio'), hook('solo-vecchio', 'echo b')] });
  const { hooks } = await caricaHooks({ cartella: c });
  assert.deepEqual(hooks.map((h) => [h.id, h.comando]), [['comune', 'echo nuovo'], ['solo-nuovo', 'echo a'], ['solo-vecchio', 'echo b']]);
});

test('CONFIG-HOOKS-LEGACY-ONLY: al contrario, un progetto che ha solo il nome vecchio continua a funzionare, e un file rotto in `.talos/` si dichiara col suo nome', async () => {
  const c = cartellaDiProva('talos-config-');
  scrivi(c, '.harness-ui-hooks.json', { hooks: [hook('vecchio', 'echo v')] });
  assert.deepEqual((await caricaHooks({ cartella: c })).hooks.map((h) => h.id), ['vecchio']);
  scrivi(c, '.talos/hooks.json', '{ non è json');
  await assert.rejects(caricaHooks({ cartella: c }), /\.talos\/hooks\.json is not valid JSON/u);
});

test('CONFIG-MCP-BOTH: i server MCP si leggono dalle due posizioni; stesso id ⇒ vince `.talos/`', async () => {
  const c = cartellaDiProva('talos-config-');
  scrivi(c, '.talos/mcp.json', { server: [server('fs', 'node nuovo.js')] });
  scrivi(c, '.harness-ui-mcp.json', { server: [server('fs', 'node vecchio.js'), server('git', 'node git.js')] });
  const { server: letti } = await caricaServerMcp({ cartella: c });
  assert.deepEqual(letti.map((s) => [s.id, s.comando]), [['fs', 'node nuovo.js'], ['git', 'node git.js']]);
});

test('CONFIG-SKILLS-BOTH: le skill si leggono da `.talos/skills/` e da `.harness-ui-skills/`; stesso id ⇒ vince `.talos/`', async () => {
  const c = cartellaDiProva('talos-config-');
  scrivi(c, '.talos/skills/revisione/SKILL.md', skill('revisione-nuova'));
  scrivi(c, '.harness-ui-skills/revisione/SKILL.md', skill('revisione-vecchia'));
  scrivi(c, '.harness-ui-skills/rilascio/SKILL.md', skill('rilascio'));
  const { skills } = await caricaSkill({ cartella: c });
  assert.deepEqual(skills.map((s) => [s.id, s.name]), [['revisione', 'revisione-nuova'], ['rilascio', 'rilascio']]);
});

test('CONFIG-PLUGINS-BOTH: i plugin si leggono dalle due posizioni, e l’impronta al momento dell’uso guarda lo STESSO pacchetto', async () => {
  const c = cartellaDiProva('talos-config-');
  scrivi(c, '.talos/plugins/demo/plugin.json', manifesto('demo-nuovo'));
  scrivi(c, '.harness-ui-plugins/demo/plugin.json', manifesto('demo-vecchio'));
  scrivi(c, '.harness-ui-plugins/solo-vecchio/plugin.json', manifesto('solo-vecchio'));
  const { plugin, falliti } = await caricaPlugin({ cartella: c });
  assert.deepEqual(falliti, []);
  assert.deepEqual(plugin.map((p) => [p.id, p.nome]), [['demo', 'demo-nuovo'], ['solo-vecchio', 'solo-vecchio']]);
  const demo = plugin.find((p) => p.id === 'demo');
  assert.equal(await improntaPacchettoPlugin({ cartella: c, pluginId: 'demo' }), demo.hash, 'la riverifica all’uso legge il pacchetto di `.talos/`, non quello vecchio');
  const vecchio = plugin.find((p) => p.id === 'solo-vecchio');
  assert.equal(await improntaPacchettoPlugin({ cartella: c, pluginId: 'solo-vecchio' }), vecchio.hash);
});

test('CONFIG-TALOS-IS-CONTROL: `.talos/` è un file di controllo a qualunque profondità; al contrario un file che si chiama «talos» no', () => {
  const c = cartellaDiProva('talos-config-');
  assert.equal(ePercorsoDiControllo(c, '.talos/hooks.json'), true);
  assert.equal(ePercorsoDiControllo(c, '.talos/skills/x/SKILL.md'), true);
  assert.equal(ePercorsoDiControllo(c, 'src/talos.js'), false);
  assert.equal(ePercorsoDiControllo(c, 'talos/nota.md'), false);
});
