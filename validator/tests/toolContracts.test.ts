import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StrictToolDefinitionSchema, ToolDefinitionSchema } from '../src/schemas/toolDefinitions.js';
import { JsonObjectSchema } from '../src/schemas/contractPrimitives.js';
import { ProviderToolCallSchema, ToolExecutionContextSchema } from '../src/schemas/toolCalls.js';
import { ToolResultSchema, parseCorrelatedToolResult } from '../src/schemas/toolResults.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../core/tests/fixtures/tool-contracts/${name}.json`, import.meta.url),
    'utf8',
  ));
}

describe('MCP-aligned canonical tool contracts', () => {
  it('parses the exact shared valid fixture corpus', () => {
    expect(StrictToolDefinitionSchema.parse(fixture('valid-definition'))).toEqual(fixture('valid-definition'));
    expect(StrictToolDefinitionSchema.parse(fixture('valid-definition-2025-11-25'))).toEqual(fixture('valid-definition-2025-11-25'));
    expect(ProviderToolCallSchema.parse(fixture('valid-call'))).toEqual(fixture('valid-call'));
    expect(ToolExecutionContextSchema.parse(fixture('valid-context'))).toEqual(fixture('valid-context'));
    expect(ToolExecutionContextSchema.parse(fixture('valid-context-json-number'))).toEqual(fixture('valid-context-json-number'));
    expect(parseCorrelatedToolResult(fixture('valid-result'), 'call_browser_1')).toEqual(fixture('valid-result'));
  });

  it('agrees with every shared PHP invalid fixture', () => {
    const cases = fixture('invalid-contracts');
    expect(Array.isArray(cases)).toBe(true);

    for (const testCase of cases as Array<Record<string, unknown>>) {
      const contract = testCase.contract;
      const payload = testCase.payload;
      const result = contract === 'definition'
        ? ToolDefinitionSchema.safeParse(payload)
        : contract === 'strict_definition'
          ? StrictToolDefinitionSchema.safeParse(payload)
          : contract === 'call'
            ? ProviderToolCallSchema.safeParse(payload)
            : contract === 'context'
              ? ToolExecutionContextSchema.safeParse(payload)
              : contract === 'result'
                ? ToolResultSchema.safeParse(payload)
                : null;

      expect(result, String(testCase.label)).not.toBeNull();
      if (contract === 'result' && result?.success && typeof testCase.expected_tool_use_id === 'string') {
        expect(() => parseCorrelatedToolResult(payload, testCase.expected_tool_use_id as string), String(testCase.label)).toThrow();
      } else {
        expect(result?.success, String(testCase.label)).toBe(false);
      }
    }
  });

  it('keeps generic MCP JSON Schema separate from strict procedural policy', () => {
    const definition = fixture('valid-definition') as Record<string, unknown>;
    const inputSchema = {
      type: 'object',
      required: ['resolved_by_composition'],
      additionalProperties: false,
    };
    const composed = { ...definition, inputSchema };

    expect(ToolDefinitionSchema.safeParse(composed).success).toBe(true);
    expect(StrictToolDefinitionSchema.safeParse(composed).success).toBe(false);
  });

  it('supports opaque MCP URIs while correlating TALOS artifact links', () => {
    const opaque = {
      schema_version: 'talos_tool_result_v1',
      tool_use_id: 'call-urn',
      isError: false,
      content: [{ type: 'resource_link', uri: 'urn:example:artifact:42', name: 'Opaque artifact' }],
      structuredContent: null,
      evidence: [],
    };
    expect(parseCorrelatedToolResult(opaque, 'call-urn')).toEqual(opaque);

    const missingEvidence = {
      ...opaque,
      content: [{ type: 'resource_link', uri: 'talos-artifact://missing', name: 'Missing evidence' }],
    };
    expect(ToolResultSchema.safeParse(missingEvidence).success).toBe(false);
  });

  it('bounds schema fields, content blocks, and evidence records', () => {
    const definition = structuredClone(fixture('valid-definition')) as Record<string, any>;
    definition.inputSchema.properties = {};
    definition.inputSchema.required = [];
    for (let index = 0; index < 257; index += 1) {
      const field = `field_${index}`;
      definition.inputSchema.properties[field] = { type: 'string' };
      definition.inputSchema.required.push(field);
    }
    expect(ToolDefinitionSchema.safeParse(definition).success).toBe(false);

    const contentOverflow = structuredClone(fixture('valid-result')) as Record<string, any>;
    contentOverflow.content = Array.from({ length: 65 }, () => ({ type: 'text', text: 'bounded' }));
    expect(ToolResultSchema.safeParse(contentOverflow).success).toBe(false);

    const evidenceOverflow = structuredClone(fixture('valid-result')) as Record<string, any>;
    evidenceOverflow.evidence = Array.from({ length: 129 }, (_, index) => ({
      artifact_id: `artifact-${index}`,
      kind: 'snapshot',
      sha256: `sha256:${(index % 16).toString(16).repeat(64)}`,
      trusted_boundary: 'untrusted_web_content',
    }));
    expect(ToolResultSchema.safeParse(evidenceOverflow).success).toBe(false);
  });

  it('matches PHP edge rules and canonicalizes empty object aliases', () => {
    const call = structuredClone(fixture('valid-call')) as Record<string, any>;
    call.arguments = [];
    call.provider_metadata = [];
    const parsedCall = ProviderToolCallSchema.parse(call);
    expect(parsedCall.arguments).toEqual({});
    expect(parsedCall.provider_metadata).toEqual({});

    const noOffset = structuredClone(fixture('valid-context')) as Record<string, any>;
    noOffset.deadline_at = '2026-07-12T20:00:00';
    expect(ToolExecutionContextSchema.safeParse(noOffset).success).toBe(false);

    const unsafeInteger = structuredClone(fixture('valid-context')) as Record<string, any>;
    unsafeInteger.state_version = 9007199254740992;
    expect(ToolExecutionContextSchema.safeParse(unsafeInteger).success).toBe(false);

    const jsonInteger = structuredClone(fixture('valid-context')) as Record<string, any>;
    jsonInteger.state_version = 1.0;
    expect(ToolExecutionContextSchema.parse(jsonInteger).state_version).toBe(1);

    const iconDefinition = structuredClone(fixture('valid-definition')) as Record<string, any>;
    iconDefinition.icons = [
      { src: 'http://example.com/talos.png' },
      { src: 'data:image/png;base64,iVBORw0KGgo=' },
    ];
    expect(ToolDefinitionSchema.parse(iconDefinition).icons).toEqual(iconDefinition.icons);

    const unicodeOverflow = structuredClone(fixture('valid-definition')) as Record<string, any>;
    unicodeOverflow.description = 'é'.repeat(2049);
    expect(ToolDefinitionSchema.safeParse(unicodeOverflow).success).toBe(false);

    const nullMetadata = structuredClone(fixture('valid-result')) as Record<string, any>;
    nullMetadata.content[0].annotations = null;
    expect(ToolResultSchema.safeParse(nullMetadata).success).toBe(false);

    const titledResource = structuredClone(fixture('valid-result')) as Record<string, any>;
    titledResource.content[3].title = 'Current browser screenshot';
    expect(ToolResultSchema.parse(titledResource)).toEqual(titledResource);

    const nullableTitle = structuredClone(fixture('valid-definition-2025-11-25')) as Record<string, any>;
    nullableTitle.title = null;
    expect(ToolDefinitionSchema.safeParse(nullableTitle).success).toBe(false);

    const trailingPunctuation = structuredClone(fixture('valid-definition-2025-11-25')) as Record<string, any>;
    trailingPunctuation.name = 'browser_snapshot-';
    expect(ToolDefinitionSchema.safeParse(trailingPunctuation).success).toBe(false);
  });

  it('returns canonical transformations for nested schema properties', () => {
    const definition = structuredClone(fixture('valid-definition')) as Record<string, any>;
    definition.inputSchema.properties = [];

    const parsed = ToolDefinitionSchema.parse(definition);
    expect(parsed.inputSchema.properties).toEqual({});
  });

  it('rejects ambiguous sequential numeric-key objects as JSON objects', () => {
    expect(JsonObjectSchema.safeParse({ 0: 'ambiguous', 1: 'object' }).success).toBe(false);
  });
});
