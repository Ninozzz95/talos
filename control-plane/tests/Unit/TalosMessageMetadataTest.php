<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\TalosMessageMetadata;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class TalosMessageMetadataTest extends TestCase
{
    public function test_storage_projection_preserves_safe_legacy_fields_and_canonicalizes_known_fields(): void
    {
        $metadata = TalosMessageMetadata::fromStorage([
            'source' => 'talos_chat_proxy',
            'legacy_safe' => ['label' => 'kept'],
            'attachments' => [[
                'file_id' => 'file-1',
                'name' => 'diagram.png',
                'mime_type' => 'image/png',
                'size_bytes' => 128,
                'content_url' => '/api/talos/files/file-1/content',
            ]],
            'visible_reasoning' => [
                'source' => 'provider',
                'provider' => 'deepseek',
                'text' => 'I compared the two available options.',
                'duration_ms' => 420,
            ],
            'tool_activities' => [[
                'id' => 'tool-1',
                'name' => 'browser.snapshot',
                'status' => 'succeeded',
                'started_at' => '2026-07-28T10:00:00Z',
                'completed_at' => '2026-07-28T10:00:01Z',
            ]],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 8, 'total_tokens' => 20],
            'timing' => ['total_ms' => 900, 'time_to_first_content_ms' => 180],
        ]);

        self::assertSame(TalosMessageMetadata::CONTRACT, $metadata->toApiArray()['contract']);
        self::assertSame('kept', $metadata->toApiArray()['legacy_safe']['label']);
        self::assertSame('file-1', $metadata->toApiArray()['attachments'][0]['file_id']);
        self::assertSame('provider', $metadata->toApiArray()['visible_reasoning']['source']);
        self::assertSame('tool-1', $metadata->toApiArray()['tool_activities'][0]['id']);
        self::assertSame(20, $metadata->toApiArray()['usage']['total_tokens']);
        self::assertSame(180, $metadata->toApiArray()['timing']['time_to_first_content_ms']);
    }

    public function test_api_and_export_remove_secrets_and_provider_private_continuation_state_recursively(): void
    {
        $metadata = TalosMessageMetadata::fromStorage([
            'source' => 'talos_chat_proxy',
            'safe' => ['value' => 'kept'],
            'api_key' => 'secret',
            'nested' => [
                'authorization' => 'Bearer secret',
                'signature' => 'opaque-signature',
                'thought_signature' => 'opaque-gemini-state',
                'encrypted_content' => 'opaque-openai-state',
                'redacted_thinking' => 'opaque-anthropic-state',
                'continuation_state' => ['provider' => 'opaque'],
                'raw_tool_arguments' => ['path' => 'C:\\private'],
                'raw_tool_result' => ['content' => 'private'],
            ],
        ]);

        foreach ([$metadata->toApiArray(), $metadata->toExportArray()] as $projection) {
            $encoded = json_encode($projection, JSON_THROW_ON_ERROR);
            self::assertStringContainsString('kept', $encoded);
            self::assertStringNotContainsString('secret', $encoded);
            self::assertStringNotContainsString('signature', $encoded);
            self::assertStringNotContainsString('encrypted_content', $encoded);
            self::assertStringNotContainsString('redacted_thinking', $encoded);
            self::assertStringNotContainsString('continuation_state', $encoded);
            self::assertStringNotContainsString('raw_tool', $encoded);
        }
    }

    public function test_unknown_legacy_fields_never_become_known_capabilities(): void
    {
        $projection = TalosMessageMetadata::fromStorage([
            'legacy_reasoning' => 'not canonical reasoning',
            'legacy_tool' => ['name' => 'not canonical activity'],
            'legacy_attachment' => ['file_id' => 'not canonical attachment'],
        ])->toApiArray();

        self::assertArrayHasKey('legacy_reasoning', $projection);
        self::assertArrayNotHasKey('visible_reasoning', $projection);
        self::assertArrayNotHasKey('tool_activities', $projection);
        self::assertArrayNotHasKey('attachments', $projection);
    }

    public function test_storage_projection_drops_invalid_known_fields_without_losing_safe_legacy_metadata(): void
    {
        $projection = TalosMessageMetadata::fromStorage([
            'legacy_safe' => true,
            'visible_reasoning' => ['source' => 'provider', 'text' => '', 'duration_ms' => -1],
            'tool_activities' => [
                ['id' => 'duplicate', 'name' => 'one', 'status' => 'running', 'started_at' => 'not-a-date'],
                ['id' => 'duplicate', 'name' => 'two', 'status' => 'succeeded', 'started_at' => '2026-07-28T10:00:00Z'],
            ],
            'attachments' => [['file_id' => '', 'name' => 'invalid']],
        ])->toApiArray();

        self::assertTrue($projection['legacy_safe']);
        self::assertArrayNotHasKey('visible_reasoning', $projection);
        self::assertArrayNotHasKey('tool_activities', $projection);
        self::assertArrayNotHasKey('attachments', $projection);
    }

    public function test_client_input_rejects_non_objects_secrets_private_state_and_invalid_known_fields(): void
    {
        $invalidPayloads = [
            'not-an-object',
            ['api_key' => 'secret'],
            ['nested' => ['signature' => 'opaque']],
            ['attachments' => [['file_id' => '', 'name' => 'invalid']]],
            ['usage' => ['input_tokens' => -1]],
            ['timing' => ['total_ms' => -1]],
        ];

        foreach ($invalidPayloads as $payload) {
            try {
                TalosMessageMetadata::fromClientInput($payload);
                self::fail('Invalid client metadata was accepted: '.json_encode($payload));
            } catch (InvalidArgumentException) {
                self::assertTrue(true);
            }
        }
    }

    public function test_client_input_strips_server_owned_browser_fields_but_keeps_existing_action_and_usage_fields(): void
    {
        $projection = TalosMessageMetadata::fromClientInput([
            'source' => 'talos_chat_page',
            'command_id' => 'retry_assistant_response',
            'retry_of_message_id' => 'message-1',
            'browser_activities' => [['id' => 'forged']],
            'used_browser_context' => ['snapshot_artifact_id' => 'forged'],
            'visible_reasoning' => ['source' => 'provider', 'text' => 'forged'],
            'tool_activities' => [['id' => 'forged']],
            'usage' => ['input_tokens' => 10, 'output_tokens' => 2, 'total_tokens' => 12],
        ])->toStorageArray();

        self::assertSame('retry_assistant_response', $projection['command_id']);
        self::assertSame(12, $projection['usage']['total_tokens']);
        self::assertArrayNotHasKey('browser_activities', $projection);
        self::assertArrayNotHasKey('used_browser_context', $projection);
        self::assertArrayNotHasKey('visible_reasoning', $projection);
        self::assertArrayNotHasKey('tool_activities', $projection);
    }
}
