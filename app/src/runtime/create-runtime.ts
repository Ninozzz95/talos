import {homedir} from 'node:os';
import {join} from 'node:path';
import {findTalosRepoRoot} from './repo.ts';
import {ensureCliPaths,resolveCliPaths,type CliPaths} from '../paths.ts';
import {composeTalosRuntime} from './talos-composition.ts';
import {assertProjectTrusted} from '../security/project-trust-gate.ts';
import {createCliExecutionBroker} from '../security/execution-backends.ts';
import type {ExecutionBroker} from '../security/execution-broker.ts';
import {createUnbuildableExecutionBroker} from './brokered-executor.ts';
import {environmentKeyModeForEntry,type EnvironmentKeyMode} from '../provider/environment-keys.ts';
import {createRuntimeSupervisor} from './supervisor.ts';

/** ⛔ La forma che `composeTalosRuntime` accetta: il CLI si conforma alla composizione, mai il contrario. */
export type ExecutionBrokerFactory=(options:{paths:{cacheRoot:string};platform:NodeJS.Platform})=>ExecutionBroker;

/**
 * ⛔ Il default e' il broker VERO, per identita' e non per somiglianza.
 * `composeTalosRuntime` ha sempre accettato `brokerFactory`, e fino a questa fetta NESSUNO gliela
 * passava: i due ingressi qui sotto omettevano il campo, quindi ogni comando digitato finiva nel
 * ripiego e dichiarava «nessun broker configurato». Il collegamento sta QUI e non nella
 * composizione, perche' la composizione e' gia' parametrica: e' l'ingresso che non sceglieva.
 */
export const DEFAULT_EXECUTION_BROKER_FACTORY:ExecutionBrokerFactory=createCliExecutionBroker;

/**
 * Consegna alla composizione una fabbrica che costruisce il broker la PRIMA volta che la
 * composizione la chiama, e poi restituisce sempre la stessa istanza.
 *
 * ⛔ Perche' si costruisce DENTRO la chiamata della composizione e non qui: una revisione ha
 *   provato a costruire il broker e poi buttarlo via (mutazione M10), e le prove restavano verdi,
 *   perche' contavano le costruzioni e non chi le chiedeva. Adesso l'unico modo di costruirlo e'
 *   che la composizione lo chieda: costruito e raggiunto sono la stessa cosa.
 * ⛔ Perche' l'istanza e' una sola: il backend misura l'albero di processi al primo `available()`
 *   e memoizza quella misura per la sua vita. Una costruzione per comando rifarebbe la sonda ogni
 *   volta, e sarebbe un difetto di prestazioni invisibile, perche' il comando funzionerebbe lo stesso.
 *
 * ⛔⛔ E perche' il `try` esiste: la disponibilita' e' a prova di guasto in due versi OPPOSTI.
 *   Per l'ISOLAMENTO si chiude (un backend che non prova il suo confinamento non esegue niente:
 *   lo decide `execution-broker.ts`). Per l'ESECUZIONE si apre: se il broker non si riesce
 *   nemmeno a COSTRUIRE, il comando della persona gira lo stesso attraverso il kernel.
 * ⛔⛔ Ma NON in silenzio (revisione, round 2): prima questo `catch` restituiva «nessun broker» e la
 *   riga diceva «non configurato in questa build», anche per un TypeError di contratto. Ora il
 *   broker sostituto rifiuta ogni esecuzione portando il codice dell'errore vero, e la riga dice
 *   «the isolation broker could not be built (<codice>: <messaggio>)».
 */
export function resolveExecutionBrokerFactory(input:{brokerFactory?:ExecutionBrokerFactory}):{brokerFactory:ExecutionBrokerFactory}{
  const factory=input.brokerFactory??DEFAULT_EXECUTION_BROKER_FACTORY;
  let broker:ExecutionBroker|undefined;
  return{brokerFactory:(options)=>{
    if(broker)return broker;
    try{
      const built=factory(options);
      broker=built??createUnbuildableExecutionBroker(Object.assign(new TypeError('the broker factory returned no broker'),{code:'EXECUTION_BROKER_FACTORY_RETURNED_NOTHING'}));
    }catch(cause){
      broker=createUnbuildableExecutionBroker(cause);
    }
    return broker;
  }};
}

type Input={projectRoot:string;paths?:CliPaths;repoRoot?:string;model?:string;trustVerified?:boolean;brokerFactory?:ExecutionBrokerFactory;environmentKeys?:EnvironmentKeyMode;keyring?:Parameters<typeof composeTalosRuntime>[0]['keyring']};

/**
 * ⛔ `prepared` restituisce l'INTERO argomento di `composeTalosRuntime`, non dei pezzi da
 *   riassemblare due volte. Cosi' i due ingressi non possono divergere: una differenza fra loro e'
 *   il modo in cui una funzione finisce per esistere in un comando e non nell'altro, ed e' gia'
 *   successo in questo programma. Qui non c'e' un secondo posto dove sbagliarla.
 * ⛔ Il broker si costruisce DOPO il cancello della fiducia: un progetto non fidato non arriva
 *   nemmeno a toccare la cache delle prove.
 */
async function prepared(input:Input){
  const root=input.repoRoot??findTalosRepoRoot(process.cwd());
  const paths=input.paths??resolveCliPaths(process.env,process.platform,homedir());
  await ensureCliPaths(paths);
  if(!input.trustVerified)await assertProjectTrusted({projectRoot:input.projectRoot,trustRoot:paths.trust.projects});
  return{repoRoot:root,projectRoot:input.projectRoot,paths,model:input.model??'openai:gpt-5-mini',...(input.keyring!==undefined?{keyring:input.keyring}:{}),...resolveExecutionBrokerFactory(input)};
}
/**
 * ⭐ B1 slice 18 — WHO USES AN ENVIRONMENT KEY WITHOUT ASKING.
 * The ENTRY decides, and says so explicitly (fix round, condition 3): `main.ts` passes `consent` for the interactive screen and
 * `use` for `talos -p`; the one-shot commands that run a model pass `use` and state the key's origin; `talos provider` passes
 * `consent`. Measured by the coordinator before this round: with the subcommands left on this factory's default,
 * `talos research start` in CI with `OPENROUTER_API_KEY` set exited 2 and sent nothing.
 * ⛔ A caller that forgets to choose gets `consent` from both factories: the closed behaviour.
 * ⛔ `TALOS_ENVIRONMENT_KEYS=consent`, which the screen sets on every child it spawns, closes whatever the entry asked for; no
 *   value of that variable opens anything (`environmentKeyModeForEntry`).
 */
function entryMode(input:Input):EnvironmentKeyMode{return environmentKeyModeForEntry(input.environmentKeys??'consent',process.env);}
async function composeRuntimeContext(input:Input){
  return composeTalosRuntime({...await prepared(input),environmentKeys:entryMode(input)});
}
function supervisorRoot(input:Input){
  const paths=input.paths??resolveCliPaths(process.env,process.platform,homedir());
  return join(paths.dataRoot,'runtime-supervisor');
}
export async function createCliRuntime(input:Input){
  const initial=await composeRuntimeContext(input);
  return createRuntimeSupervisor({
    initialRuntime:initial.runtime,
    runtimeFactory:async()=> (await composeRuntimeContext(input)).runtime,
    journalRoot:supervisorRoot(input),
  });
}
export async function createCliRuntimeContext(input:Input){
  const initial=await composeRuntimeContext(input);
  const runtime=createRuntimeSupervisor({
    initialRuntime:initial.runtime,
    runtimeFactory:async()=> (await composeRuntimeContext(input)).runtime,
    journalRoot:supervisorRoot(input),
  });
  return{...initial,runtime};
}
