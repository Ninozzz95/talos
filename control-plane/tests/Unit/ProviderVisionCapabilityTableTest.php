<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Models\ProviderVisionCapabilityTable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ProviderVisionCapabilityTableTest extends TestCase
{
    /**
     * @return list<array{0: string, 1: string, 2: bool}>
     */
    public static function visionModels(): array
    {
        return [
            // OpenAI vision-capable families.
            ['openai', 'gpt-4o', true],
            ['openai', 'gpt-4o-mini', true],
            ['openai', 'gpt-4.1', true],
            ['openai', 'gpt-4-turbo', true],
            ['openai', 'o4-mini', true],
            ['openai', 'gpt-5', true],
            ['OpenAI', 'GPT-4O', true],
            // OpenAI non-vision families fail closed.
            ['openai', 'gpt-3.5-turbo', false],
            ['openai', 'text-embedding-3-large', false],
            // Anthropic vision families.
            ['anthropic', 'claude-3-5-sonnet-20241022', true],
            ['anthropic', 'claude-sonnet-4-20250514', true],
            ['anthropic', 'claude-3-haiku-20240307', true],
            ['anthropic', 'claude-opus-4-20250514', true],
            // Anthropic legacy without vision fails closed.
            ['anthropic', 'claude-2.1', false],
            // Gemini vision families.
            ['gemini', 'gemini-1.5-pro', true],
            ['gemini', 'gemini-2.0-flash', true],
            ['gemini', 'gemini-2.5-pro', true],
            // Gemini legacy fails closed.
            ['gemini', 'gemini-1.0-pro', false],
            // Providers routed through the OpenAI-compatible chat adapter cannot take
            // native input resources (adapter rejects them unless provider === openai).
            ['openrouter', 'openai/gpt-4o', false],
            ['deepseek', 'deepseek-chat', false],
            ['ollama', 'llava', false],
            ['groq', 'llama-3.2-90b-vision', false],
            // Unknown provider / model fails closed (default-deny).
            ['unknown', 'whatever', false],
            ['', '', false],
        ];
    }

    #[DataProvider('visionModels')]
    public function test_resolve_derives_vision_capability_by_provider_and_family(string $provider, string $model, bool $expected): void
    {
        self::assertSame($expected, ProviderVisionCapabilityTable::resolve($provider, $model));
    }

    public function test_provider_can_native_images_is_the_hard_fail_closed_gate(): void
    {
        self::assertTrue(ProviderVisionCapabilityTable::providerCanNativeImages('openai'));
        self::assertTrue(ProviderVisionCapabilityTable::providerCanNativeImages('anthropic'));
        self::assertTrue(ProviderVisionCapabilityTable::providerCanNativeImages('gemini'));
        self::assertTrue(ProviderVisionCapabilityTable::providerCanNativeImages('GEMINI'));

        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('openrouter'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('deepseek'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('ollama'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('groq'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('openai_compatible'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages('unknown'));
        self::assertFalse(ProviderVisionCapabilityTable::providerCanNativeImages(''));
    }

    public function test_supported_native_image_providers_lists_only_native_image_providers(): void
    {
        self::assertSame(
            ['openai', 'anthropic', 'gemini'],
            ProviderVisionCapabilityTable::supportedNativeImageProviders(),
        );
    }
}
