/*
 * Stage 7.11 (mockup Settings «Config»; owner 03/10): the Config fields from the `ui` configuration — the mockup's rows first, the
 * settings /config had after them — and Enter turns the form back into only the keys that changed, in config values; an emptied editor
 * goes back to $VISUAL/$EDITOR. C10 (owner 01/11, «solo campi che agiscono»): View and Language, which saved nothing, are not offered.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {settingChanges,settingFields} from '../../src/tui/settings-config.ts';

test('the fields read the configuration, in the mockup\'s order, the existing settings after, and none of them is only shown',()=>{
  const fields=settingFields({mouse:false,reasoning:'hidden',toolRows:'each',reduceMotion:true,notifications:'auto',editor:'code --wait',maxProseWidth:80,exitOutput:'resume',questionTimeout:'10m'});
  assert.deepEqual(fields.map(field=>[field.label,field.value]),[
    ['Mouse',false],['Thinking','hidden'],['Tool rows','one per call'],['Reduce motion',true],['Notify when done','desktop'],
    ['Editor','code --wait'],['Response width','80 columns'],['On exit','Resume link only'],['Questions close after','10 min'],['Start view','Essential']]);
  assert.ok(fields.every(field=>!field.off?.length),'no option is shown without being offered');
  /* Frontend 01/11: an empty Editor says what is in use instead, and that is never saved */
  assert.equal(settingFields({},{EDITOR:'code'}).find(field=>field.label==='Editor')!.placeholder,'$EDITOR: code');
  assert.equal(settingFields({},{VISUAL:'vim',EDITOR:'code'}).find(field=>field.label==='Editor')!.placeholder,'$VISUAL: vim');
  assert.match(settingFields({},{}).find(field=>field.label==='Editor')!.placeholder!,/^none · name one here to edit outside TALOS$/u);
  const defaults=settingFields(undefined);
  assert.deepEqual(defaults.map(field=>field.value),[true,'collapsed','grouped',false,'desktop','','Full width','Keep transcript','5 min','Essential']);
});

test('only what changed is saved, in config values; an emptied editor is unset; what waits for the next launch says so',()=>{
  const ui={reasoning:'collapsed',editor:'vim'};
  const values=Object.fromEntries(settingFields(ui).map(field=>[field.label,field.value]));
  assert.deepEqual(settingChanges(values,ui),[],'nothing changed');
  const changed={...values,Thinking:'expanded','Tool rows':'one per call',Mouse:false,Editor:'  ','Response width':'100 columns','Notify when done':'bell'};
  assert.deepEqual(settingChanges(changed,ui),[
    {key:'mouse',value:false,unset:false,live:false},{key:'reasoning',value:'visible',unset:false,live:true},{key:'toolRows',value:'each',unset:false,live:true},
    {key:'notifications',value:'bell',unset:false,live:false},{key:'editor',value:'',unset:true,live:true},{key:'maxProseWidth',value:100,unset:false,live:true}]);
  assert.deepEqual(settingChanges({...values,View:'classic',Language:'Italiano'},ui),[],'fields that are not in the form are never saved');
  assert.deepEqual(settingChanges({...values,'Start view':'Zen'},ui),[{key:'startView',value:'zen',unset:false,live:false}],'the start view waits for the next launch');
});
