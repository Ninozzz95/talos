<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Models\ProviderPromptCacheCapabilityTable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ProviderPromptCacheCapabilityTableTest extends TestCase
{
    /**
     * @return list<array{0: string, 1: string, 2: ?int, 3: list<string>, 4: list<string>, 5: array{read: bool, write: bool, miss: bool}}>
     */
    public static function supportedModels(): array
    {
        return [
            [
                'openai',
                'gpt-5.6',
                1024,
                ['provider_default', 'automatic', 'explicit', 'disabled'],
                ['30m'],
                ['read' => true, 'write' => true, 'miss' => false],
            ],
            [
                'openai',
                'gpt-4o-mini',
                1024,
                ['provider_default', 'automatic'],
                [],
                ['read' => true, 'write' => false, 'miss' => false],
            ],
            [
                'anthropic',
                'claude-sonnet-5',
                1024,
                ['provider_default', 'automatic', 'explicit', 'disabled'],
                ['5m', '1h'],
                ['read' => true, 'write' => true, 'miss' => false],
            ],
            [
                'anthropic',
                'claude-opus-4-6',
                4096,
                ['provider_default', 'automatic', 'explicit', 'disabled'],
                ['5m', '1h'],
                ['read' => true, 'write' => true, 'miss' => false],
            ],
            [
                'gemini',
                'gemini-3.5-flash',
                4096,
                ['provider_default'],
                [],
                ['read' => true, 'write' => false, 'miss' => false],
            ],
            [
                'gemini',
                'gemini-2.5-pro',
                2048,
                ['provider_default'],
                [],
                ['read' => true, 'write' => false, 'miss' => false],
            ],
            [
                'deepseek',
                'deepseek-chat',
                null,
                ['provider_default'],
                [],
                ['read' => true, 'write' => false, 'miss' => true],
            ],
        ];
    }

    /**
     * @param list<string> $modes
     * @param list<string> $ttls
     * @param array{read: bool, write: bool, miss: bool} $usageMetrics
     */
    #[DataProvider('supportedModels')]
    public function test_resolve_returns_versioned_fail_closed_provider_capabilities(
        string $provider,
        string $model,
        ?int $minimumInputTokens,
        array $modes,
        array $ttls,
        array $usageMetrics,
    ): void {
        $capability = ProviderPromptCacheCapabilityTable::resolve($provider, $model);

        self::assertSame('talos.prompt_cache.capability.v1', $capability['contract']);
        self::assertTrue($capability['supported']);
        self::assertSame($minimumInputTokens, $capability['minimum_input_tokens']);
        self::assertSame($modes, $capability['modes']);
        self::assertSame($ttls, $capability['ttls']);
        self::assertSame($usageMetrics, $capability['usage_metrics']);
    }

    public function test_gpt_5_6_exposes_only_documented_breakpoint_controls(): void
    {
        self::assertSame(
            ['system', 'message'],
            ProviderPromptCacheCapabilityTable::resolve('OpenAI', 'GPT-5.6')['breakpoints'],
        );
    }

    public function test_anthropic_exposes_tools_system_and_message_breakpoints(): void
    {
        self::assertSame(
            ['tools', 'system', 'message'],
            ProviderPromptCacheCapabilityTable::resolve('anthropic', 'claude-opus-4-8')['breakpoints'],
        );
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    public static function unknownModels(): array
    {
        return [
            ['openai', 'gpt-3.5-turbo'],
            ['openai', 'gpt-5.7'],
            ['openai', 'future-model-without-proof'],
            ['anthropic', 'claude-2.1'],
            ['gemini', 'gemini-2.0-flash'],
            ['openrouter', 'openai/gpt-5.6'],
            ['ollama', 'gpt-5.6'],
            ['openai_compatible', 'gpt-5.6'],
            ['unknown', 'whatever'],
            ['', ''],
        ];
    }

    #[DataProvider('unknownModels')]
    public function test_unknown_provider_or_model_fails_closed(string $provider, string $model): void
    {
        self::assertSame([
            'contract' => 'talos.prompt_cache.capability.v1',
            'supported' => false,
            'minimum_input_tokens' => null,
            'modes' => [],
            'ttls' => [],
            'breakpoints' => [],
            'usage_metrics' => [
                'read' => false,
                'write' => false,
                'miss' => false,
            ],
        ], ProviderPromptCacheCapabilityTable::resolve($provider, $model));
    }
}
