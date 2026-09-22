const SECRET_KEY=/^(?:.*(?:api[-_]?key|authorization|password|secret|token).*)$/iu;
function marker(value:string){return `[REDACTED:${Buffer.byteLength(value,'utf8')}]`;}
function escapeRe(value:string){return value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');}
function redactAssignments(input:string){let out=input;
  out=out.replace(/\b(authorization)\b(\s*:\s*)([^\r\n]+)/giu,(_m,key,sep,value)=>`${key}${sep}${marker(String(value).trim())}`);
  out=out.replace(/\b(x-api-key|api[-_]?key|token|secret|password)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s;\r\n,]+)/giu,(_m,key,sep,raw)=>{const text=String(raw);const quoted=(text.startsWith('"')&&text.endsWith('"'))||(text.startsWith("'")&&text.endsWith("'"));const value=quoted?text.slice(1,-1):text;return `${key}${sep}${quoted?text[0]:''}${marker(value)}${quoted?text.at(-1):''}`;});
  return out;
}
export function createRedactor(secrets:Iterable<string>){const values=[...new Set([...secrets].filter(x=>typeof x==='string'&&x.length>0))].sort((a,b)=>b.length-a.length);return{text(input:string){let out=redactAssignments(String(input));for(const secret of values)out=out.replace(new RegExp(escapeRe(secret),'gu'),marker(secret));return out;},value(input:unknown){return redactObject(input,values);}};}
export function redactObject(value:unknown,secrets:Iterable<string>=[]):unknown{const r=createRedactor(secrets);function visit(v:unknown):unknown{if(Array.isArray(v))return v.map(visit);if(v&&typeof v==='object'){const out:Record<string,unknown>={};for(const[k,x]of Object.entries(v as Record<string,unknown>)){if(SECRET_KEY.test(k)){out[k]=typeof x==='string'?marker(x):'[REDACTED]';continue;}out[k]=visit(x);}return out;}if(typeof v==='string')return r.text(v);return v;}return visit(value);}
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
