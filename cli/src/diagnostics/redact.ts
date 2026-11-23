const SECRET_KEY=/^(?:.*(?:api[-_]?key|authorization|password|secret|token).*)$/iu;
/* Session export (keepNumbers): a PLURAL `tokens` key (`tokens`, `total_tokens`, `inputTokens`) is a counter, never a credential; its object is walked, not masked whole. Any strong secret word in the key keeps the whole-value mask. */
const COUNTER_KEY=/^(?!.*(?:api[-_]?key|authorization|password|secret|credential|bearer|private)).*tokens.*$/iu;
function marker(value:string){return `[REDACTED:${Buffer.byteLength(value,'utf8')}]`;}
function escapeRe(value:string){return value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');}
function redactAssignments(input:string){let out=input;
  out=out.replace(/\b(authorization)\b(\s*:\s*)([^\r\n]+)/giu,(_m,key,sep,value)=>`${key}${sep}${marker(String(value).trim())}`);
  out=out.replace(/\b(x-api-key|api[-_]?key|token|secret|password)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s;\r\n,]+)/giu,(_m,key,sep,raw)=>{const text=String(raw);const quoted=(text.startsWith('"')&&text.endsWith('"'))||(text.startsWith("'")&&text.endsWith("'"));const value=quoted?text.slice(1,-1):text;return `${key}${sep}${quoted?text[0]:''}${marker(value)}${quoted?text.at(-1):''}`;});
  return out;
}
/*
 * Gate E12 (owner yes 2026-09-24, v1 output included): secret VALUES recognised by their vendor prefix, additive to the name
 * rules above and to the exact values. Every pattern has a token boundary on both sides (Hermes agent/redact.py:578,
 * 2026-09-23), a length floor and an upper bound on every quantifier (Qwen secret-scanner ReDoS note, test 2026-09-03).
 * Lists: gate §6.1 (Hermes redact.py:148-207, Codex doctor/output.rs:915-945 2026-09-22, GitLab token prefixes doc
 * 2026-09-23). `ASIA` is here because Hermes, the Codex sanitizer and Gemini miss it; `sk-` takes `-`/`_` so `sk-proj-`
 * and `sk-ant-api03-` match (the `[A-Za-z0-9]{20,}` shape of Codex/Qwen misses them), and needs one digit so a
 * kebab-case name such as `sk-learn-compatible-…` stays readable. The mask is the full `[REDACTED:<bytes>]` (Q-R2-11).
 */
const T='A-Za-z0-9_\\-';// token characters: a match may not be glued to more of them on either side
const bounded=(source:string,flags='gu')=>new RegExp(`(?<![${T}])(?:${source})(?![${T}])`,flags);
const DASH5='-{5}';
const PRIVATE_KEY_LABEL='[A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?';
const SECRET_VALUE_PATTERNS:readonly RegExp[]=[
  // PEM first: a whole block, then a block cut off before its END line (its base64 body up to the first non-body line).
  new RegExp(`${DASH5}BEGIN ${PRIVATE_KEY_LABEL}${DASH5}(?:(?!${DASH5})[\\s\\S]){0,16384}${DASH5}END ${PRIVATE_KEY_LABEL}${DASH5}`,'gu'),
  new RegExp(`${DASH5}BEGIN ${PRIVATE_KEY_LABEL}${DASH5}(?:\\r?\\n(?:[A-Za-z0-9+/=]{1,128}|[A-Za-z][A-Za-z-]{0,31}: [^\\r\\n]{0,128})){0,1024}`,'gu'),
  bounded('eyJ[A-Za-z0-9_-]{8,4096}\\.eyJ[A-Za-z0-9_-]{8,8192}\\.[A-Za-z0-9_-]{10,4096}'),// JWT: three base64url segments
  bounded('sk-(?=[A-Za-z0-9_-]{0,255}\\d)[A-Za-z0-9_-]{20,256}'),// OpenAI (proj/svcacct/admin), Anthropic (ant-api03/admin01), OpenRouter
  bounded('gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{30,255}'),
  bounded('gl(?:pat|oas|dt|rtr|rt|cbt|ptt|ft|imt|agent|wt|soat|ffct)-[A-Za-z0-9_-]{20,255}'),
  bounded('xox[abprs]-[A-Za-z0-9-]{10,255}|xapp-[A-Za-z0-9-]{10,255}'),
  bounded('AIza[A-Za-z0-9_-]{35,64}'),
  bounded('(?:AKIA|ASIA)[A-Z0-9]{16}'),
  bounded('hf_[A-Za-z0-9]{30,255}|npm_[A-Za-z0-9]{36,255}'),
];
// `Bearer <token>`: only the credential is masked, the scheme stays readable; 20+ token68 characters with a digit, so
// "the bearer of bad news" and "Bearer internationalization" pass (Hermes redact.py:1139, Codex sanitizer tests).
const BEARER=/(?<![A-Za-z0-9])(bearer[ \t]+)(?=[A-Za-z0-9._~+/-]{0,4095}\d)([A-Za-z0-9._~+/-]{20,4096}=*)(?![A-Za-z0-9._~+/=-])/giu;
function redactSecretValues(input:string){
  let out=input;
  for(const pattern of SECRET_VALUE_PATTERNS)out=out.replace(pattern,match=>marker(match));
  return out.replace(BEARER,(_m,scheme:string,token:string)=>`${scheme}${marker(token)}`);
}
export function createRedactor(secrets:Iterable<string>){const values=[...new Set([...secrets].filter(x=>typeof x==='string'&&x.length>0))].sort((a,b)=>b.length-a.length);return{text(input:string){let out=redactSecretValues(redactAssignments(String(input)));for(const secret of values)out=out.replace(new RegExp(escapeRe(secret),'gu'),marker(secret));return out;},value(input:unknown){return redactObject(input,values);}};}
export function redactObject(value:unknown,secrets:Iterable<string>=[],options:{keepNumbers?:boolean}={}):unknown{const r=createRedactor(secrets);function visit(v:unknown):unknown{if(Array.isArray(v))return v.map(visit);if(v&&typeof v==='object'){const out:Record<string,unknown>={};for(const[k,x]of Object.entries(v as Record<string,unknown>)){if(SECRET_KEY.test(k)){if(options.keepNumbers===true){if(typeof x==='number'||typeof x==='boolean'||x===null){out[k]=x;continue;}if(x&&typeof x==='object'&&!Array.isArray(x)&&COUNTER_KEY.test(k)){out[k]=visit(x);continue;}}out[k]=typeof x==='string'?marker(x):'[REDACTED]';continue;}out[k]=visit(x);}return out;}if(typeof v==='string')return r.text(v);return v;}return visit(value);}
export function secretValuesFromEnvironment(env:Record<string,string|undefined>){const rows:string[]=[];for(const[k,v]of Object.entries(env))if(v&&SECRET_KEY.test(k))rows.push(v);return rows;}


export function createPathPseudonymizer(paths:Iterable<string>){
  const canonical=[...new Set([...paths].filter((value):value is string=>typeof value==='string'&&value.length>1))].sort((a,b)=>b.length-a.length);
  const rows=canonical.flatMap((value,index)=>{
    const label='[PATH:'+String(index+1)+']';
    const variants=[value,value.replace(/\\/gu,'/'),value.replace(/\//gu,'\\')];
    return [...new Set(variants.filter(v=>v.length>1))].map(pattern=>({pattern,label}));
  }).sort((a,b)=>b.pattern.length-a.pattern.length);
  const text=(input:string)=>{let out=String(input);for(const row of rows)out=out.replace(new RegExp(escapeRe(row.pattern),process.platform==='win32'?'giu':'gu'),()=>row.label);return out;};
  const value=(input:unknown):unknown=>{
    if(Array.isArray(input))return input.map(value);
    if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input as Record<string,unknown>).map(([k,v])=>[k,value(v)]));
    return typeof input==='string'?text(input):input;
  };
  return{text,value};
}
