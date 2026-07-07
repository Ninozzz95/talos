import { ZodError } from 'zod';
import { JmpMutationSchema } from './mutations.js';
import { NodeDefinitionSchema } from './nodes.js';
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
export function validateMutations(mutations, context) {
    const allFaults = [];
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
        if (parsed.data.action === 'MUTATE_PAYLOAD') {
            const nodeId = parsed.data.node_id;
            const nodeType = context[nodeId];
            if (!nodeType) {
                allFaults.push(makeFault(`mutations[${i}].node_id`, 'node_id present in context', nodeId, `Node "${nodeId}" not found in context. Cannot validate payload without node_type.`));
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