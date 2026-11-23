import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {extname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const cliRoot=fileURLToPath(new URL('../../',import.meta.url));
const srcRoot=join(cliRoot,'src');
const scriptsRoot=join(cliRoot,'scripts');
const vendorRoot=join(cliRoot,'vendor');

const competitorTokens=[
  /(?:^|[/@._-])hermes(?:-agent|-ink|-shared)?(?:$|[/@._-])/iu,
  /(?:^|[/@._-])claude-code(?:$|[/@._-])/iu,
  /(?:^|[/@._-])codex(?:$|[/@._-])/iu,
  /(?:^|[/@._-])gemini-cli(?:$|[/@._-])/iu,
  /(?:^|[/@._-])pi-coding-agent(?:$|[/@._-])/iu,
];

function filesUnder(root:string):string[]{
  if(!existsSync(root))return[];
  const result:string[]=[];
  for(const entry of readdirSync(root,{withFileTypes:true})){
    const path=join(root,entry.name);
    if(entry.isDirectory())result.push(...filesUnder(path));
    else if(entry.isFile())result.push(path);
  }
  return result;
}

function hasCompetitorToken(value:string):boolean{
  return competitorTokens.some(pattern=>pattern.test(value));
}

function importSpecifiers(text:string):string[]{
  const result:string[]=[];
  for(const match of text.matchAll(/(?:import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?|export\s+(?:type\s+)?[^'"]*?\s+from\s+|import\s*\()(['"])([^'"]+)\1/gu)){
    result.push(match[2]!);
  }
  return result;
}

test('React and Ink use their package types, never blanket ambient any declarations',()=>{
  const declarations=filesUnder(srcRoot).filter(path=>extname(path)==='.ts'&&path.endsWith('.d.ts'));
  const offenders:string[]=[];
  for(const path of declarations){
    const text=readFileSync(path,'utf8');
    if(/declare\s+module\s+['"](?:react|ink)['"]/u.test(text))offenders.push(relative(cliRoot,path).split('\\').join('/'));
  }
  assert.deepEqual(offenders,[]);
});

test('product dependency and import surfaces contain no competitor product package',()=>{
  const packageJson=JSON.parse(readFileSync(join(cliRoot,'package.json'),'utf8')) as Record<string,unknown>;
  const dependencyGroups=['dependencies','devDependencies','optionalDependencies','peerDependencies'] as const;
  const offenders:string[]=[];
  for(const group of dependencyGroups){
    const entries=packageJson[group];
    if(entries&&typeof entries==='object'){
      for(const name of Object.keys(entries as Record<string,unknown>)){
        if(hasCompetitorToken(name))offenders.push(`package.json ${group} ${name}`);
      }
    }
  }
  const imports=packageJson.imports;
  if(imports&&typeof imports==='object'){
    for(const [name,target] of Object.entries(imports as Record<string,unknown>)){
      const rendered=`${name} ${typeof target==='string'?target:JSON.stringify(target)}`;
      if(hasCompetitorToken(rendered))offenders.push(`package.json imports ${rendered}`);
    }
  }

  for(const path of [...filesUnder(srcRoot),...filesUnder(scriptsRoot)]){
    if(!['.ts','.tsx','.js','.mjs','.cjs'].includes(extname(path)))continue;
    const text=readFileSync(path,'utf8');
    for(const specifier of importSpecifiers(text)){
      if(hasCompetitorToken(specifier))offenders.push(`${relative(cliRoot,path).split('\\').join('/')} -> ${specifier}`);
    }
  }
  assert.deepEqual(offenders,[]);
});

test('product vendor and build inputs contain no competitor-named copies or aliases',()=>{
  const offenders:string[]=[];
  const productPaths=[...filesUnder(srcRoot),...filesUnder(scriptsRoot),...filesUnder(vendorRoot)];
  for(const path of productPaths){
    const rel=relative(cliRoot,path).split('\\').join('/');
    if(hasCompetitorToken(rel))offenders.push(rel);
    if(/(?:^|\/)VENDOR\.md$/u.test(rel)){
      const text=readFileSync(path,'utf8');
      if(hasCompetitorToken(text))offenders.push(`${rel} provenance`);
    }
  }

  for(const path of readdirSync(cliRoot,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&/^tsconfig.*\.json$/u.test(entry.name))
    .map(entry=>join(cliRoot,entry.name))){
    const text=readFileSync(path,'utf8');
    if(hasCompetitorToken(text))offenders.push(relative(cliRoot,path).split('\\').join('/'));
  }

  const scripts=(JSON.parse(readFileSync(join(cliRoot,'package.json'),'utf8')) as {scripts?:Record<string,string>}).scripts??{};
  for(const [name,value] of Object.entries(scripts)){
    if(hasCompetitorToken(`${name} ${value}`))offenders.push(`package.json scripts ${name}`);
  }
  assert.deepEqual(offenders,[]);
});
