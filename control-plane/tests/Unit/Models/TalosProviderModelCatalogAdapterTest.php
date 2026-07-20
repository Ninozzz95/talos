<?php

declare(strict_types=1);

namespace Tests\Unit\Models;

use App\Services\Models\Catalog\TalosAnthropicModelCatalogAdapter;
use App\Services\Models\Catalog\TalosGeminiModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOllamaModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOpenAiCompatibleModelCatalogAdapter;
use App\Services\Models\Catalog\TalosOpenRouterModelCatalogAdapter;
use App\Services\Models\Catalog\TalosProviderModelCatalogException;
use App\Services\Models\Catalog\TalosProviderModelCatalogItem;
use App\Services\Models\Catalog\TalosProviderModelCatalogPage;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class TalosProviderModelCatalogAdapterTest extends TestCase
{
    public function test_catalog_item_normalizes_and_exposes_the_frozen_shape(): void
    {
        $item = new TalosProviderModelCatalogItem(
            id: 'gpt-4.1-mini',
            displayName: 'GPT-4.1 mini',
            provider: 'openai',
            ownedBy: 'openai',
            chatCompatibility: 'unknown',
            capabilities: ['text' => true, 'vision' => null, 'tools' => false],
            contextWindow: 128000,
            maxOutputTokens: 16384,
            lifecycle: 'stable',
            canonicalSlug: 'openai/gpt-4.1-mini',
            localDigest: null,
            metadata: ['family' => 'gpt-4.1'],
            effortLevels: ['high', 'low', 'medium'],
        );

        self::assertSame([
            'id' => 'gpt-4.1-mini',
            'display_name' => 'GPT-4.1 mini',
            'provider' => 'openai',
            'owned_by' => 'openai',
            'chat_compatibility' => 'unknown',
            'capabilities' => [
                'text' => true,
                'vision' => null,
                'tools' => false,
                'reasoning' => null,
                'embeddings' => null,
                'image_output' => null,
                'audio_output' => null,
            ],
            'context_window' => 128000,
            'max_output_tokens' => 16384,
            'lifecycle' => 'stable',
            'canonical_slug' => 'openai/gpt-4.1-mini',
            'local_digest' => null,
            'effort_levels' => ['low', 'medium', 'high'],
            'metadata' => ['family' => 'gpt-4.1'],
        ], $item->toArray());
    }

    public function test_catalog_item_effort_levels_default_to_null(): void
    {
        $item = new TalosProviderModelCatalogItem(
            id: 'x', displayName: 'x', provider: 'openai', ownedBy: null,
            chatCompatibility: 'unknown', capabilities: [], contextWindow: null,
            maxOutputTokens: null, lifecycle: 'unknown', canonicalSlug: null,
            localDigest: null, metadata: [],
        );

        self::assertNull($item->toArray()['effort_levels']);
    }

    public function test_catalog_item_rejects_an_unknown_effort_level(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new TalosProviderModelCatalogItem(
            id: 'x', displayName: 'x', provider: 'openai', ownedBy: null,
            chatCompatibility: 'unknown', capabilities: [], contextWindow: null,
            maxOutputTokens: null, lifecycle: 'unknown', canonicalSlug: null,
            localDigest: null, metadata: [], effortLevels: ['ultra'],
        );
    }

    public function test_catalog_item_maps_an_empty_effort_list_to_null(): void
    {
        $item = new TalosProviderModelCatalogItem(
            id: 'x', displayName: 'x', provider: 'openai', ownedBy: null,
            chatCompatibility: 'unknown', capabilities: [], contextWindow: null,
            maxOutputTokens: null, lifecycle: 'unknown', canonicalSlug: null,
            localDigest: null, metadata: [], effortLevels: [],
        );

        self::assertNull($item->toArray()['effort_levels']);
    }

    public function test_catalog_item_rejects_invariant_violations(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new TalosProviderModelCatalogItem(
            id: '',
            displayName: 'Empty id',
            provider: 'openai',
            ownedBy: null,
            chatCompatibility: 'unknown',
            capabilities: [],
            contextWindow: null,
            maxOutputTokens: null,
            lifecycle: 'unknown',
            canonicalSlug: null,
            localDigest: null,
            metadata: [],
        );
    }

    public function test_catalog_item_rejects_unknown_chat_compatibility(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new TalosProviderModelCatalogItem(
            id: 'x',
            displayName: 'x',
            provider: 'openai',
            ownedBy: null,
            chatCompatibility: 'maybe',
            capabilities: [],
            contextWindow: null,
            maxOutputTokens: null,
            lifecycle: 'unknown',
            canonicalSlug: null,
            localDigest: null,
            metadata: [],
        );
    }

    public function test_catalog_item_rejects_non_sha256_local_digest(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new TalosProviderModelCatalogItem(
            id: 'x',
            displayName: 'x',
            provider: 'ollama',
            ownedBy: null,
            chatCompatibility: 'unknown',
            capabilities: [],
            contextWindow: null,
            maxOutputTokens: null,
            lifecycle: 'unknown',
            canonicalSlug: null,
            localDigest: 'NOT-A-DIGEST',
            metadata: [],
        );
    }

    public function test_catalog_item_rejects_non_positive_context_window(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new TalosProviderModelCatalogItem(
            id: 'x',
            displayName: 'x',
            provider: 'openai',
            ownedBy: null,
            chatCompatibility: 'unknown',
            capabilities: [],
            contextWindow: 0,
            maxOutputTokens: null,
            lifecycle: 'unknown',
            canonicalSlug: null,
            localDigest: null,
            metadata: [],
        );
    }

    public function test_openai_compatible_adapter_supports_openai_and_deepseek_only(): void
    {
        $adapter = new TalosOpenAiCompatibleModelCatalogAdapter;

        self::assertTrue($adapter->supports('openai'));
        self::assertTrue($adapter->supports('deepseek'));
        self::assertFalse($adapter->supports('anthropic'));
        self::assertFalse($adapter->supports('ollama'));
    }

    public function test_openai_compatible_adapter_targets_the_models_endpoint_with_bearer_auth(): void
    {
        $adapter = new TalosOpenAiCompatibleModelCatalogAdapter;

        self::assertSame('https://api.openai.com/v1/models', $adapter->endpoint('openai', 'https://api.openai.com/v1', null));
        self::assertSame('https://api.deepseek.com/v1/models', $adapter->endpoint('deepseek', 'https://api.deepseek.com/v1', null));
        self::assertSame([], $adapter->query(null));
        self::assertSame(['Authorization' => 'Bearer sk-test'], $adapter->headers('sk-test'));
    }

    public function test_openai_compatible_adapter_parses_the_list_without_pagination(): void
    {
        $adapter = new TalosOpenAiCompatibleModelCatalogAdapter;

        $page = $adapter->parsePage('openai', [
            'object' => 'list',
            'data' => [
                ['id' => 'gpt-4.1-mini', 'object' => 'model', 'owned_by' => 'openai'],
                ['id' => 'gpt-4.1', 'object' => 'model', 'owned_by' => 'system'],
            ],
        ]);

        self::assertInstanceOf(TalosProviderModelCatalogPage::class, $page);
        self::assertFalse($page->hasMore());
        self::assertNull($page->nextCursor());
        self::assertCount(2, $page->items());

        $first = $page->items()[0]->toArray();
        self::assertSame('gpt-4.1-mini', $first['id']);
        self::assertSame('gpt-4.1-mini', $first['display_name']);
        self::assertSame('openai', $first['provider']);
        self::assertSame('openai', $first['owned_by']);
        self::assertSame('unknown', $first['chat_compatibility']);
        self::assertSame('unknown', $first['lifecycle']);
    }

    public function test_openai_compatible_adapter_rejects_a_non_list_payload(): void
    {
        $adapter = new TalosOpenAiCompatibleModelCatalogAdapter;

        try {
            $adapter->parsePage('openai', ['data' => ['not-an-object']]);
            self::fail('Expected a typed catalog exception.');
        } catch (TalosProviderModelCatalogException $exception) {
            self::assertSame('MODEL_CATALOG_RESPONSE_INVALID', $exception->faultCode());
            self::assertFalse($exception->retryable());
            self::assertSame('openai', $exception->provider());
            self::assertSame([
                'code' => 'MODEL_CATALOG_RESPONSE_INVALID',
                'message' => $exception->getMessage(),
                'retryable' => false,
                'retry_after_seconds' => null,
                'provider' => 'openai',
            ], $exception->toApiArray());
        }
    }

    public function test_openai_compatible_adapter_rejects_an_entry_without_a_string_id(): void
    {
        $adapter = new TalosOpenAiCompatibleModelCatalogAdapter;

        $this->expectException(TalosProviderModelCatalogException::class);
        $adapter->parsePage('deepseek', [
            'object' => 'list',
            'data' => [['object' => 'model', 'owned_by' => 'deepseek']],
        ]);
    }

    public function test_anthropic_adapter_paginates_with_after_id_and_maps_capabilities(): void
    {
        $adapter = new TalosAnthropicModelCatalogAdapter;

        self::assertTrue($adapter->supports('anthropic'));
        self::assertFalse($adapter->supports('openai'));
        self::assertSame('https://api.anthropic.com/v1/models', $adapter->endpoint('anthropic', 'https://api.anthropic.com/v1', null));
        self::assertSame(['limit' => '1000'], $adapter->query(null));
        self::assertSame(['limit' => '1000', 'after_id' => 'claude-x'], $adapter->query('claude-x'));
        self::assertSame(['x-api-key' => 'sk-ant', 'anthropic-version' => '2023-06-01'], $adapter->headers('sk-ant'));

        $page = $adapter->parsePage('anthropic', [
            'data' => [[
                'id' => 'claude-sonnet-4-6',
                'display_name' => 'Claude Sonnet 4.6',
                'type' => 'model',
                'created_at' => '2026-02-04T00:00:00Z',
                'max_input_tokens' => 200000,
                'max_tokens' => 64000,
                'capabilities' => [
                    'image_input' => ['supported' => true],
                    'structured_outputs' => ['supported' => true],
                    'thinking' => ['supported' => true],
                    'code_execution' => ['supported' => false],
                ],
            ]],
            'has_more' => true,
            'first_id' => 'claude-sonnet-4-6',
            'last_id' => 'claude-sonnet-4-6',
        ]);

        self::assertTrue($page->hasMore());
        self::assertSame('claude-sonnet-4-6', $page->nextCursor());
        $item = $page->items()[0]->toArray();
        self::assertSame('claude-sonnet-4-6', $item['id']);
        self::assertSame('Claude Sonnet 4.6', $item['display_name']);
        self::assertSame('supported', $item['chat_compatibility']);
        self::assertTrue($item['capabilities']['vision']);
        self::assertTrue($item['capabilities']['tools']);
        self::assertTrue($item['capabilities']['reasoning']);
        self::assertTrue($item['capabilities']['text']);
        self::assertSame(200000, $item['context_window']);
        self::assertSame(64000, $item['max_output_tokens']);
    }

    public function test_anthropic_adapter_stops_pagination_when_has_more_is_false(): void
    {
        $adapter = new TalosAnthropicModelCatalogAdapter;

        $page = $adapter->parsePage('anthropic', [
            'data' => [['id' => 'claude-opus-4-6', 'display_name' => 'Claude Opus 4.6', 'type' => 'model']],
            'has_more' => false,
            'last_id' => 'claude-opus-4-6',
        ]);

        self::assertFalse($page->hasMore());
        self::assertNull($page->nextCursor());
    }

    public function test_gemini_adapter_uses_native_endpoint_header_key_and_generate_content_gate(): void
    {
        $adapter = new TalosGeminiModelCatalogAdapter;

        self::assertTrue($adapter->supports('gemini'));
        self::assertSame(
            'https://generativelanguage.googleapis.com/v1beta/models',
            $adapter->endpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', null),
        );
        self::assertSame(['pageSize' => '1000'], $adapter->query(null));
        self::assertSame(['pageSize' => '1000', 'pageToken' => 'tok-2'], $adapter->query('tok-2'));
        self::assertSame(['x-goog-api-key' => 'gk-test'], $adapter->headers('gk-test'));

        $page = $adapter->parsePage('gemini', [
            'models' => [
                [
                    'name' => 'models/gemini-2.5-flash',
                    'displayName' => 'Gemini 2.5 Flash',
                    'inputTokenLimit' => 1048576,
                    'outputTokenLimit' => 65536,
                    'supportedGenerationMethods' => ['generateContent', 'countTokens'],
                ],
                [
                    'name' => 'models/embedding-001',
                    'displayName' => 'Embedding 001',
                    'supportedGenerationMethods' => ['embedContent'],
                ],
            ],
            'nextPageToken' => 'tok-2',
        ]);

        self::assertTrue($page->hasMore());
        self::assertSame('tok-2', $page->nextCursor());
        $chat = $page->items()[0]->toArray();
        self::assertSame('gemini-2.5-flash', $chat['id']);
        self::assertSame('supported', $chat['chat_compatibility']);
        self::assertSame(1048576, $chat['context_window']);
        $embedding = $page->items()[1]->toArray();
        self::assertSame('embedding-001', $embedding['id']);
        self::assertSame('unsupported', $embedding['chat_compatibility']);
    }

    public function test_openrouter_adapter_requests_all_modalities_and_maps_architecture(): void
    {
        $adapter = new TalosOpenRouterModelCatalogAdapter;

        self::assertTrue($adapter->supports('openrouter'));
        self::assertSame('https://openrouter.ai/api/v1/models', $adapter->endpoint('openrouter', 'https://openrouter.ai/api/v1', null));
        self::assertSame(['output_modalities' => 'all'], $adapter->query(null));
        self::assertSame(['Authorization' => 'Bearer sk-or'], $adapter->headers('sk-or'));

        $page = $adapter->parsePage('openrouter', [
            'data' => [
                [
                    'id' => 'openai/gpt-4o',
                    'canonical_slug' => 'openai/gpt-4o',
                    'name' => 'OpenAI: GPT-4o',
                    'context_length' => 128000,
                    'architecture' => [
                        'input_modalities' => ['text', 'image'],
                        'output_modalities' => ['text'],
                    ],
                    'supported_parameters' => ['tools', 'reasoning', 'structured_outputs'],
                ],
                [
                    'id' => 'black-forest-labs/flux',
                    'name' => 'FLUX',
                    'architecture' => [
                        'input_modalities' => ['text'],
                        'output_modalities' => ['image'],
                    ],
                    'supported_parameters' => [],
                ],
            ],
        ]);

        self::assertFalse($page->hasMore());
        $chat = $page->items()[0]->toArray();
        self::assertSame('openai/gpt-4o', $chat['id']);
        self::assertSame('OpenAI: GPT-4o', $chat['display_name']);
        self::assertSame('openai/gpt-4o', $chat['canonical_slug']);
        self::assertSame('supported', $chat['chat_compatibility']);
        self::assertTrue($chat['capabilities']['vision']);
        self::assertTrue($chat['capabilities']['tools']);
        self::assertTrue($chat['capabilities']['reasoning']);
        $image = $page->items()[1]->toArray();
        self::assertSame('unsupported', $image['chat_compatibility']);
        self::assertTrue($image['capabilities']['image_output']);
    }

    public function test_ollama_adapter_uses_loopback_tags_without_auth_and_maps_digest(): void
    {
        $adapter = new TalosOllamaModelCatalogAdapter;

        self::assertTrue($adapter->supports('ollama'));
        self::assertSame('http://127.0.0.1:11434/api/tags', $adapter->endpoint('ollama', 'http://127.0.0.1:11434/v1', null));
        self::assertSame([], $adapter->query(null));
        self::assertSame([], $adapter->headers('anything'));

        $digest = str_repeat('a', 64);
        $page = $adapter->parsePage('ollama', [
            'models' => [[
                'name' => 'llama3.1:latest',
                'model' => 'llama3.1:latest',
                'digest' => $digest,
                'details' => ['family' => 'llama', 'parameter_size' => '8B', 'quantization_level' => 'Q4_0'],
            ]],
        ]);

        self::assertFalse($page->hasMore());
        $item = $page->items()[0]->toArray();
        self::assertSame('llama3.1:latest', $item['id']);
        self::assertSame($digest, $item['local_digest']);
        self::assertSame('unknown', $item['chat_compatibility']);
    }
}
