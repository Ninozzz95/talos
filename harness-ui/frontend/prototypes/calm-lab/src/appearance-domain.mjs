import {THEME_CONTRACT} from '../shared/theme-contract.mjs';
export const APPEARANCE_KEY='talos.calm-lab.prototype.appearance.v4';
export const APPEARANCE_FIELDS=Object.freeze(THEME_CONTRACT.fields);
export const APPEARANCE_DEFAULTS=Object.freeze(THEME_CONTRACT.defaults);
export const STUDIO_IDS=Object.freeze(['themePresetSelect','colorModeSelect','backgroundMotionToggle','sceneOverrideSelect','motionModeSelect','motionQualitySelect','motionSpeedRange','motionIntensityRange','motionGlowRange','motionDensityRange','motionDepthRange','motionTrailsRange','motionContrastRange','motionParallaxRange']);
export const THEME_NAMES=Object.freeze([...APPEARANCE_FIELDS.find(f=>f.chiave==='themePreset').opzioni].sort((a,b)=>a[0]==='calm'?-1:b[0]==='calm'?1:0));
export function validateAppearance(raw) {
 const source=raw && typeof raw==='object' && !Array.isArray(raw)?raw:{};
 const result={...APPEARANCE_DEFAULTS};
 for(const f of APPEARANCE_FIELDS){const value=source[f.chiave];if(f.tipo==='select'){if(f.opzioni.some(([id])=>id===value))result[f.chiave]=value;}else if(f.tipo==='checkbox'){if(typeof value==='boolean')result[f.chiave]=value;}else if(typeof value==='number'&&Number.isFinite(value)){result[f.chiave]=Math.round(Math.min(f.max,Math.max(f.min,value)));}}
 for(const key of ['themePreset','sceneOverride','backgroundMotion'])if(source[key+'Versione']===2)result[key+'Versione']=2;
 return result;
}
export function patchAppearance(current,key,value){
 if(!APPEARANCE_FIELDS.some(f=>f.chiave===key))return validateAppearance(current);
 const patch={...current,[key]:value};if(['themePreset','sceneOverride','backgroundMotion'].includes(key))patch[key+'Versione']=2;
 return validateAppearance(patch);
}
export function resetAppearanceMotion(current){const next={...current};for(const key of Object.keys(APPEARANCE_DEFAULTS))if(key.startsWith('motion')||['sceneOverride','sceneOverrideVersione','backgroundMotion','backgroundMotionVersione','interfaceMotion','pauseWhenHidden','respectDataSaver','reducedMotion'].includes(key))next[key]=APPEARANCE_DEFAULTS[key];return validateAppearance(next);}
export function loadAppearance(storage) {
 try {const raw=storage.getItem(APPEARANCE_KEY);if(raw){if(raw.length>100000)return {...APPEARANCE_DEFAULTS};const s=JSON.parse(raw);return s?.version===4?validateAppearance(s.appearance):{...APPEARANCE_DEFAULTS};}
 const legacy=JSON.parse(storage.getItem('talos.calm-lab.prototype.v3')||'null');
 if(legacy?.version===1){const p=legacy.prefs||{};return validateAppearance({...APPEARANCE_DEFAULTS,colorMode:p.mode,uiDensity:p.density==='compact'?'compatta':'comoda',interfaceMotion:p.motion,uiFontScale:p.textSize===14?'small':p.textSize===18?'large':'default'});}
 }catch{}return {...APPEARANCE_DEFAULTS};
}
export function saveAppearance(storage,value){try{storage.setItem(APPEARANCE_KEY,JSON.stringify({version:4,appearance:validateAppearance(value)}));return true;}catch{return false;}}
export function appearancePolicy(value,{reduced=false,hidden=false,saveData=false}={}){
 const p=validateAppearance(value),reduce=reduced||p.reducedMotion;
 const off=!p.backgroundMotion||p.motionMode==='off';
 const staticScene=reduce||p.motionMode==='static'||(saveData&&p.respectDataSaver);
 return {scene:p.sceneOverride==='follow-theme'?p.themePreset:p.sceneOverride,background:off?'off':hidden&&p.pauseWhenHidden?'paused':staticScene?'static':'animated',interfaceMotion:p.interfaceMotion&&!reduce&&p.motionProfile!=='off',quality:(saveData&&p.respectDataSaver)||p.motionQuality==='low'?'low':p.motionQuality==='high'?'high':'balanced'};
}
export function searchAppearance(query){const norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it');const terms=norm(query).trim().split(/\s+/).filter(Boolean);return APPEARANCE_FIELDS.filter(f=>terms.every(t=>norm([f.titolo,f.chiave,f.gruppo,...(f.opzioni||[]).flat()].join(' ')).includes(t))).map(f=>({label:f.titolo,section:'appearance',target:f.id,studio:STUDIO_IDS.includes(f.id),hint:STUDIO_IDS.includes(f.id)?'Temi e atmosfere':'Aspetto e movimento'}));}
