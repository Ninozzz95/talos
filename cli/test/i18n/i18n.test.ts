import assert from 'node:assert/strict';
import test from 'node:test';
import {AREAS} from '../../src/i18n/en.ts';
import {en,t,tn} from '../../src/i18n/index.ts';

test('R2 dictionary: ids are unique across the area files (a duplicate would silently override another lane\'s words)',()=>{
  const seen=new Map<string,string>();
  for(const [area,messages] of Object.entries(AREAS))for(const id of Object.keys(messages)){
    assert.equal(seen.get(id),undefined,`id ${id} is defined in both ${seen.get(id)} and ${area}`);seen.set(id,area);
  }
  assert.equal(seen.size,Object.keys(en).length);
});

test('R2 dictionary: placeholders are filled, a missing one stays visible, plurals follow Intl.PluralRules',()=>{
  assert.equal(t('key.missing',{provider:'OpenAI',env:'OPENAI_API_KEY',id:'openai'}),'No API key for OpenAI. Set OPENAI_API_KEY or run `talos provider set-key openai`.');
  assert.match(t('key.missing',{provider:'OpenAI'}),/\{env\}/u);
  assert.equal(tn('common.item',1),'1 item');
  assert.equal(tn('common.item',0),'0 items');
  assert.equal(tn('common.item',2),'2 items');
});
