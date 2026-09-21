/** Refresh reference assets from the current checkout, never from a network catalog. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const source = resolve(process.argv[2] || fileURLToPath(new URL('../../src/',import.meta.url)));
const {CAMPI_IMPOSTAZIONI: fields} = await import(pathToFileURL(source+'/components/impostazioni-campi.js'));
const app = await readFile(source+'/legacy/app.js','utf8');
const literal = (name) => { const match=app.match(new RegExp('const '+name+' = (\\{[\\s\\S]*?\\n  \\});')); if(!match)throw Error('Canonical literal missing: '+name);return Function('"use strict";return ('+match[1]+')')(); };
const out={fields,defaults:literal('DESKTOP_APPEARANCE_DEFAULTS'),rangeDefs:literal('MOTION_RANGE_DEFS')};
if(fields.length!==40 || fields.find(f=>f.chiave==='themePreset')?.opzioni.length!==14)throw Error('Appearance contract changed; review the inventory explicitly.');
for(const dir of ['shared','docs'])await mkdir(new URL('./'+dir+'/',import.meta.url),{recursive:true});
await writeFile(new URL('./shared/theme-contract.mjs',import.meta.url),'// Generated from canonical TALOS field/default contracts. See source provenance.\nexport const THEME_CONTRACT = '+JSON.stringify(out,null,2)+';\n');
const copies=[['styles/temi.css','theme-tokens.css'],['motion/desktop-scenes.js','desktop-scenes.js'],['components/calm-controls.js','calm-controls.js'],['design-system/calm-controls.css','calm-controls.css']];
for (const [from,to] of copies)await writeFile(new URL('./shared/'+to,import.meta.url),await readFile(source+'/'+from));
const paths=['components/impostazioni-campi.js','legacy/app.js',...copies.map(([from])=>from)];
await writeFile(new URL('./docs/theme-source-hashes.json',import.meta.url),JSON.stringify(await Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(source+'/'+path)).digest('hex')}))),null,2)+'\n');
