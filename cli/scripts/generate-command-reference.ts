import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {KEYBINDINGS} from '../src/tui/keybindings.ts';
import {SLASH_COMMANDS} from '../src/tui/slash-commands.ts';

function md(value:string){return value.replaceAll('|','\\|');}

export function renderCommandReference():string{
  const lines=[
    '# TALOS CLI command reference',
    '',
    '> Generated from the runtime slash-command and keybinding catalogs. Do not edit by hand.',
    '',
    '## Slash commands',
    '',
    '| Command | Description |',
    '| --- | --- |',
    ...SLASH_COMMANDS.map(command=>{
      const usage=command.usage?' '+command.usage:'';
      return '| `/'+md(command.name+usage)+'` | '+md(command.description)+' |';
    }),
    '',
    '## Built-in keymap',
    '',
    'Interactive `/help` renders the effective keymap after user/project-user overrides; this table documents the built-in defaults.',
    '',
    '| Action | Context | Keys | Description |',
    '| --- | --- | --- | --- |',
    ...KEYBINDINGS.filter(binding=>binding.keys.length>0).map(binding=>
      '| `'+md(binding.id)+'` | `'+md(binding.context)+'` | '+binding.keys.map(key=>'`'+md(key)+'`').join(' / ')+' | '+md(binding.description)+' |'
    ),
    '',
  ];
  return lines.join('\n');
}

async function main(){
  const here=dirname(fileURLToPath(import.meta.url));
  const file=resolve(here,'../../docs/talos-cli/command-reference.md');
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,renderCommandReference(),'utf8');
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
