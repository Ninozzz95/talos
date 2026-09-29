/*
 * ⛔⛔⛔ F-012 + F-014 (audit ZIP revisione, 28/09/2026; piano 0.1.19 §1.5/§1.6, owner: «il modello
 * non vede gli agenti del workflow né ne verifica il progresso») — IL TESTO CHE IL MODELLO LEGGE
 * dei run dei Workflow. Le funzioni sono PURE: prendono la forma di `readRunState`/`listRunSummariesForSession`
 * (`store.mjs`) e i byte già letti dal CAS, e compongono le righe — la lettura vera (store, CAS,
 * control) sta in chi le chiama, così un test le esercita senza un negozio.
 *
 * La forma dei tagli è quella di `cerca` («… and N more paths not shown»): un tetto che morde si
 * DICHIARA, non si spaccia per la fine. La costante `NODE_OUTPUT_PREVIEW_MAX` è la stessa regola di
 * `PLANNED_TASK_PREVIEW_MAX` (`read-model.mjs`): l'anteprima di un risultato di nodo, al più
 * 2.000 caratteri (piano §1.6), il resto si chiede con `workflow_output`.
 *
 * ⛔ WF-HTTP-SECRET-OMISSION vale anche qui: dal testo NON escono `instructions` né `workspacePolicy`
 *   dei passi (i percorsi della macchina), come ogni vista pubblica di un run. Solo fatti pubblici:
 *   stato, conteggi, tempi, label e i ref degli output.
 *
 * ⛔⛔ `creaOnWorkflowFn` (in fondo) è l'UNICA parte impura: la fabbrica che il server compone con lo
 *   store vero e l'orchestratore (`requestRunControl` + `scheduler.sveglia`, le funzioni GIÀ
 *   esistenti che usano le rotte di `http-app.mjs` — stessa logica di dominio, zero nuova). Ogni
 *   run chiesto si verifica DELLA SESSIONE che chiama (come la rotta: `events[0].payload.rootSessionId`):
 *   il modello di una sessione non vede né guida i run di un'altra.
 */
import { randomUUID } from 'node:crypto';

import { listRunSummariesForSession, readRunState } from './store.mjs';
import { readResultBytes } from './result-store.mjs';
import { decodeWorkflowResultText, selectWorkflowResult } from './output-access.mjs';

/* La costante dell'anteprima vive nel read-model, accanto a PLANNED_TASK_PREVIEW_MAX («stessa
   regola», piano §1.6); qui si RIESPORTA perché è il canale del modello a dichiararla. */
export { NODE_OUTPUT_PREVIEW_MAX } from './read-model.mjs';

/** Il tetto di caratteri che `workflow_output` mostra per pagina (default 4.000: la stessa taglia
 *  che il kernel usa per le uscite degli attrezzi; massimo 16.000, il tetto delle letture di sezione). */
export const OUTPUT_PAGINA_DEFAULT = 4_000;
export const OUTPUT_PAGINA_MAX = 16_000;

const TERMINALI = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
/* L'ordine dei conteggi è la lettura del piano («passi ok/ko»): prima chi è riuscito, poi chi è
   fallito, poi tutto il resto — chi legge decide in una riga se il run cammina o zoppica. */
const STATI_ORDINE = ['succeeded', 'failed', 'uncertain', 'waiting_human', 'reconciling', 'leased', 'running', 'pending', 'blocked', 'ready', 'retry_wait', 'cancelled', 'skipped', 'superseded'];

function righeConteggi(nodes) {
    const conteggi = new Map();
    for (const node of nodes.values()) {
        const stato = node?.state ?? 'pending';
        conteggi.set(stato, (conteggi.get(stato) ?? 0) + 1);
    }
    return [...conteggi.entries()]
        .sort((a, b) => STATI_ORDINE.indexOf(a[0]) - STATI_ORDINE.indexOf(b[0]) || a[0].localeCompare(b[0], 'en'))
        .map(([stato, n]) => `${n} ${stato}`);
}

function secondiFra(dopo, prima) {
    const ms = Date.parse(dopo) - Date.parse(prima);
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/**
 * Il dettaglio di UN run per il modello: stato, passi, passo corrente, avvio/durata e l'`outputRef`
 * di ogni nodo concluso — con la FRASE che dice la strada (piano §1.6): «read the full output with
 * workflow_output(runId, nodeId)». L'input è la forma di `readRunState(store, {runId})`.
 * @param {{state:object, events:Array}} input
 */
export function dettaglioRunPerIlModello(input) {
    const state = input?.state ?? {};
    const events = Array.isArray(input?.events) ? input.events : [];
    const run = state.run ?? {};
    const runId = run.runId ?? '(unknown run)';
    const nodes = state.nodes instanceof Map ? state.nodes : new Map();
    const refs = state.resultRefs instanceof Map ? state.resultRefs : new Map();
    const etichetta = (nodeId) => state.definition?.nodes?.find((n) => n.id === nodeId)?.label ?? nodeId;

    const righe = [];
    const richieste = [run.pauseRequested ? 'pause requested' : null, run.cancelRequested ? 'cancel requested' : null].filter(Boolean);
    righe.push(`run ${runId} — ${run.status ?? 'unknown'}${richieste.length > 0 ? ` (${richieste.join(', ')})` : ''}`);
    const avvio = events[0]?.at ?? null;
    const fine = events.at(-1)?.at ?? null;
    if (avvio) righe.push(`started ${avvio}${fine && fine !== avvio ? `, ${secondiFra(fine, avvio)} s so far` : ''}`);
    const conteggi = righeConteggi(nodes);
    righe.push(`steps: ${nodes.size} — ${conteggi.join(', ')}`);
    const correnti = [...nodes.values()].filter((n) => !TERMINALI.has(n?.state ?? 'pending'));
    if (correnti.length > 0) {
        righe.push('', 'current steps:');
        for (const n of correnti) righe.push(`  ${n.nodeId} (${etichetta(n.nodeId)}) — ${n.state}`);
    }
    const conclusi = [...nodes.values()].filter((n) => (n?.resultRefIds ?? []).length > 0);
    if (conclusi.length === 0) {
        righe.push('', 'no node has finished yet: there is no output to read. Ask again with workflow_status when a step completes.');
    } else {
        righe.push('', 'finished steps and their outputs:');
        for (const n of conclusi) {
            righe.push(`  ${n.nodeId} (${etichetta(n.nodeId)}) — ${n.state}`);
            for (const id of n.resultRefIds) {
                const ref = refs.get(id);
                if (!ref) continue;
                righe.push(`    outputRef ${ref.id}: ${ref.sha256} (${ref.bytes} bytes, ${ref.kind}, ${ref.contentType})`);
            }
            righe.push(`    read the full output with workflow_output(${JSON.stringify(runId)}, ${JSON.stringify(n.nodeId)})`);
        }
    }
    return righe.join('\n');
}

/**
 * L'elenco dei run della sessione per il modello (input: `listRunSummariesForSession`).
 * @param {Array<{runId:string, createdAt:string, workflowId:string, version:string, status:string}>} runs
 */
export function elencoRunPerIlModello(runs) {
    if (!Array.isArray(runs) || runs.length === 0) {
        return 'no workflow runs in this session yet. When one starts, ask again with workflow_status (no arguments) to list them, or with a runId for its detail.';
    }
    return runs.map((r) => `- ${r.runId} — ${r.status ?? 'unknown'}, started ${r.createdAt ?? '?'}`
        + (r.workflowId ? ` (workflow ${r.workflowId}${r.version ? ` v${r.version}` : ''})` : '')).join('\n');
}

/**
 * La pagina dell'output di un nodo, col taglio DICHIARATO alla maniera di `cerca`.
 * `testo` è l'output integrale già decodificato (chi chiama ha letto i byte dal CAS e li ha
 * verificati); `offset`/`limit` sono i caratteri (punti di codice) richiesti dal modello.
 * @param {{runId:string, nodeId:string, sha256:string, bytes:number, testo:string, offset?:number, limit?:number}} pagina
 */
export function letturaOutputPerIlModello({ runId, nodeId, sha256, bytes, testo, offset = 0, limit = OUTPUT_PAGINA_DEFAULT } = {}) {
    const intero = String(testo ?? '');
    const caratteri = [...intero];
    const da = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const tetto = Number.isSafeInteger(limit) && limit >= 1 ? Math.min(limit, OUTPUT_PAGINA_MAX) : OUTPUT_PAGINA_DEFAULT;
    const testa = `output of node ${JSON.stringify(nodeId)} (run ${runId}) — ${sha256}, ${bytes ?? caratteri.length} bytes total.\n`
        + `showing ${Math.min(tetto, Math.max(0, caratteri.length - da))} of ${caratteri.length} characters, from offset ${da}.`;
    if (da >= caratteri.length) {
        return `${testa}\n\n(the offset is at or past the end: nothing more to show)`;
    }
    const pagina = caratteri.slice(da, da + tetto).join('');
    const restanti = caratteri.length - da - pagina.length;
    return `${testa}\n\n${pagina}${restanti > 0 ? `\n\n… and ${restanti} more characters` : ''}`;
}

/* ─────────────────── la fabbrica impura: la catena server → registro → kernel ─────────────────── */

/** Il run chiesto, verificato DELLA sessione che chiama — stessa guardia della rotta (`http-app.mjs`). */
async function runDellaSessione(store, runId, rootSessionId) {
    const input = await readRunState(store, { runId });
    const nato = input.events[0];
    if (nato?.type !== 'run_created' || nato.payload.rootSessionId !== rootSessionId) {
        throw Object.assign(new Error(`run ${runId} was not found in this session`), { code: 'WORKFLOW_RUN_NOT_FOUND' });
    }
    return input;
}

/** Accesso del passo: identità interna e associazione nel journal, mai il taskId o testo del prompt. */
async function runDelPasso(store, runId, nodeId, step) {
    const negato = () => Object.assign(new Error('workflow output is not available to this step'), { code: 'WORKFLOW_STEP_OUTPUT_FORBIDDEN' });
    if (!step || runId !== step.runId || typeof step.sessionId !== 'string') throw negato();
    const input = await readRunState(store, { runId });
    if (input.events[0]?.type !== 'run_created' || !input.events[0].payload.rootSessionId) throw negato();
    const owned = input.events.some((event) => event.type === 'agent_session_created'
        && event.nodeId === step.nodeId && event.activityExecutionId === step.activityExecutionId
        && event.attempt === step.attempt && event.leaseId === step.leaseId
        && event.leaseEpoch === step.leaseEpoch && event.payload.sessionId === step.sessionId);
    if (!owned) throw negato();
    const direct = input.state.definition?.edges?.some((edge) => edge.from === nodeId
        && edge.to === step.nodeId && edge.type !== 'retry');
    if (!direct || input.state.nodes.get(nodeId)?.state !== 'succeeded'
        || !input.events.some((event) => event.type === 'node_succeeded' && event.nodeId === nodeId)) throw negato();
    return input;
}

/**
 * ⛔⛔ F-012 (piano §1.5): il canale dei TRE attrezzi (`onWorkflowFn` del kernel). La compone il
 * server (`server.mjs`) con lo store e il runtime vero; il registro la lega alla sessione
 * (`rootSessionId`); il kernel la chiama con nome e argomenti del modello. Le azioni di control
 * passano per `requestRunControl` (ricevuta durevole, deduplicazione per commandId) e svegliano
 * lo scheduler — esattamente come la rotta `POST .../workflows/:runId/(pause|resume|cancel)`.
 *
 * @param {{store:object, runtimeFn:function}} dipendenze — `runtimeFn` è ritardato di proposito:
 *   l'orchestratore nasce DOPO il registro (l'adattatore dei passi vuole il registro), e la
 *   chiusura lo legge quando serve, non quando si costruisce.
 */
export function creaOnWorkflowFn({ store, runtimeFn } = {}) {
    if (!store) throw new Error('creaOnWorkflowFn needs the workflow store');
    return async function onWorkflowFn(nome, argomenti = {}, { rootSessionId, workflowStep } = {}) {
        if (workflowStep && nome !== 'workflow_output') {
            throw Object.assign(new Error('workflow steps may only read predecessor outputs'), { code: 'WORKFLOW_STEP_TOOL_FORBIDDEN' });
        }
        if (nome === 'workflow_status') {
            if (!argomenti?.runId) return elencoRunPerIlModello(await listRunSummariesForSession(store, { rootSessionId }));
            return dettaglioRunPerIlModello(await runDellaSessione(store, String(argomenti.runId), rootSessionId));
        }
        if (nome === 'workflow_output') {
            const runId = String(argomenti?.runId ?? '');
            const nodeId = String(argomenti?.nodeId ?? '');
            const input = workflowStep
                ? await runDelPasso(store, runId, nodeId, workflowStep)
                : await runDellaSessione(store, runId, rootSessionId);
            const selected = selectWorkflowResult(input, { runId, nodeId, resultId: argomenti?.resultId });
            if (selected.kind === 'absent') {
                return `node ${nodeId} of run ${runId} has no recorded output (its state is "${selected.node.state}").`
                    + (selected.node.state === 'succeeded' ? ' This step finished without publishing results.' : ' Ask again with workflow_status when it finishes.');
            }
            if (selected.kind === 'index') {
                return `node ${nodeId} of run ${runId} has ${selected.results.length} recorded outputs. Choose one with resultId:\n`
                    + selected.results.map((item) => `- ${item.resultId}: ${item.kind}, ${item.contentType}, ${item.bytes} bytes; ${JSON.stringify(item.summary)}`).join('\n');
            }
            const ref = selected.ref;
            const bytes = await readResultBytes({ workflowDataRoot: store.root, sha256: ref.sha256, maxBytes: store.resultLimits.maxItemBytes });
            const decoded = decodeWorkflowResultText(ref, bytes);
            if (decoded.text === null) {
                return `output ${ref.id} of node ${nodeId} (run ${runId}) is ${decoded.reason}; ${ref.kind}, ${ref.contentType}, ${ref.bytes} bytes, ${ref.sha256}. The bytes were not decoded. Download explicitly with format=raw and resultId=${ref.id} from the Board.`;
            }
            const pagina = letturaOutputPerIlModello({
                runId, nodeId, sha256: ref.sha256, bytes: ref.bytes, testo: decoded.text,
                offset: argomenti?.offset, limit: argomenti?.limit,
            });
            return `resultId ${ref.id}\n${pagina}`;
        }
        if (nome === 'workflow_control') {
            const azione = String(argomenti?.azione ?? '');
            if (!['pause', 'resume', 'cancel'].includes(azione)) {
                return 'azione must be one of "pause", "resume" or "cancel". Nothing was changed.';
            }
            const runId = String(argomenti?.runId ?? '');
            await runDellaSessione(store, runId, rootSessionId);
            const runtime = typeof runtimeFn === 'function' ? runtimeFn() : null;
            if (!runtime) return 'the workflow runtime is not available right now: the run cannot be controlled from here. Nothing was changed.';
            const esito = await runtime.orchestrator.requestRunControl({ runId, action: azione, commandId: randomUUID() });
            runtime.scheduler.sveglia(runId);
            const pausa = azione === 'pause' && esito.status === 'running'
                ? ' The pause takes effect when the steps in flight finish.' : '';
            return `${azione} accepted on run ${runId}. Run status: ${esito.status}.${pausa}`
                + (esito.deduplicated ? ' (this command was already applied: nothing changed.)' : '');
        }
        throw new Error(`unknown workflow tool ${nome}`);
    };
}
