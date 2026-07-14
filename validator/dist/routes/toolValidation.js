import { z } from 'zod';
import { ProviderToolCallSchema, ToolExecutionContextSchema } from '../schemas/toolCalls.js';
import { StrictToolDefinitionSchema } from '../schemas/toolDefinitions.js';
import { ToolResultSchema } from '../schemas/toolResults.js';
const CONTRACT_VERSION = 'mcp-2025-11-25+talos-v1';
const TOOL_CONTRACT_BODY_LIMIT = 1024 * 1024;
const TOOL_RESULT_BODY_LIMIT = 20 * 1024 * 1024;
const ToolDefinitionEnvelopeSchema = z.object({
    definition: StrictToolDefinitionSchema,
}).strict();
const ToolCallEnvelopeSchema = z.object({
    call: ProviderToolCallSchema,
    context: ToolExecutionContextSchema,
}).strict();
const ToolResultEnvelopeSchema = z.object({
    result: ToolResultSchema,
    expected_tool_use_id: z.string().min(1).max(256),
}).strict().superRefine((envelope, context) => {
    if (envelope.result.tool_use_id !== envelope.expected_tool_use_id) {
        context.addIssue({
            code: 'custom',
            path: ['result', 'tool_use_id'],
            message: 'Tool result use ID does not match the provider call ID.',
        });
    }
});
const SAFE_ISSUE_PATH_SEGMENTS = new Set([
    'definition', 'call', 'context', 'result', 'expected_tool_use_id',
    'name', 'title', 'description', 'inputSchema', 'outputSchema', 'annotations',
    'type', 'properties', 'required', 'additionalProperties',
    'schema_version', 'provider_call_id', 'arguments', 'assistant_preamble', 'provider_metadata',
    'user_id', 'chat_session_id', 'run_id', 'turn_id', 'browser_session_id', 'node_id',
    'capability', 'risk', 'state_version', 'deadline_at', 'idempotency_key',
    'tool_use_id', 'isError', 'content', 'structuredContent', 'evidence',
    'resource', 'uri', 'text', 'blob', 'data', 'mimeType', 'size', 'icons', '_meta',
    'artifact_id', 'kind', 'sha256', 'trusted_boundary', 'evidence_ids',
]);
function safeIssuePath(path) {
    return path.map((segment) => {
        if (typeof segment === 'number')
            return String(segment);
        const value = String(segment);
        return SAFE_ISSUE_PATH_SEGMENTS.has(value) ? value : '[field]';
    }).join('.');
}
function safeIssueMessage(code) {
    if (code === 'unrecognized_keys')
        return 'The contract contains unsupported fields.';
    if (code === 'custom')
        return 'A contract relationship or policy constraint is invalid.';
    return 'A contract field failed validation.';
}
function validationFault(reply, code, error) {
    return reply.status(422).send({
        valid: false,
        fault: {
            code,
            message: 'The canonical tool contract is invalid.',
            issues: error.issues.map((issue) => ({
                code: issue.code,
                path: safeIssuePath(issue.path),
                message: safeIssueMessage(issue.code),
            })),
        },
    });
}
function routeFaultCode(url) {
    const path = url.split('?', 1)[0];
    if (path === '/validate/tool-definition')
        return 'TOOL_DEFINITION_INVALID';
    if (path === '/validate/tool-call')
        return 'TOOL_CALL_INVALID';
    if (path === '/validate/tool-result')
        return 'TOOL_RESULT_INVALID';
    return null;
}
function transportFault(reply, status, code, issueCode) {
    return reply.status(status).send({
        valid: false,
        fault: {
            code,
            message: 'The canonical tool contract request is invalid.',
            issues: [{
                    code: issueCode,
                    path: 'body',
                    message: status === 413
                        ? 'The contract request body exceeds the configured limit.'
                        : 'The contract request body could not be parsed.',
                }],
        },
    });
}
function validContract(contract, data) {
    return {
        valid: true,
        contract,
        contract_version: CONTRACT_VERSION,
        data,
    };
}
export function registerToolValidationRoutes(server) {
    server.register(async (scope) => {
        scope.setErrorHandler((error, request, reply) => {
            const code = routeFaultCode(request.url);
            const errorRecord = typeof error === 'object' && error !== null
                ? error
                : {};
            const status = typeof errorRecord.statusCode === 'number' ? errorRecord.statusCode : 500;
            const issueCode = typeof errorRecord.code === 'string' ? errorRecord.code : 'INVALID_REQUEST_BODY';
            if (code !== null && status >= 400 && status < 500) {
                return transportFault(reply, status, code, issueCode);
            }
            return reply.send(error);
        });
        scope.post('/validate/tool-definition', { bodyLimit: TOOL_CONTRACT_BODY_LIMIT }, async (request, reply) => {
            const parsed = ToolDefinitionEnvelopeSchema.safeParse(request.body);
            if (!parsed.success) {
                return validationFault(reply, 'TOOL_DEFINITION_INVALID', parsed.error);
            }
            return validContract('tool_definition', parsed.data.definition);
        });
        scope.post('/validate/tool-call', { bodyLimit: TOOL_CONTRACT_BODY_LIMIT }, async (request, reply) => {
            const parsed = ToolCallEnvelopeSchema.safeParse(request.body);
            if (!parsed.success) {
                return validationFault(reply, 'TOOL_CALL_INVALID', parsed.error);
            }
            return validContract('tool_call', parsed.data);
        });
        scope.post('/validate/tool-result', { bodyLimit: TOOL_RESULT_BODY_LIMIT }, async (request, reply) => {
            const parsed = ToolResultEnvelopeSchema.safeParse(request.body);
            if (!parsed.success) {
                return validationFault(reply, 'TOOL_RESULT_INVALID', parsed.error);
            }
            return validContract('tool_result', parsed.data.result);
        });
    });
}
//# sourceMappingURL=toolValidation.js.map