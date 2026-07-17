<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use Kadmos\Tool\ProceduralToolSpec;
use Kadmos\Tool\ToolDefinition;

final class TalosProceduralToolRegistry
{
    private const TOOL_NAMES = [
        'browser_navigate',
        'browser_snapshot',
        'browser_read',
        'browser_take_screenshot',
        'browser_click',
        'browser_file_upload',
        'web_search',
        'web_fetch',
    ];

    /** @return array<string, ToolDefinition> */
    public static function toolDefinitions(): array
    {
        $rawDefinitions = self::rawDefinitions();
        $definitions = [];
        foreach (self::TOOL_NAMES as $name) {
            $definitions[$name] = ToolDefinition::fromStrictArray($rawDefinitions[$name]);
        }

        return $definitions;
    }

    /** @return array<string, ToolDefinition> */
    public static function definitions(): array
    {
        return self::toolDefinitions();
    }

    /** @return array<string, ProceduralToolSpec> */
    public static function proceduralToolSpecs(): array
    {
        return [
            'browser_navigate' => new ProceduralToolSpec('browser_navigate', 'TOOL_BROWSER_NAVIGATE', 'browser.read', 'low', true, false, false, true),
            'browser_snapshot' => new ProceduralToolSpec('browser_snapshot', 'TOOL_BROWSER_SNAPSHOT', 'browser.read', 'low', false, true, false, true),
            'browser_read' => new ProceduralToolSpec('browser_read', 'TOOL_BROWSER_READ', 'browser.read', 'low', false, true, false, true),
            'browser_take_screenshot' => new ProceduralToolSpec('browser_take_screenshot', 'TOOL_BROWSER_SCREENSHOT', 'browser.read', 'low', false, true, false, true),
            'browser_click' => new ProceduralToolSpec('browser_click', 'TOOL_BROWSER_CLICK', 'browser.write', 'high', true, false, true, true),
            'browser_file_upload' => new ProceduralToolSpec('browser_file_upload', 'TOOL_BROWSER_FILE_UPLOAD', 'browser.upload', 'critical', true, false, true, true),
            'web_search' => new ProceduralToolSpec('web_search', 'TOOL_WEB_SEARCH', 'web.search', 'low', false, true, false, true),
            'web_fetch' => new ProceduralToolSpec('web_fetch', 'TOOL_WEB_FETCH', 'web.fetch', 'low', false, true, false, true),
        ];
    }

    /** @return array<string, ProceduralToolSpec> */
    public static function specs(): array
    {
        return self::proceduralToolSpecs();
    }

    /** @return array<string, ProceduralToolSpec> */
    public static function registry(): array
    {
        return self::proceduralToolSpecs();
    }

    public static function definition(string $toolName): ToolDefinition
    {
        $definition = self::toolDefinitions()[$toolName] ?? null;
        if (! $definition instanceof ToolDefinition) {
            throw new InvalidArgumentException('Unknown TALOS procedural tool: '.$toolName);
        }

        return $definition;
    }

    public static function spec(string $toolName): ProceduralToolSpec
    {
        $spec = self::proceduralToolSpecs()[$toolName] ?? null;
        if (! $spec instanceof ProceduralToolSpec) {
            throw new InvalidArgumentException('Unknown TALOS procedural tool: '.$toolName);
        }

        return $spec;
    }

    /** @return array<string, array<string, mixed>> */
    private static function rawDefinitions(): array
    {
        $browserOutput = self::browserOutputSchema();

        return [
            'browser_navigate' => [
                'name' => 'browser_navigate',
                'title' => 'Navigate',
                'description' => 'Navigate the isolated Browser page.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'url' => ['type' => 'string', 'format' => 'uri', 'maxLength' => 2048],
                    ],
                    'required' => ['url'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => $browserOutput,
                'annotations' => [
                    'readOnlyHint' => false,
                    'destructiveHint' => false,
                    'idempotentHint' => false,
                    'openWorldHint' => true,
                ],
            ],
            'browser_snapshot' => [
                'name' => 'browser_snapshot',
                'title' => 'Page snapshot',
                'description' => 'Capture a bounded accessibility snapshot of the current Browser page.',
                'inputSchema' => self::browserStateInputSchema(),
                'outputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        ...$browserOutput['properties'],
                        'snapshot_id' => ['type' => 'string', 'pattern' => '^snap_[A-Za-z0-9-]+$'],
                        'format' => ['type' => 'string', 'const' => 'accessibility_refs_v1'],
                        'text_digest' => ['type' => 'string', 'maxLength' => 4000],
                        'nodes' => [
                            'type' => 'array',
                            'maxItems' => 200,
                            'items' => self::browserSnapshotNodeSchema(),
                        ],
                    ],
                    'required' => ['url', 'title', 'state_version', 'snapshot_id', 'format', 'text_digest', 'nodes'],
                    'additionalProperties' => false,
                ],
                'annotations' => self::readOnlyAnnotations(false),
            ],
            'browser_read' => [
                'name' => 'browser_read',
                'title' => 'Read page refs',
                'description' => 'Read bounded text and accessibility references from the current Browser snapshot.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'ref' => ['type' => 'string', 'pattern' => '^r[0-9]+$'],
                        'query' => ['type' => 'string', 'maxLength' => 512],
                    ],
                    'anyOf' => [
                        ['required' => ['ref']],
                        ['required' => ['query']],
                    ],
                    'additionalProperties' => false,
                ],
                'outputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        ...$browserOutput['properties'],
                        'snapshot_id' => ['type' => 'string', 'pattern' => '^snap_[A-Za-z0-9-]+$'],
                        'matches' => [
                            'type' => 'array',
                            'maxItems' => 20,
                            'items' => self::browserSnapshotNodeSchema(),
                        ],
                    ],
                    'required' => ['url', 'title', 'state_version', 'snapshot_id', 'matches'],
                    'additionalProperties' => false,
                ],
                'annotations' => self::readOnlyAnnotations(false),
            ],
            'browser_take_screenshot' => [
                'name' => 'browser_take_screenshot',
                'title' => 'Take a screenshot',
                'description' => 'Capture a bounded PNG screenshot of the current Browser page.',
                'inputSchema' => self::browserStateInputSchema(),
                'outputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        ...$browserOutput['properties'],
                        'mime_type' => ['type' => 'string', 'const' => 'image/png'],
                        'width' => ['type' => 'integer', 'minimum' => 1],
                        'height' => ['type' => 'integer', 'minimum' => 1],
                        'sha256' => ['type' => 'string', 'pattern' => '^sha256:[a-f0-9]{64}$'],
                    ],
                    'required' => ['url', 'title', 'state_version', 'mime_type', 'width', 'height', 'sha256'],
                    'additionalProperties' => false,
                ],
                'annotations' => self::readOnlyAnnotations(false),
            ],
            'browser_click' => [
                'name' => 'browser_click',
                'title' => 'Click',
                'description' => 'Click an exact semantic target from the current verified Browser snapshot after explicit approval.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'target' => ['type' => 'string', 'pattern' => '^r[0-9]+$'],
                        'element' => ['type' => 'string', 'maxLength' => 256],
                    ],
                    'required' => ['target'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => self::browserClickOutputSchema(),
                'annotations' => [
                    'readOnlyHint' => false,
                    'destructiveHint' => false,
                    'idempotentHint' => false,
                    'openWorldHint' => false,
                ],
            ],
            'browser_file_upload' => [
                'name' => 'browser_file_upload',
                'title' => 'Upload files',
                'description' => 'Upload one to four explicitly authorized Vault files to an exact file input from the current verified Browser snapshot.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'target' => ['type' => 'string', 'pattern' => '^r[0-9]+$'],
                        'element' => ['type' => 'string', 'maxLength' => 256],
                        'file_ids' => [
                            'type' => 'array',
                            'minItems' => 1,
                            'maxItems' => 4,
                            'uniqueItems' => true,
                            'items' => ['type' => 'string', 'format' => 'uuid'],
                        ],
                    ],
                    'required' => ['target', 'file_ids'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => self::browserUploadOutputSchema(),
                'annotations' => [
                    'readOnlyHint' => false,
                    'destructiveHint' => false,
                    'idempotentHint' => false,
                    'openWorldHint' => false,
                ],
            ],
            'web_search' => [
                'name' => 'web_search',
                'title' => 'Web search',
                'description' => 'Search the configured read-only web provider and return untrusted results.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 512],
                        'options' => [
                            'type' => 'object',
                            'properties' => [
                                'language' => ['type' => 'string', 'maxLength' => 32, 'pattern' => '^[A-Za-z0-9_-]+$'],
                                'pageno' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100],
                                'time_range' => ['type' => ['string', 'null'], 'enum' => ['day', 'month', 'year', null]],
                                'safesearch' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 2],
                            ],
                            'additionalProperties' => false,
                        ],
                    ],
                    'required' => ['query'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => self::webSearchOutputSchema(),
                'annotations' => self::readOnlyAnnotations(true),
            ],
            'web_fetch' => [
                'name' => 'web_fetch',
                'title' => 'Web fetch',
                'description' => 'Fetch bounded public web content through the policy-gated read-only fetch service.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'url' => ['type' => 'string', 'format' => 'uri', 'maxLength' => 2048],
                        'timeout_ms' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 15000],
                        'max_bytes' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 10000000],
                        'max_redirects' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10],
                    ],
                    'required' => ['url'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => self::webFetchOutputSchema(),
                'annotations' => self::readOnlyAnnotations(true),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function browserStateInputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private static function browserOutputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'url' => ['type' => 'string', 'maxLength' => 2048],
                'title' => ['type' => 'string', 'maxLength' => 512],
                'state_version' => ['type' => 'integer', 'minimum' => 0],
                'evidence_ids' => ['type' => 'array', 'items' => ['type' => 'string', 'maxLength' => 256]],
            ],
            'required' => ['url', 'title', 'state_version'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private static function browserSnapshotNodeSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'ref' => ['type' => 'string', 'pattern' => '^r[0-9]+$'],
                'role' => ['type' => 'string', 'maxLength' => 64],
                'name' => ['type' => 'string', 'maxLength' => 200],
                'href' => ['type' => 'string', 'format' => 'uri', 'maxLength' => 2048],
                'level' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 6],
                'visible' => ['type' => 'boolean'],
            ],
            'required' => ['ref', 'role', 'name', 'visible'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private static function browserClickOutputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                ...self::browserOutputSchema()['properties'],
                'target' => self::browserSnapshotNodeSchema(),
                'screenshot' => [
                    'type' => 'object',
                    'properties' => [
                        'mime_type' => ['type' => 'string', 'const' => 'image/png'],
                        'width' => ['type' => 'integer', 'minimum' => 1],
                        'height' => ['type' => 'integer', 'minimum' => 1],
                        'sha256' => ['type' => 'string', 'pattern' => '^sha256:[a-f0-9]{64}$'],
                    ],
                    'required' => ['mime_type', 'width', 'height', 'sha256'],
                    'additionalProperties' => false,
                ],
                'snapshot' => [
                    'type' => 'object',
                    'properties' => [
                        'snapshot_id' => ['type' => 'string', 'pattern' => '^snap_[A-Za-z0-9-]+$'],
                        'format' => ['type' => 'string', 'const' => 'accessibility_refs_v1'],
                        'text_digest' => ['type' => 'string', 'maxLength' => 4000],
                        'nodes' => [
                            'type' => 'array',
                            'maxItems' => 200,
                            'items' => self::browserSnapshotNodeSchema(),
                        ],
                    ],
                    'required' => ['snapshot_id', 'format', 'text_digest', 'nodes'],
                    'additionalProperties' => false,
                ],
            ],
            'required' => ['url', 'title', 'state_version', 'target', 'screenshot', 'snapshot'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private static function browserUploadOutputSchema(): array
    {
        $schema = self::browserClickOutputSchema();
        $schema['properties']['files'] = [
            'type' => 'array',
            'minItems' => 1,
            'maxItems' => 4,
            'items' => [
                'type' => 'object',
                'properties' => [
                    'file_id' => ['type' => 'string', 'format' => 'uuid'],
                    'name' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 255],
                    'mime_type' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 128],
                    'size_bytes' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 10485760],
                    'sha256' => ['type' => 'string', 'pattern' => '^sha256:[a-f0-9]{64}$'],
                ],
                'required' => ['file_id', 'name', 'mime_type', 'size_bytes', 'sha256'],
                'additionalProperties' => false,
            ],
        ];
        $schema['required'][] = 'files';

        return $schema;
    }

    /** @return array<string, bool> */
    private static function readOnlyAnnotations(bool $openWorld): array
    {
        return [
            'readOnlyHint' => true,
            'destructiveHint' => false,
            'idempotentHint' => true,
            'openWorldHint' => $openWorld,
        ];
    }

    /** @return array<string, mixed> */
    private static function webSearchOutputSchema(): array
    {
        $result = [
            'type' => 'object',
            'properties' => [
                'title' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 512],
                'url' => ['type' => 'string', 'format' => 'uri', 'minLength' => 1, 'maxLength' => 2048],
                'snippet' => ['type' => 'string', 'maxLength' => 4096],
                'source' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 128],
                'rank' => ['type' => 'integer', 'minimum' => 1],
                'timestamp' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 64],
                'evidence_hash' => ['type' => 'string', 'pattern' => '^sha256:[a-f0-9]{64}$'],
                'provenance' => ['type' => 'string', 'const' => 'untrusted'],
                'untrusted' => ['type' => 'boolean', 'const' => true],
            ],
            'required' => ['title', 'url', 'snippet', 'source', 'rank', 'timestamp', 'evidence_hash', 'provenance', 'untrusted'],
            'additionalProperties' => false,
        ];

        return [
            'type' => 'object',
            'properties' => [
                'available' => ['type' => 'boolean'],
                'results' => ['type' => 'array', 'maxItems' => 10, 'items' => $result],
                'reason' => ['type' => ['string', 'null'], 'maxLength' => 128],
                'provenance' => ['type' => 'string', 'const' => 'untrusted_web_search'],
            ],
            'required' => ['available', 'results', 'reason', 'provenance'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    private static function webFetchOutputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'url' => ['type' => 'string', 'format' => 'uri', 'minLength' => 1, 'maxLength' => 2048],
                'content_type' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 128],
                'content' => ['type' => 'string', 'maxLength' => 10000000],
                'bytes' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10000000],
                'evidence_hash' => ['type' => 'string', 'pattern' => '^sha256:[a-f0-9]{64}$'],
                'fetched_at' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 64],
                'provenance' => ['type' => 'string', 'const' => 'untrusted_web_fetch'],
                'untrusted' => ['type' => 'boolean', 'const' => true],
                'redirect_chain' => [
                    'type' => 'array',
                    'maxItems' => 11,
                    'items' => ['type' => 'string', 'format' => 'uri', 'maxLength' => 2048],
                ],
            ],
            'required' => ['url', 'content_type', 'content', 'bytes', 'evidence_hash', 'fetched_at', 'provenance', 'untrusted', 'redirect_chain'],
            'additionalProperties' => false,
        ];
    }
}
