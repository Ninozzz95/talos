import {KEYBINDINGS,type Keybinding} from './keybindings.ts';

export type KeymapOverride=Record<string,string[]>;
export type KeymapDiagnosticCode='KEYMAP_UNKNOWN_BINDING'|'KEYMAP_CHORD_INVALID'|'KEYMAP_DUPLICATE_CHORD'|'KEYMAP_CONFLICT'|'KEYMAP_RESERVED_CHORD';
export type KeymapDiagnostic={
  code:KeymapDiagnosticCode;
  bindingId:string;
  chord?:string;
  conflictWith?:string;
  message:string;
};
export type ResolvedKeymap={bindings:Keybinding[];diagnostics:KeymapDiagnostic[]};

const SPECIAL=new Map([
  ['pageup','PageUp'],['pagedown','PageDown'],['home','Home'],['end','End'],
  ['left','Left'],['right','Right'],['up','Up'],['down','Down'],
  ['enter','Enter'],['tab','Tab'],['esc','Esc'],['escape','Esc'],
  ['backspace','Backspace'],['delete','Delete'],
]);
const SAFETY:ReadonlyArray<{bindingId:string;chord:string}>=[
  {bindingId:'interrupt',chord:'Ctrl+C'},
  {bindingId:'exit',chord:'Ctrl+D'},
  {bindingId:'approval-cancel',chord:'Esc'},
];

export function canonicalKeyChord(value:string):string|null{
  if(typeof value!=='string')return null;
  const raw=value.trim();
  if(!raw||/[\x00-\x1f\x7f]/u.test(raw))return null;
  if([...raw].length===1&&raw!=='+')return raw;
  const special=SPECIAL.get(raw.toLowerCase());
  if(special)return special;
  const shifted=/^shift\+(tab|enter)$/iu.exec(raw);
  if(shifted)return shifted[1]!.toLowerCase()==='tab'?'Shift+Tab':'Shift+Enter';
  const modified=/^(ctrl|alt)\+([^+\s])$/iu.exec(raw);
  if(modified){
    const modifier=modified[1]!.toLowerCase()==='ctrl'?'Ctrl':'Alt';
    return modifier+'+'+modified[2]!.toUpperCase();
  }
  return null;
}

function cloneDefaults():Keybinding[]{return KEYBINDINGS.map(row=>({...row,keys:[...row.keys]}));}

export function resolveKeymap(overrides:KeymapOverride|undefined):ResolvedKeymap{
  const bindings=cloneDefaults();
  const diagnostics:KeymapDiagnostic[]=[];
  if(overrides){
    for(const [bindingId,rawKeys] of Object.entries(overrides)){
      const targets=bindings.filter(row=>row.id===bindingId);
      if(targets.length===0){diagnostics.push({code:'KEYMAP_UNKNOWN_BINDING',bindingId,message:'Unknown key binding: '+bindingId});continue;}
      const keys:string[]=[];const seen=new Set<string>();
      for(const raw of rawKeys){
        const chord=canonicalKeyChord(raw);
        if(!chord){diagnostics.push({code:'KEYMAP_CHORD_INVALID',bindingId,chord:String(raw),message:'Invalid key chord for '+bindingId+': '+String(raw)});continue;}
        if(seen.has(chord)){diagnostics.push({code:'KEYMAP_DUPLICATE_CHORD',bindingId,chord,message:'Duplicate key chord for '+bindingId+': '+chord});continue;}
        seen.add(chord);keys.push(chord);
      }
      for(const binding of targets)binding.keys=[...keys];
    }
  }
  const byContext=new Map<string,{bindingId:string;chord:string}>();
  for(const binding of bindings){
    for(const chord of binding.keys){
      const key=binding.context+'\u0000'+chord;
      const previous=byContext.get(key);
      if(previous&&previous.bindingId!==binding.id){
        diagnostics.push({code:'KEYMAP_CONFLICT',bindingId:binding.id,chord,conflictWith:previous.bindingId,message:'Key chord '+chord+' conflicts in '+binding.context+': '+previous.bindingId+' vs '+binding.id});
      }else byContext.set(key,{bindingId:binding.id,chord});
    }
  }
  for(const reserved of SAFETY){
    const binding=bindings.find(row=>row.id===reserved.bindingId);
    if(!binding?.keys.includes(reserved.chord)){diagnostics.push({code:'KEYMAP_RESERVED_CHORD',bindingId:reserved.bindingId,chord:reserved.chord,message:'Safety key '+reserved.chord+' must remain bound to '+reserved.bindingId});}
  }
  return{bindings,diagnostics};
}

export function assertValidKeymap(overrides:KeymapOverride|undefined):Keybinding[]{
  const resolved=resolveKeymap(overrides);
  if(resolved.diagnostics.length){
    const first=resolved.diagnostics[0]!;
    throw Object.assign(new Error('KEYMAP_INVALID: '+first.message),{code:'KEYMAP_INVALID',details:{diagnostics:resolved.diagnostics}});
  }
  return resolved.bindings;
}
