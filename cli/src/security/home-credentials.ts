import {readdirSync,realpathSync,statSync} from 'node:fs';
import {homedir,hostname} from 'node:os';
import path from 'node:path';

/*
 * 0.6.8 (third review of 0.6.8, F1; owner 16/10/2026 «Chiedere sempre»): Full access reads a project's secrets without asking, but
 * this computer's login credentials are read only when the person says yes — in Full access too — and with nobody in front they are
 * refused. The third review measured `~/.npmrc` and `~/.ssh/id_ed25519` reaching the provider in Full access `-p` (0.6.7 kept them).
 * The list is the kernel's own (`harness-ui/src/path-policy.mjs` CREDENZIALI_DELLA_CASA, «Come Hermes» `agent/file_safety.py`),
 * where it refuses WRITING them at every level; `.ssh/config` holds no key and stays an ordinary secret, as there.
 * Fifth review of 0.6.8: every way of writing the same file counts — any environment variable a shell expands (cmd `%VAR%`,
 * PowerShell `$env:VAR` and `${env:VAR}`, POSIX `$VAR` and `${VAR}`), `~`, quotes, an 8.3 name or a junction (the real path), a
 * trailing dot or space and an NTFS stream (Windows opens the same file). What still cannot be resolved (a variable that is not
 * set, the kernel's wildcard, a glob) fails closed when the name is a credential's. Owner 16/10/2026 «Dentro la 0.6.8»: a hard link
 * to a credential (another name for the same file, which no path resolution reveals) is recognised by the file's identity.
 */
const FILES=new Set(['.netrc','_netrc','.pgpass','.npmrc','.pypirc','.git-credentials']);
/* `.talos-biglietti`: the key of TALOS's entry tickets, a credential of this computer like ~/.ssh (review of the permissions block,
   04/11/2026, A2; decision 161). The kernel lists it with the others (path-policy.mjs, «gettone sempre», 02/11/2026). */
const FOLDERS=['.ssh','.aws','.gnupg','.kube','.docker','.azure','.config/gh','.config/gcloud','.talos-biglietti'];
const ORDINARY=new Set(['.ssh/config']);
const WIN=process.platform==='win32';
/** the kernel's wildcard for a substitution it could not expand (path-policy.mjs JOLLY) */
const KERNEL_WILDCARD='';
const UNRESOLVED=/[%$*?]/u;

function real(pathname:string){try{return realpathSync.native(pathname);}catch{return pathname;}}
/* 0.6.18 (F0, judge v2365): since 0.6.8 this check OPENED a network path (`\\computer\share`, `//…`, `\\.\UNC\…`, GLOBALROOT, WebDAV
   `\\computer@SSL\…`) before any card, and Windows signs in to that computer with the person's credentials. As Hermes
   (`agent/file_safety.py`: «on the *raw* path string before any realpath») and Claude Code («refuse network paths … before touching
   them»), the computer is read from the TEXT: a file on another computer is not one of this computer's credentials. The home's own
   computer (a home on a share) keeps the check it had: the profile lives there. `\\?\C:\`, `\\.\C:\` and the WSL home are not networks. */
/** the computer of a path already through path.resolve (backslashes only) */
function networkHost(text:string):string|null{
  if(!WIN)return null;
  /* review of 20/11 (security R1): `\\.\GLOBAL\…` and `\\.\GLOBALROOT\(DosDevices|GLOBAL??|??)\…` name the same objects again */
  /* round 2 (security R3): there Windows also drops a trailing dot from each name (`\\.\GLOBAL.\UNC.\…`, `Mup.`); spaces it keeps (measured) */
  const named=text.replace(/^(\\\\[?.]\\)(.*)$/su,(_,prefix:string,rest:string)=>prefix+rest.split('\\').map(name=>name.replace(/\.+$/u,'')||name).join('\\'));
  const s=named.replace(/^(\\\\[?.]\\)(?:(?:GLOBAL|GLOBALROOT\\(?:DosDevices|GLOBAL\?\?|\?\?))\\)+/iu,(_,prefix:string)=>prefix);
  /* a network redirector's own root (`\\.\GLOBALROOT\Device\Mup`, left when `;` splits a command; `\\.\UNC\`) is no computer of this one either */
  const device=/^\\\\[?.]\\(?:UNC|GLOBALROOT\\Device\\(Mup|LanmanRedirector|WebDavRedirector|RdpDr)(?:\\;[^\\]*)?)(?=\\|$)(?:\\([^\\]+))?/iu.exec(s);
  if(device&&!device[2])return '\\device\\'+(device[1]??'unc').toLowerCase();
  const host=(device?device[2]:/^\\\\([^\\?.][^\\]*)\\/u.exec(s)?.[1])?.toLowerCase()??null;
  return host==='wsl.localhost'||host==='wsl$'?null:host;
}
const onAnotherComputer=(pathname:string,home:string)=>{const host=networkHost(pathname);return host!==null&&host!==networkHost(path.resolve(home));};
/* 0.6.18: `\\localhost\C$\…` (127.x, ::1, this computer's exact name, also after `\\?\UNC\`) is this computer's own disk, read as
   `C:\…` from the words as the kernel does (path-policy.mjs QUESTA_MACCHINA), as well as the reading as written (isHomeCredential):
   a key reached that way asks in Full access too, and no answer is wider. `<name>.<domain>` may be another computer: not read so. */
const MACHINE=(()=>{try{return hostname();}catch{return '';}})();
const LOOPBACK=String.raw`localhost|127(?:\.\d{1,3}){1,3}|\[?::1\]?|0--1\.ipv6-literal\.net`;
const THIS_MACHINE=new RegExp(String.raw`^\\\\(?:[?.]\\UNC\\)?(?:${LOOPBACK}`
  +(MACHINE?'|'+MACHINE.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'):'')+String.raw`)\\([A-Za-z])\$(\\.*)?$`,'isu');
const OWN_HOST=new RegExp(`^(?:${LOOPBACK})$`,'iu');
/** 0.6.18, riga 202: whether the computer named on the kernel's network card (`networkPath.host`, the text after `\\`) is another
 *  computer. This one is its exact name, the loopback names above and the WSL hosts (as networkHost); a WebDAV suffix (`@SSL`,
 *  `@port`) and the trailing dot Windows drops are not part of the name. A full name with a domain, an address, an empty host:
 *  another computer (they may resolve elsewhere, and nothing is looked up). */
/* second round of riga 202, point 3 (reviewer: `localhoſt`, a Kelvin sign and `localhost@nas` were read as this computer): only
   printable ASCII is compared, capitals folded in ASCII only, and after the name only Windows' WebDAV forms `@SSL` and `@<port>`
   (Microsoft Learn, DavGetHTTPFromUNCPath: `\\server[@SSL][@port][\path]`); anything else is another computer */
const WEBDAV_HOST=/^([\x21-\x3f\x41-\x7e]*?)(?:@[Ss][Ss][Ll])?(?:@\d{1,5})?$/u;
const asciiLower=(text:string)=>text.replace(/[A-Z]/gu,c=>c.toLowerCase());
export function isAnotherComputer(host:string|undefined,machine:string=MACHINE):boolean{
  const text=String(host??'');
  /* the name is printable ASCII without `@`, the suffix is ASCII by construction: any other character means no match */
  const parts=WEBDAV_HOST.exec(text);
  if(!parts)return true;
  const name=asciiLower(parts[1]!.replace(/\.+$/u,''));
  if(!name)return true;
  if(name==='wsl$'||name==='wsl.localhost'||OWN_HOST.test(name))return false;
  return name!==asciiLower(machine);
}
function asOwnDisk(pathname:string):string{const m=WIN?THIS_MACHINE.exec(pathname.replace(/\//gu,'\\')):null;return m?`${m[1]}:${m[2]??'\\'}`:pathname;}
function env(name:string,environment:NodeJS.ProcessEnv):string|undefined{
  if(Object.hasOwn(environment,name))return environment[name];
  if(!WIN)return undefined;
  const key=Object.keys(environment).find(candidate=>candidate.toLowerCase()===name.toLowerCase());
  return key===undefined?undefined:environment[key];
}
/** a path as a shell would expand it: quotes off, `~` and every variable that is set replaced (an unset one stays as written) */
export function expandShellPath(text:string,{home,environment=process.env}:{home:string;environment?:NodeJS.ProcessEnv}):string{
  let t=text.trim().replace(/^["'`]+/u,'').replace(/["'`]+$/u,'');
  t=t.replace(/^~(?=$|[\\/])/u,()=>home);
  const value=(name:string,whole:string)=>{if(/^(?:home|userprofile)$/iu.test(name))return home;return env(name,environment)??whole;};
  t=t.replace(/\$\{env:([A-Za-z_][\w()]*)\}/giu,(whole,name)=>value(name,whole));
  t=t.replace(/\$env:([A-Za-z_]\w*)/giu,(whole,name)=>value(name,whole));
  t=t.replace(/\$\{([A-Za-z_]\w*)\}/gu,(whole,name)=>value(name,whole));
  t=t.replace(/\$([A-Za-z_]\w*)/gu,(whole,name)=>value(name,whole));
  t=t.replace(/%([A-Za-z_][\w()]*)%/gu,(whole,name)=>value(name,whole));
  return t;
}
/** the path's segments as Windows opens them: an NTFS stream and a trailing dot or space dropped, case folded */
function segments(pathname:string):string[]{
  return pathname.split(/[\\/]+/u).map(part=>part.replace(/:.*$/su,'')).map(part=>WIN?part.replace(/[. ]+$/u,'')||part:part).filter(Boolean).map(part=>WIN?part.toLowerCase():part);
}
function credentialShape(parts:readonly string[]):boolean{
  const joined=parts.join('/');
  if(ORDINARY.has(joined))return false;
  if(parts.length===1&&FILES.has(parts[0]!))return true;
  return FOLDERS.some(folder=>joined===folder||joined.startsWith(folder+'/'));
}
/** one path segment as a pattern: `*` and `?` as a shell globs them; a variable or the kernel's wildcard may be anything */
function segmentMatches(pattern:string,name:string):boolean{
  if(/[%$]/u.test(pattern))return true;
  if(!/[*?]/u.test(pattern))return pattern===name;
  const source=pattern.replace(/[.+^${}()|[\]\\]/gu,'\\$&').replace(/\*/gu,'.*').replace(/\?/gu,'.');
  return new RegExp('^'+source+'$',WIN?'iu':'u').test(name);
}
/** whether a path pattern relative to the home (segments, some with wildcards) could name one of the credentials */
function patternNamesCredential(parts:readonly string[]):boolean{
  if(!parts.length)return false;
  if(parts.length===1&&[...FILES].some(file=>segmentMatches(parts[0]!,file)))return true;
  return FOLDERS.some(folder=>{
    const names=folder.split('/');
    if(parts.length<names.length)return false;
    if(!names.every((name,index)=>segmentMatches(parts[index]!,name)))return false;
    /* `.ssh/config` written plainly is not a credential; a pattern that could reach another file in .ssh is */
    return!(parts.length===2&&!/[*?%$]/u.test(parts[1]!)&&ORDINARY.has(names[0]+'/'+parts[1]));
  });
}
/* the identities (device + file id) of this computer's credential files, for hard links; kept a few seconds, bounded */
let identities:{home:string;at:number;ids:Set<string>}|null=null;
function credentialIdentities(home:string):Set<string>{
  if(identities&&identities.home===home&&Date.now()-identities.at<5_000)return identities.ids;
  const ids=new Set<string>();let budget=4_000;
  const add=(file:string)=>{try{const s=statSync(file,{bigint:true});if(s.isFile())ids.add(s.dev+':'+s.ino);}catch{/* gone */}};
  for(const name of FILES)add(path.join(home,name));
  const walk=(folder:string,depth:number)=>{if(depth>6||budget<=0)return;let entries;try{entries=readdirSync(folder,{withFileTypes:true});}catch{return;}
    for(const entry of entries){if(--budget<=0)return;const full=path.join(folder,entry.name);if(entry.isDirectory())walk(full,depth+1);else if(entry.isFile()&&!ORDINARY.has(path.relative(home,full).split(path.sep).join('/').toLowerCase()))add(full);}};
  /* sixth review (F6-4): each folder has its own budget, so a large ~/.docker does not hide ~/.ssh */
  for(const folder of ['.ssh',...FOLDERS.filter(name=>name!=='.ssh')]){budget=4_000;walk(path.join(home,...folder.split('/')),0);}
  identities={home,at:Date.now(),ids};return ids;
}
function hardLinkToCredential(pathname:string,home:string):boolean{
  let s;try{s=statSync(pathname,{bigint:true});}catch{return false;}
  if(!s.isFile()||s.nlink<2n)return false;
  return credentialIdentities(home).has(s.dev+':'+s.ino);
}
/** Whether `target` (absolute, or relative to `cwd`) is one of this computer's login credentials. */
export function isHomeCredential(target:string|undefined,{cwd,home=homedir(),environment=process.env}:{cwd:string;home?:string;environment?:NodeJS.ProcessEnv}):boolean{
  if(typeof target!=='string'||!target.trim()||!home)return false;
  const written=expandShellPath(target,{home,environment});
  /* review of 20/11/2026 (R1-R2): this computer's share is read as its own disk in the text, the project folder and the home
     together (so start and absolute are local too); the reading as written stays, so the answer is never wider than without it */
  const own={text:asOwnDisk(written),cwd:asOwnDisk(path.resolve(cwd)),home:asOwnDisk(path.resolve(home))};
  if((own.text!==written||own.cwd!==path.resolve(cwd)||own.home!==path.resolve(home))&&judge(own.text,own.cwd,own.home))return true;
  return judge(written,cwd,home);
}
function judge(expanded:string,cwd:string,home:string):boolean{
  /* still unresolved (an unset variable, the kernel's wildcard, a glob): judged by its last names, failing closed */
  if(UNRESOLVED.test(expanded)){
    /* sixth review (F6-1): with a known start (`.ssh/*` in the project, `~/.ssh/*`, `~/.*rc`), the start is resolved and the rest
       is matched as a pattern against the credentials' names — a project's own `.ssh/` is not the home's, and a glob in the home
       that could name a credential asks. Only an unknown start (an unset variable first) falls back to the last names. */
    const raw=expanded.split(/[\\/]+/u).filter(Boolean);const first=raw.findIndex(part=>UNRESOLVED.test(part));
    if(first>0||path.isAbsolute(expanded)){
      const start=path.resolve(cwd,raw.slice(0,first).join(path.sep)+path.sep);
      if(onAnotherComputer(start,home))return false;
      const realHome=real(path.resolve(home));const realStart=real(start);
      const pattern=raw.slice(first).map(part=>WIN?part.toLowerCase():part);
      const fromHome=path.relative(realHome,realStart);
      if(!fromHome.startsWith('..')&&!path.isAbsolute(fromHome))return patternNamesCredential([...segments(fromHome),...pattern]);
      /* a start above the home (`C:\Users\*\.npmrc`): the pattern must first walk down to the home, then name a credential */
      const down=path.relative(realStart,realHome);
      if(down.startsWith('..')||path.isAbsolute(down))return false;
      const steps=segments(down);
      return pattern.length>steps.length&&steps.every((step,index)=>segmentMatches(pattern[index]!,step))&&patternNamesCredential(pattern.slice(steps.length));
    }
    const known=segments(expanded).filter(part=>!UNRESOLVED.test(part));return credentialShape(known.slice(-2))||credentialShape(known.slice(-1));
  }
  const absolute=path.resolve(cwd,expanded);
  /* before every real path and stat below; the unresolved branch above never opens the text itself (only its start, guarded) */
  if(onAnotherComputer(absolute,home))return false;
  const relative=path.relative(real(path.resolve(home)),real(absolute));
  /* the desktop's owner decision of 16/10/2026 (fix/hard-link-ai-segreti): a project opened INSIDE a credential folder
     (~/.docker/my-project) reads its own files without a card — the project's files are its own, not the folder's credentials */
  const insideProject=(()=>{const fromRoot=path.relative(real(path.resolve(cwd)),real(absolute));return fromRoot!==''&&!fromRoot.startsWith('..')&&!path.isAbsolute(fromRoot);})();
  const rootInCredentialFolder=(()=>{const rootFromHome=path.relative(real(path.resolve(home)),real(path.resolve(cwd)));return rootFromHome!==''&&!rootFromHome.startsWith('..')&&!path.isAbsolute(rootFromHome)&&credentialShape(segments(rootFromHome));})();
  if(insideProject&&rootInCredentialFolder)return false;
  if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&credentialShape(segments(relative)))return true;
  return hardLinkToCredential(real(absolute),home);
}
/** Whether a shell command names one of this computer's login credentials in any of its words. */
export function commandNamesHomeCredential(command:string|undefined,{cwd,home=homedir(),environment=process.env}:{cwd:string;home?:string;environment?:NodeJS.ProcessEnv}):boolean{
  if(typeof command!=='string'||!command.trim())return false;
  /* every quoted part whole (a path with spaces), then every bare word */
  const quoted=[...command.matchAll(/"([^"]*)"|'([^']*)'/gu)].map(match=>match[1]??match[2]??'');
  const bare=command.split(/[\s;&|<>()=,"']+/u).map(word=>word.replace(/^[@+-]+(?=[^\s]*[\\/.~%$])/u,''));
  const words=[...quoted,...bare].filter(word=>word.length>1&&word.length<=1024);
  return words.slice(0,256).some(word=>isHomeCredential(word,{cwd,home,environment}));
}
/** 0.6.18, riga 206 (owner 20/11/2026 «Copri anche la shell ora»): whether a shell command SPELLS OUT a share on another computer
 *  (`\\computer\…`, `//computer/…`, the device and WebDAV spellings networkHost knows, PowerShell's `FileSystem::\\…` and `-Path:\\…`).
 *  The same cut of the words as the credential check above (every quoted part whole, then every bare word; 256 words of at most 1024
 *  characters). Text only: nothing is opened and no name is resolved; a URL (`https://computer/…`) is not a share. */
export function commandNamesAnotherComputer(command:string|undefined):boolean{
  if(typeof command!=='string'||!command.trim())return false;
  const quoted=[...command.matchAll(/"([^"]*)"|'([^']*)'/gu)].map(match=>match[1]??match[2]??'');
  const bare=command.split(/[\s;&|<>()=,"']+/u);
  const words=[...quoted,...bare].filter(word=>word.length>1&&word.length<=1024);
  return words.slice(0,256).some(word=>{
    const text=word.replace(/^[@+]+/u,'').replace(/^-[A-Za-z]+:(?=[\\/]{2})/u,'').replace(/^(?:[\w.]+\\)?FileSystem::/iu,'').replace(/\//gu,'\\');
    /* `\\computer` alone (net view, pushd) names the computer too */
    const host=networkHost(/^\\\\[^\\]+$/u.test(text)?text+'\\':text);
    return host!==null&&isAnotherComputer(host);
  });
}
export const HOME_CREDENTIAL_KERNEL_WILDCARD=KERNEL_WILDCARD;
