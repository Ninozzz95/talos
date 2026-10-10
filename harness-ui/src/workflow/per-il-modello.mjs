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

import { azioniConsentiteDelRun, motiviDiAttenzioneDelRun } from './azioni-del-run.mjs';
import { STATI_FINALI_DEL_PASSO, STATI_FINALI_DEL_RUN } from './stati-finali.mjs';
import { listRunSummariesForSession, readRunState } from './store.mjs';
import { readResultBytes } from './result-store.mjs';
import { decodeWorkflowResultText, selectWorkflowResult } from './output-access.mjs';

/** Le azioni che `workflow_control` accetta dal modello: la stessa lista per il rifiuto e per `workflow_status`. */
const AZIONI_DEL_MODELLO = Object.freeze(['pause', 'resume', 'cancel']);

/* La costante dell'anteprima vive nel read-model, accanto a PLANNED_TASK_PREVIEW_MAX («stessa
   regola», piano §1.6); qui si RIESPORTA perché è il canale del modello a dichiararla. */
export { NODE_OUTPUT_PREVIEW_MAX } from './read-model.mjs';
import { NODE_OUTPUT_PREVIEW_MAX } from './read-model.mjs';

/** Il tetto di caratteri che `workflow_output` mostra per pagina (default 4.000: la stessa taglia
 *  che il kernel usa per le uscite degli attrezzi; massimo 16.000, il tetto delle letture di sezione). */
export const OUTPUT_PAGINA_DEFAULT = 4_000;
export const OUTPUT_PAGINA_MAX = 16_000;

const TERMINALI = new Set(STATI_FINALI_DEL_PASSO);
/* L'ordine dei conteggi è la lettura del piano («passi ok/ko»): prima chi è riuscito, poi chi è
   fallito, poi tutto il resto — chi legge decide in una riga se il run cammina o zoppica. */
const STATI_ORDINE = ['succeeded', 'failed', 'uncertain', 'waiting_human', 'reconciling', 'leased', 'running', 'pending', 'blocked', 'ready', 'retry_wait', 'cancelled', 'skipped', 'superseded', 'set_aside'];

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
/* ⛔ AUDIT29-RUN-DURATION (30/09/2026): un run bloccato da ~24 ore diceva «716 s so far» — era il tempo dal primo all'ULTIMO
   evento, chiamato «so far». Concluso ⇒ inizio, fine, durata. In corso (anche in pausa o in attesa) ⇒ da quanto è partito e da
   quanto non succede niente, all'ora di QUESTA chiamata, come Hermes (`tools/process_registry.py:1950`, `uptime_seconds =
   time.time() - started_at`). Mai un «tempo attivo»: le pause non hanno un fatto che le misuri, e sommarle sarebbe inventare.
   La UI non passa di qui: là il tempo lo calcola chi guarda (D27, `read-model.mjs`). Prove: RUN-DURATION-01..03. */
const RUN_CONCLUSI = new Set(STATI_FINALI_DEL_RUN);

/* C3 (09/10/2026): le azioni della PERSONA su un passo fallito, dette al modello perché le proponga a chi gli parla — ma non sono
   del suo attrezzo (`workflow_control` ha pause/resume/cancel): decisione owner, contratto C3 §2. */
const AZIONI_DELLA_PERSONA = 'the person can retry the failed steps from the Workflow panel, or, on one failed step, mark it done'
  + ' (with a summary of what was done), set it aside (the steps waiting for it will not start) or redo it with another model';
// C3 tappa 3 (09/10/2026): il tetto del run lo alza solo la PERSONA, dal pannello, con la cifra detta prima
const TETTO_DELLA_PERSONA = 'the run has reached its budget ceiling: only the person can raise it, from the Workflow panel, and the run then goes on';

function rigaDelTempo(run, avvio, fine, adesso) {
    if (RUN_CONCLUSI.has(run.status)) {
        return `started ${avvio}${fine && fine !== avvio ? `, ended ${fine} (${secondiFra(fine, avvio)} s)` : ''}`;
    }
    const dallAvvio = secondiFra(adesso, avvio);
    const partenza = `started ${avvio}${dallAvvio !== null ? ` (${dallAvvio} s ago)` : ''}`;
    const dallUltima = fine && fine !== avvio ? secondiFra(adesso, fine) : null;
    const ultima = fine && fine !== avvio ? `; last activity ${fine}${dallUltima !== null ? ` (${dallUltima} s ago)` : ''}` : '';
    return `${partenza}${ultima} — as of ${adesso}`;
}

export function dettaglioRunPerIlModello(input, { adesso = new Date().toISOString() } = {}) {
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
    // A10 (07/10/2026): che cosa vale adesso, e perché il run aspetta — prima ancora di provare un controllo
    // ⛔ Al modello si elencano solo le azioni del SUO attrezzo (workflow_control): `retry` è della persona, dal pannello.
    const ammesse = azioniConsentiteDelRun(state);
    const azioni = ammesse.filter((a) => AZIONI_DEL_MODELLO.includes(a));
    const motivi = motiviDiAttenzioneDelRun(run);
    righe.push(`allowed actions now: ${azioni.length > 0 ? azioni.join(', ') : 'none'}`
      + (ammesse.includes('retry') ? `; ${AZIONI_DELLA_PERSONA}` : '')
      + (motivi.includes('budget_overrun') ? `; ${TETTO_DELLA_PERSONA}` : '')
      + (motivi.length > 0 ? `; needs attention because: ${motivi.join(', ')}` : ''));
    const avvio = events[0]?.at ?? null;
    const fine = events.at(-1)?.at ?? null;
    if (avvio) righe.push(rigaDelTempo(run, avvio, fine, adesso));
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

/*
 * ⭐ C3b (owner 09/10/2026 sera, «Risvegliare il padre a fine run» e «anche a Serve attenzione») — L'ESITO che sveglia il padre:
 *   i fatti pubblici del run (come `dettaglioRunPerIlModello`: mai `instructions` né `workspacePolicy`) e, per ogni passo che ha
 *   pubblicato un risultato, il suo `summary` registrato (≤4.096 caratteri per contratto), tagliato a NODE_OUTPUT_PREVIEW_MAX con
 *   il taglio DICHIARATO nella nota. Il testo lo avvolge `testoDellEsitoWorkflow` (confine dei dati): qui solo i campi.
 * ⛔ La nota NON invita a chiedere `workflow_status`: l'esito È lo stato. Hermes, nel messaggio di risveglio: il risultato
 *   «re-enters the conversation as a new message» e «Do not poll» (`tools/delegate_tool_dispatch.py:325-327`).
 */
export const PASSI_NELL_ESITO_MAX = 50;
export function esitoDelRunPerIlPadre(input) {
    const state = input?.state ?? {};
    const run = state.run ?? {};
    const runId = run.runId ?? '(unknown run)';
    const nodes = state.nodes instanceof Map ? [...state.nodes.values()] : [];
    const refs = state.resultRefs instanceof Map ? state.resultRefs : new Map();
    const etichetta = (nodeId) => state.definition?.nodes?.find((n) => n.id === nodeId)?.label ?? nodeId;
    let tagliati = 0;
    const passi = nodes.slice(0, PASSI_NELL_ESITO_MAX).map((node) => {
        const ref = (node.resultRefIds ?? []).map((id) => refs.get(id)).find(Boolean);
        const caratteri = typeof ref?.summary === 'string' ? Array.from(ref.summary) : [];
        if (caratteri.length > NODE_OUTPUT_PREVIEW_MAX) tagliati += 1;
        const riassunto = caratteri.length > NODE_OUTPUT_PREVIEW_MAX
            ? `${caratteri.slice(0, NODE_OUTPUT_PREVIEW_MAX - 1).join('').trimEnd()}…` : caratteri.join('');
        return { nodeId: node.nodeId, etichetta: etichetta(node.nodeId), stato: node.state ?? 'pending', ...(riassunto ? { riassunto } : {}) };
    });
    const motivi = motiviDiAttenzioneDelRun(run);
    const frasi = [];
    if (run.status === 'needs_attention') {
        frasi.push('The run is waiting for the person (it needs attention).');
        if (azioniConsentiteDelRun(state).includes('retry')) frasi.push(`${AZIONI_DELLA_PERSONA[0].toUpperCase()}${AZIONI_DELLA_PERSONA.slice(1)}.`);
        if (motivi.includes('budget_overrun')) frasi.push(`${TETTO_DELLA_PERSONA[0].toUpperCase()}${TETTO_DELLA_PERSONA.slice(1)}.`);
    } else {
        frasi.push(`The run is over (${run.status ?? 'unknown'}).`);
    }
    frasi.push(`Each step shows at most ${NODE_OUTPUT_PREVIEW_MAX} characters of its output`
        + (tagliati > 0 ? ` (${tagliati} cut here)` : '')
        + `: read a full output with workflow_output(${JSON.stringify(runId)}, nodeId).`);
    if (nodes.length > PASSI_NELL_ESITO_MAX) frasi.push(`Only the first ${PASSI_NELL_ESITO_MAX} steps of ${nodes.length} are listed here.`);
    frasi.push('Tell the person the outcome in a few lines.');
    return { runId, titolo: String(state.definition?.title ?? ''), stato: run.status ?? 'unknown', motiviAttenzione: motivi, passi, nota: frasi.join(' ') };
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
    /* C12 (coda Codex, bugfixer 10/10/2026): il resto si conta nella STESSA unità del taglio, i punti di codice. Prima sottraeva
       `pagina.length` della stringa unita, cioè unità UTF-16 (un'emoji vale 2): con «😀😀😀» e limit 2 il resto veniva −1 e il
       modello credeva di aver letto tutto. Come Codex (`utils/string/src/truncate.rs:43,86-117`, `chars()` per totale e tolto). */
    const fetta = caratteri.slice(da, da + tetto);
    const restanti = caratteri.length - da - fetta.length;
    return `${testa}\n\n${fetta.join('')}${restanti > 0 ? `\n\n… and ${restanti} more characters` : ''}`;
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
            if (!AZIONI_DEL_MODELLO.includes(azione)) {
                return 'azione must be one of "pause", "resume" or "cancel". Nothing was changed.';
            }
            const runId = String(argomenti?.runId ?? '');
            await runDellaSessione(store, runId, rootSessionId);
            const runtime = typeof runtimeFn === 'function' ? runtimeFn() : null;
            if (!runtime) return 'the workflow runtime is not available right now: the run cannot be controlled from here. Nothing was changed.';
            let esito;
            try { esito = await runtime.orchestrator.requestRunControl({ runId, action: azione, commandId: randomUUID() }); }
            catch (errore) {
                /* ⛔ A10 (07/10/2026) — il rifiuto dice al MODELLO che cosa può usare LUI adesso (questo attrezzo ha solo
                   pause/resume/cancel) e perché il run aspetta; `retry` è della persona, dal pannello Workflow. */
                /* ⛔ Il motivo si legge dal CAMPO `refusalReason`, mai tagliando il messaggio: il messaggio porta anche
                   «Allowed actions now: …» con `retry`, che al modello non va proposto (review A10, mutante M6). */
                if (errore?.code !== 'WORKFLOW_RUN_STATE_CONFLICT' || !Array.isArray(errore.allowedActions)
                    || typeof errore.refusalReason !== 'string') throw errore;
                const motivo = errore.refusalReason;
                const usabili = errore.allowedActions.filter((a) => AZIONI_DEL_MODELLO.includes(a));
                const motivi = Array.isArray(errore.attentionReasons) ? errore.attentionReasons : [];
                return `${motivo}. Nothing was changed. You can use now: ${usabili.length > 0 ? usabili.join(', ') : 'nothing'}.`
                    + (errore.allowedActions.includes('retry') ? ` Also, ${AZIONI_DELLA_PERSONA}.` : '')
                    + (motivi.includes('budget_overrun') ? ` Also, ${TETTO_DELLA_PERSONA}.` : '')
                    + (motivi.length > 0 ? ` The run needs attention because: ${motivi.join(', ')}.` : '');
            }
            runtime.scheduler.sveglia(runId);
            const pausa = azione === 'pause' && esito.status === 'running'
                ? ' The pause takes effect when the steps in flight finish.' : '';
            return `${azione} accepted on run ${runId}. Run status: ${esito.status}.${pausa}`
                + (esito.deduplicated ? ' (this command was already applied: nothing changed.)' : '');
        }
        throw new Error(`unknown workflow tool ${nome}`);
    };
}
