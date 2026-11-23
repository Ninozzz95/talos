/*
 * R2 integration (D-05: "Agente esterno" in the provider list). Every provider of the kernel registry reaches the screen and
 * `talos provider list` with an English label and description, mapped by id (provider-text.ts); a provider added to the
 * registry with Italian text turns this red until it gets an entry in i18n/en/providers.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {italianOn} from '../acceptance/checks.ts';
import {en} from '../../src/i18n/index.ts';
import {providerDescriptionText,providerLabelText} from '../../src/provider/provider-text.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const registryUrl=pathToFileURL(path.resolve(here,'../../../harness-ui/src/provider-registry.mjs')).href;
/* Words the acceptance list leaves out because they collide with English elsewhere, but which only Italian registry prose uses. */
const EXTRA=/\b(modelli|tramite|collegamento|diretto|motore|locale|porta|questo|della|regione|progetto|scelt[ao]|propria|piano|programmazione|supervisore|scaricamento|centinaia|dietro|sola|chiave)\b/iu;

test('R2: every registry provider has an English label and description on screen',async()=>{
  const {REGISTRO_FORNITORI:registry}=await import(registryUrl) as {REGISTRO_FORNITORI:Record<string,{etichetta?:string;descrizione?:string}>};
  const bad:string[]=[];
  for(const [id,record] of Object.entries(registry)){
    for(const [field,text] of [['label',providerLabelText(id,String(record.etichetta??id))],['description',providerDescriptionText(id,String(record.descrizione??''))]] as const){
      const italian=italianOn(text);
      if(italian.length||EXTRA.test(text))bad.push(`${id} ${field}: ${text}`);
    }
  }
  assert.deepEqual(bad,[],`Italian provider text reaches the screen; add English to i18n/en/providers.ts:\n${bad.join('\n')}`);
  assert.ok(Object.keys(registry).length>=29,'the registry was read');
});

test('R2: every provider entry in the dictionary names a provider that exists (no stale ids)',async()=>{
  const {REGISTRO_FORNITORI:registry}=await import(registryUrl) as {REGISTRO_FORNITORI:Record<string,unknown>};
  const stale=Object.keys(en).filter(key=>key.startsWith('provider.')).map(key=>key.split('.')[1]!).filter(id=>!Object.hasOwn(registry,id));
  assert.deepEqual([...new Set(stale)],[]);
  assert.equal(providerLabelText('esterno','Agente esterno'),'External agent');
});
