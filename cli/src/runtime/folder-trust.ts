import path from 'node:path';

/*
 * R2-F1 of the Desktop's permissions review 2 (cure 208 bis, 04-06/11/2026): the folder's trust is read again at every turn, not
 * once at the start. The kernel's registry asks `fiduciaDellaCartellaFn(folder)` where the mode is chosen, at every turn and at every
 * tool call (session-registry.mjs `cartellaNonFidata`), so the answer must be synchronous and touch no disk: it is this cache.
 * `null` = not asked (today's behaviour: the session's own sign decides), `false` = not trusted (the person's «No», or trust taken
 * away while the conversation was open), `true` = trusted. The cache is refreshed from the trust store before every person's send.
 * Codex reads the project's trust level from its config when a turn's settings are built (`core/src/config/mod.rs`), and
 * `set_project_trust_level` changes it for the next turn (`thread_processor.rs:1479-1505`); the Desktop's server reads its store
 * (fiducia-cartelle.mjs `opzioniFiduciaPerIlRegistro`).
 */
export type FolderTrust=boolean|null;
export type FolderTrustCache={
  /** for the kernel's registry: synchronous, no disk. Another folder than this process's project is not ours to say: null. */
  forFolder(folder:string):FolderTrust;
  /** the value now, for the CLI's own permission engine */
  current():FolderTrust;
  /** read the source again (before a person's send) */
  refresh():Promise<FolderTrust>;
};

const key=(folder:string)=>{const resolved=path.resolve(folder);return process.platform==='win32'?resolved.toLowerCase():resolved;};

/**
 * `saidNo`: the person answered «No» at the start (form B): the folder stays untrusted for the whole process (/trust starts TALOS
 * again). `read`: is the folder trusted now. A source that answers «not trusted» turns a trusted folder untrusted (trust taken
 * away); a folder never trusted stays «not asked», as before this cure. A source that fails counts as «not trusted», the
 * kernel's own rule for a failing source (session-registry.mjs, «Un errore della fonte vale non fidata»).
 */
export function createFolderTrustCache({projectRoot,saidNo=false,read}:{projectRoot:string;saidNo?:boolean;read:()=>Promise<boolean>}):FolderTrustCache{
  const own=key(projectRoot);
  let value:FolderTrust=saidNo?false:null;
  return{
    forFolder:(folder:string)=>typeof folder==='string'&&key(folder)===own?value:null,
    current:()=>value,
    async refresh(){
      if(saidNo)return value;
      let trusted:boolean;try{trusted=(await read())===true;}catch{trusted=false;}
      value=trusted?true:value===null?null:false;
      return value;
    },
  };
}
