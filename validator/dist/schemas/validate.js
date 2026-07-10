import { ZodError } from 'zod';
import { JmpMutationSchema } from './mutations.js';
import { NodeDefinitionSchema } from './nodes.js';
import { BrowserCommandSchema } from './browserCommands.js';
function mapZodError(error) {
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        expected: String(issue.expected ?? 'unknown'),
        received: String(issue.received ?? 'undefined'),
        message: issue.message,
    }));
}
function makeFault(field, expected, received, message) {
    return { field, expected, received, message };
}
export function validateMutations(mutations, context, allowedNodeTypes, allowedBrowserOperations, browserModeEnabled = false) {
    const allFaults = [];
    const allowedNodeTypeSet = Array.isArray(allowedNodeTypes) ? new Set(allowedNodeTypes) : null;
    if (browserModeEnabled) {
        if (!allowedNodeTypeSet) {
            return { valid: false, errors: [makeFault('allowed_node_types', 'an explicit server node allowlist containing BROWSER_COMMAND', 'node allowlist omitted', 'Browse mode requires an authoritative server node allowlist.')] };
        }
        if (!Array.isArray(allowedBrowserOperations) || allowedBrowserOperations.length === 0) {
            return { valid: false, errors: [makeFault('allowed_browser_operations', 'a non-empty server browser operation allowlist', Array.isArray(allowedBrowserOperations) ? 'empty operation allowlist' : 'operation allowlist omitted', 'Browse mode requires a non-empty authoritative server operation allowlist.')] };
        }
        const spawns = mutations.filter((mutation) => Boolean(mutation)
            && typeof mutation === 'object'
            && mutation.action === 'SPAWN_NODE');
        const payloads = mutations.filter((mutation) => Boolean(mutation)
            && typeof mutation === 'object'
            && mutation.action === 'MUTATE_PAYLOAD');
        const spawn = spawns[0];
        const payload = payloads[0];
        if (mutations.length !== 2
            || spawns.length !== 1
            || payloads.length !== 1
            || spawn?.node_type !== 'BROWSER_COMMAND'
            || typeof spawn?.node_id !== 'string'
            || payload?.node_id !== spawn.node_id) {
            return {
                valid: false,
                errors: [makeFault('mutations', 'exactly one BROWSER_COMMAND spawn and one matching payload mutation', `${mutations.length} mutations`, 'Browse mode is planner-only and accepts exactly one typed browser command plan.')],
            };
        }
    }
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        const parsed = JmpMutationSchema.safeParse(mutation);
        if (!parsed.success) {
            const faults = mapZodError(parsed.error).map((f) => ({
                ...f,
                field: `mutations[${i}].${f.field}`,
            }));
            allFaults.push(...faults);
            continue;
        }
        if (parsed.data.action === 'SPAWN_NODE' && browserModeEnabled && parsed.data.node_type !== 'BROWSER_COMMAND') {
            allFaults.push(makeFault(`mutations[${i}].node_type`, 'BROWSER_COMMAND', parsed.data.node_type, 'Browse mode is planner-only and rejects non-browser execution intents.'));
            continue;
        }
        if (parsed.data.action === 'SPAWN_NODE' && parsed.data.node_type === 'BROWSER_COMMAND' && !browserModeEnabled) {
            allFaults.push(makeFault(`mutations[${i}].node_type`, 'Browse mode enabled', 'BROWSER_COMMAND', 'Browser commands require Browse mode to be enabled for this run.'));
            continue;
        }
        if (parsed.data.action === 'SPAWN_NODE'
            && parsed.data.node_type === 'BROWSER_COMMAND'
            && !allowedNodeTypeSet) {
            allFaults.push(makeFault(`mutations[${i}].node_type`, 'BROWSER_COMMAND in an explicit server node allowlist', 'node allowlist omitted', 'Browse mode requires an authoritative server node allowlist.'));
            continue;
        }
        if (parsed.data.action === 'SPAWN_NODE'
            && parsed.data.node_type === 'BROWSER_COMMAND'
            && browserModeEnabled
            && (!Array.isArray(allowedBrowserOperations) || allowedBrowserOperations.length === 0)) {
            allFaults.push(makeFault(`mutations[${i}].node_type`, 'a non-empty server browser operation allowlist', Array.isArray(allowedBrowserOperations) ? 'empty operation allowlist' : 'operation allowlist omitted', 'Browse mode requires a non-empty authoritative server operation allowlist.'));
            continue;
        }
        if (parsed.data.action === 'SPAWN_NODE'
            && allowedNodeTypeSet
            && !allowedNodeTypeSet.has(parsed.data.node_type)) {
            allFaults.push(makeFault(`mutations[${i}].node_type`, `one of: ${Array.from(allowedNodeTypeSet).join(', ') || 'none'}`, parsed.data.node_type, `Tool "${parsed.data.node_type}" is not available in the TALOS registry planning context.`));
            continue;
        }
        if (parsed.data.action === 'MUTATE_PAYLOAD') {
            const nodeId = parsed.data.node_id;
            const nodeType = context[nodeId];
            if (!nodeType) {
                allFaults.push(makeFault(`mutations[${i}].node_id`, 'node_id present in context', nodeId, `Node "${nodeId}" not found in context. Cannot validate payload without node_type.`));
                continue;
            }
            if (nodeType === 'BROWSER_COMMAND') {
                const browserParsed = BrowserCommandSchema.safeParse(parsed.data.payload);
                if (!browserParsed.success) {
                    const faults = mapZodError(browserParsed.error).map((f) => ({
                        ...f,
                        field: `mutations[${i}].payload.${f.field}`,
                    }));
                    allFaults.push(...faults);
                    continue;
                }
                if (!browserModeEnabled) {
                    allFaults.push(makeFault(`mutations[${i}].node_type`, 'Browse mode enabled', nodeType, 'Browser commands require Browse mode to be enabled for this run.'));
                }
                else if (!allowedNodeTypeSet) {
                    allFaults.push(makeFault(`mutations[${i}].node_type`, 'BROWSER_COMMAND in an explicit server node allowlist', 'node allowlist omitted', 'Browse mode requires an authoritative server node allowlist.'));
                }
                else if (!Array.isArray(allowedBrowserOperations)) {
                    allFaults.push(makeFault(`mutations[${i}].payload.operation`, 'an explicit server browser operation allowlist', 'operation allowlist omitted', 'Browse mode requires an authoritative server operation allowlist.'));
                }
                else if (!allowedBrowserOperations.includes(browserParsed.data.operation)) {
                    allFaults.push(makeFault(`mutations[${i}].payload.operation`, `one of: ${allowedBrowserOperations.join(', ') || 'none'}`, browserParsed.data.operation, `Browser operation "${browserParsed.data.operation}" is not available in the server capability manifest.`));
                }
                continue;
            }
            const enriched = {
                node_type: nodeType,
                payload: parsed.data.payload,
            };
            const nodeParsed = NodeDefinitionSchema.safeParse(enriched);
            if (!nodeParsed.success) {
                const faults = mapZodError(nodeParsed.error).map((f) => ({
                    ...f,
                    field: `mutations[${i}].payload.${f.field}`,
                }));
                allFaults.push(...faults);
            }
        }
    }
    if (allFaults.length > 0) {
        return { valid: false, errors: allFaults };
    }
    return { valid: true };
}
//# sourceMappingURL=validate.js.map