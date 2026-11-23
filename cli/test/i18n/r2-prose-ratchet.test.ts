/*
 * R2 gate E10 (e), owner decision Q-R2-10: the screen's words live in `src/i18n/en/*.ts`. The prose still written inline
 * in `src/tui/**` and `src/commands/**` is counted here, and the count may only go down (R5 finishes it).
 *
 * "Prose", precisely: a string literal, a no-substitution template or the literal parts of a template (joined, so the
 * interpolations do not count as words) whose text holds two words of two or more letters separated by white space
 * (`/\p{L}{2,}\s+\p{L}{2,}/u`). Codes (`PROVIDER_KEY_MISSING`), ids (`screen.help.title`), key chords
 * (`Ctrl+C Ctrl+C`), flags, paths without spaces and single words never match. Not counted: module specifiers, the pattern given to
 * `new RegExp(...)` and string literal TYPES. `src/i18n` is outside the scanned folders by construction.
 *
 * When the count goes DOWN, lower RECORDED to the new number in the same change: a ratchet that is not tightened lets
 * the next inline sentence in for free.
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,relative} from 'node:path';
import test from 'node:test';

/* Recorded 2026-09-24 after lane D moved the screen words of app.ts, the chrome, the pickers and the overlay labels (617 before). */
const RECORDED=252;/* 15/10/2026 (0.6.6): `talos automation` and its center read their words from en/automations.ts (was 257); *//* 14/10/2026 (0.6.5): the new boot draws its rows from one renderer; 14/10/2026: the env-key «nothing found» sentence moved to provider/missing-key.ts;  R5b (2026-09-25): talos doctor INFO lines share one template; 09/10/2026: "Unexpected argument" and the trust command moved to i18n/en/common.ts */
const ROOT=join(import.meta.dirname,'..','..');
const SCANNED=['src/tui','src/commands'];
const PROSE=/\p{L}{2,}\s+\p{L}{2,}/u;
const ts=createRequire(join(ROOT,'package.json'))('typescript') as typeof import('typescript');

function files(dir:string):string[]{return readdirSync(dir).flatMap(name=>{const full=join(dir,name);return statSync(full).isDirectory()?files(full):name.endsWith('.ts')?[full]:[];});}

function proseLiterals(file:string,code=readFileSync(file,'utf8')):Array<{line:number;text:string}>{
  const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const found:Array<{line:number;text:string}>=[];
  const excluded=(node:import('typescript').Node)=>{
    const parent=node.parent;
    if(!parent)return false;
    if(ts.isImportDeclaration(parent)||ts.isExportDeclaration(parent)||ts.isExternalModuleReference(parent)||ts.isLiteralTypeNode(parent))return true;
    if(ts.isCallExpression(parent)&&parent.expression.kind===ts.SyntaxKind.ImportKeyword)return true;
    return ts.isNewExpression(parent)&&parent.expression.getText(source)==='RegExp'&&parent.arguments?.[0]===node;
  };
  const visit=(node:import('typescript').Node):void=>{
    let text:string|null=null;
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))text=node.text;
    else if(ts.isTemplateExpression(node))text=[node.head.text,...node.templateSpans.map(span=>span.literal.text)].join('\u0000');
    if(text!==null&&!excluded(node)&&PROSE.test(text))found.push({line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,text});
    ts.forEachChild(node,visit);
  };
  visit(source);
  return found;
}

test('R2 E10(e): inline prose in src/tui and src/commands only goes down',()=>{
  const perFile=SCANNED.flatMap(dir=>files(join(ROOT,dir))).map(file=>({file:relative(ROOT,file).replaceAll('\\','/'),rows:proseLiterals(file)})).filter(entry=>entry.rows.length);
  const count=perFile.reduce((sum,entry)=>sum+entry.rows.length,0);
  const table=perFile.sort((a,b)=>b.rows.length-a.rows.length).map(entry=>`${String(entry.rows.length).padStart(4)} ${entry.file}`).join('\n');
  assert.ok(count<=RECORDED,`inline prose went UP: ${count} > ${RECORDED}. Put the new words in src/i18n/en/<area>.ts and read them with t().\n${table}`);
  assert.equal(count,RECORDED,`inline prose went down to ${count} (recorded ${RECORDED}): lower RECORDED in this file to ${count}.\n${table}`);
});

test('R2 E10(e): the prose rule counts sentences and skips codes, ids, chords, regexes and types',()=>{
  const sample=[
    "import {t} from '../i18n/index.ts';",
    "type Mode='plan mode'|'default';",
    "const a='Queue is empty.',b=`Model changed to ${id} for subsequent runs.`,c='Usage: /forge inspect <tool-id>';",
    "const d='PROVIDER_KEY_MISSING',e=t('screen.queue.empty'),f='Ctrl+C Ctrl+C',g=new RegExp('no such file','u'),h=`${a} ${b}`,i='--no-ext-diff';",
  ].join('\n');
  const texts=proseLiterals('sample.ts',sample).map(row=>row.text);
  assert.deepEqual(texts,['Queue is empty.','Model changed to \u0000 for subsequent runs.','Usage: /forge inspect <tool-id>']);
});
