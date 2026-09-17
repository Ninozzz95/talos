/** Dependency-free, deterministic browser assembly. Runtime sources remain ordinary modules. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const modules=['shared/theme-contract.mjs','shared/calm-controls.js','shared/desktop-scenes.js','src/appearance-domain.mjs','src/appearance-runtime.mjs','src/catalog-data.mjs','src/catalog-engine.mjs','src/domain.mjs','src/ui.mjs','src/settings.mjs','src/model-page.mjs','src/model-navigation.mjs','src/catalog-controls.mjs','src/model-lab.mjs','src/app.mjs'];
const code=[];
for(const name of modules){const source=await readFile(join(root,name),'utf8');if(/<\/script/i.test(source))throw new Error('Script terminator forbidden: '+name);code.push('// '+name+'\n'+source.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,''));}
const css=(await Promise.all(['shared/theme-tokens.css','src/styles.css','shared/calm-controls.css','src/appearance.css'].map(path=>readFile(join(root,path),'utf8')))).join('\n');
if(/<\/style/i.test(css))throw new Error('Style terminator forbidden');
const template=await readFile(join(root,'src/index.template.html'),'utf8');
await writeFile(join(root,'TALOS-Calm-Lab.html'),template.replace('/* INLINE_STYLES */',()=>css).replace('/* INLINE_APP */',()=>`(()=>{'use strict';\n${code.join('\n')}\n})();`));
console.log('TALOS Calm Lab 04 · reproducible, offline, no runtime dependencies');
