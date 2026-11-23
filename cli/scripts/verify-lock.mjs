import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

/* A dependency is pinned to an exact version, or to an https tarball URL (xlsx comes from cdn.sheetjs.com). npm locks a URL dependency by the row's
   `resolved` URL with an `integrity` hash; the row's `version` is then the package's own number, never the URL
   (docs.npmjs.com/cli/configuring-npm/package-lock-json, "resolved" and "integrity"). Owner 09/10/2026: the release robot runs this check. */
const TARBALL_URL=/^https:\/\/[^\s]+\.tgz$/u;
export function verifyLock(pkg,lock){
  if(lock.lockfileVersion!==3)throw new Error('CLI_LOCKFILE_VERSION_INVALID');
  const root=lock.packages?.[''];if(!root)throw new Error('CLI_LOCKFILE_ROOT_MISSING');
  const exact=(section)=>{for(const [name,spec] of Object.entries(pkg[section]??{})){
    const url=typeof spec==='string'&&TARBALL_URL.test(spec);
    if(typeof spec!=='string'||(!url&&/^[~^*><=]|\s\|\||\s+-\s+|\bx\b|:/iu.test(spec)))throw new Error(`CLI_DEPENDENCY_NOT_PINNED:${name}`);
    if(root[section]?.[name]!==spec)throw new Error(`CLI_LOCKFILE_MISMATCH:${name}`);
    const row=lock.packages?.[`node_modules/${name}`];
    if(!row||(url?row.resolved!==spec:row.version!==spec))throw new Error(`CLI_LOCKFILE_PACKAGE_MISMATCH:${name}`);
    if(url&&!(typeof row.integrity==='string'&&/^sha512-/u.test(row.integrity)))throw new Error(`CLI_LOCKFILE_INTEGRITY_MISSING:${name}`);
  }};
  exact('dependencies');exact('devDependencies');
  for(const name of Object.keys(root.dependencies??{}))if(!(name in (pkg.dependencies??{})))throw new Error(`CLI_LOCKFILE_EXTRA_DEPENDENCY:${name}`);
  for(const name of Object.keys(root.devDependencies??{}))if(!(name in (pkg.devDependencies??{})))throw new Error(`CLI_LOCKFILE_EXTRA_DEV_DEPENDENCY:${name}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
  verifyLock(pkg,lock);
  console.log('cli lockfile: verified');
}
