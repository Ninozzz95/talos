import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
  CREDENTIAL_NAME_SHAPE,
  CREDENTIAL_NAMES_ALWAYS_HIDDEN,
  NOT_CREDENTIALS,
  credentialFreeEnvironment,
  isCredentialName,
} from '../../src/security/credential-free-environment.ts';

/*
 * B1 slice 19 — THE CLI'S DENYLIST IS THE KERNEL'S, NOT A SECOND OPINION.
 *
 * The oracle is the kernel itself, read from disk and never written: `eUnaCredenziale` decides every
 * expected verdict below, so no name in the table carries a hand-written answer. The kernel does not
 * export its shape or its declared exceptions, so the second test reads them from the kernel's source
 * text: a drift in a name the table does not happen to list still turns this file red.
 */
const KERNEL_FILE=fileURLToPath(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url));
const kernel:any=await import(pathToFileURL(KERNEL_FILE).href);

const NAMES=[
  'OPENROUTER_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY','ZAI_ANTHROPIC_API_KEY','DEEPSEEK_API_KEY',
  'GITHUB_TOKEN','HF_TOKEN','TALOS_HARNESS_UI_TOKEN','TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64',
  'AWS_SECRET_ACCESS_KEY','AWS_ACCESS_KEY_ID','DB_PASSWORD','MY_PASSWD','NPM_AUTH','GOOGLE_APPLICATION_CREDENTIALS',
  'APIKEY','KEY_VAULT','DONKEY_KEY','openai_api_key','Github_Token','ssh_auth_sock',
  'PATH','Path','HOME','USERPROFILE','SystemRoot','ComSpec','PATHEXT','TEMP','APPDATA','LOCALAPPDATA',
  'SSH_AUTH_SOCK','GPG_AGENT_INFO','KEYBOARD_LAYOUT','AUTHORITY','TALOS_HARNESS_UI_PORT',
  'KEYWORDS','MONKEY','TURKEY','PRIVATE','TOKENIZERS_PARALLELISM','NODE_OPTIONS','',
];

test('the CLI denylist agrees with the kernel on every name of the table',()=>{
  const verdicts=NAMES.map(name=>({name,kernel:kernel.eUnaCredenziale(name) as boolean,cli:isCredentialName(name)}));
  const disagreements=verdicts.filter(v=>v.kernel!==v.cli).map(v=>`${JSON.stringify(v.name)}: kernel ${v.kernel}, cli ${v.cli}`);
  assert.deepEqual(disagreements,[]);
  /* The table is not vacuous: the kernel itself calls some of these names credentials and some not. */
  assert.ok(verdicts.some(v=>v.kernel)&&verdicts.some(v=>!v.kernel));
});

test('the CLI copies the kernel shape, its declared exceptions and its named keys, read from the kernel source',async()=>{
  const source=await readFile(KERNEL_FILE,'utf8');
  const shape=/^const FORMA_DI_CREDENZIALE = (\/.+\/[a-z]*)\s*$/mu.exec(source);
  assert.ok(shape,'the kernel still declares FORMA_DI_CREDENZIALE as a regular expression literal');
  assert.equal(CREDENTIAL_NAME_SHAPE.toString(),shape[1]);
  const exceptions=/^const NON_SONO_SEGRETI = new Set\(\[([\s\S]*?)\]\)/mu.exec(source);
  assert.ok(exceptions,'the kernel still declares NON_SONO_SEGRETI as a Set literal');
  const declared=[...exceptions[1]!.matchAll(/^\s*'([^']+)'/gmu)].map(m=>m[1]).sort();
  assert.ok(declared.length>0);
  assert.deepEqual([...NOT_CREDENTIALS].sort(),declared);
  assert.deepEqual([...CREDENTIAL_NAMES_ALWAYS_HIDDEN],[...kernel.CHIAVI_CREDENZIALI_DA_NASCONDERE]);
});

test('a credential-free environment drops every credential-shaped name and keeps every other value intact',()=>{
  const source:Record<string,string|undefined>={
    OPENROUTER_API_KEY:'dummy-openrouter',ANTHROPIC_API_KEY:'dummy-anthropic',OPENAI_API_KEY:'dummy-openai',
    GITHUB_TOKEN:'dummy-github',TALOS_HARNESS_UI_TOKEN:'dummy-ui',AWS_SECRET_ACCESS_KEY:'dummy-aws',
    TALOS_SLICE19_CANARY:'canary-not-secret',SSH_AUTH_SOCK:'\\\\.\\pipe\\openssh-ssh-agent',PATH:'C:\\Windows',UNSET:undefined,
  };
  const clean=credentialFreeEnvironment(source);
  const expectedNames=Object.keys(source).filter(name=>source[name]!==undefined&&!kernel.eUnaCredenziale(name)).sort();
  assert.deepEqual(Object.keys(clean).sort(),expectedNames);
  for(const name of expectedNames)assert.equal(clean[name],source[name],`${name} arrives intact`);
  assert.equal(clean.TALOS_SLICE19_CANARY,'canary-not-secret');
  assert.equal(Object.hasOwn(clean,'UNSET'),false,'an undefined value is not turned into a string');
});
