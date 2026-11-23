/*
 * R2 gate E10 (c): every value of the whole English dictionary, every area, rendered with dummy params, is English.
 * The words come from the same list the acceptance frames are judged by (`ITALIAN_WORDS`, acceptance/checks.ts), plus
 * the accented letters an Italian sentence carries and a placeholder left unfilled.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {AREAS} from '../../src/i18n/en.ts';
import {en,t,tn,type MessageId,type PluralId} from '../../src/i18n/index.ts';
import {italianOn} from '../acceptance/checks.ts';

const ACCENTED=/[àèéìíòóùú]/iu;
const PLACEHOLDER=/\{(\w+)\}/gu;
/* Dummy params: a neutral token per placeholder, and a number for `count` so a template can print it. */
function dummyParams(template:string){const params:Record<string,string|number>={};for(const [,name] of template.matchAll(PLACEHOLDER))params[name!]=name==='count'?2:'X';return params;}
function rendered():Array<{area:string;id:string;text:string}>{
  const rows:Array<{area:string;id:string;text:string}>=[];
  for(const [area,messages] of Object.entries(AREAS))for(const [id,template] of Object.entries(messages)){
    const plural=/^(.*)\.(one|other)$/u.exec(id);
    const text=plural?tn(plural[1] as PluralId,plural[2]==='one'?1:2,dummyParams(template)):t(id as MessageId,dummyParams(template));
    rows.push({area,id,text});
  }
  return rows;
}

test('R2 E10(c): every dictionary value, rendered, is English with every placeholder filled',()=>{
  const rows=rendered();
  assert.equal(rows.length,Object.keys(en).length,'every id of `en` was rendered');
  const bad=rows.flatMap(({area,id,text})=>{
    const problems=[...italianOn(text).map(word=>`Italian word "${word}"`),...(ACCENTED.test(text)?['an accented letter']:[]),...(/\{\w+\}/u.test(text)?['an unfilled placeholder']:[])];
    return problems.length?[`${area} ${id}: ${problems.join(', ')} in ${JSON.stringify(text)}`]:[];
  });
  assert.deepEqual(bad,[],`dictionary values that are not English:\n${bad.join('\n')}`);
});

test('R2 E10(c): the check bites (an Italian value is reported, an English one is not)',()=>{
  const found=italianOn('Chiave del fornitore non valida');
  for(const word of ['chiave','fornitore','non','valida'])assert.ok(found.includes(word),`"${word}" is not caught: ${found.join(', ')}`);
  assert.ok(ACCENTED.test('la sessione è finita'));
  assert.deepEqual(italianOn('Terminal too small — need 40×12'),[]);
});
