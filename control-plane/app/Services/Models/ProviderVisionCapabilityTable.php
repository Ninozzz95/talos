<?php

declare(strict_types=1);

namespace App\Services\Models;

/**
 * Conservative, default-deny derivation of whether a (provider, model) pair can
 * accept native input images (multimodal vision) on the direct provider turn.
 *
 * There is no per-model `supports_vision` signal on TalosModelProfile, and the
 * probe hardcodes vision=false, so vision capability must be DERIVED from the
 * provider + model family. This table is the single source of truth the chat
 * controller consults before ever sending image bytes to a provider.
 *
 * Two layers, both required by the controller (ANDed together):
 *   1. resolve(provider, model): the model family is known to see images.
 *   2. providerCanNativeImages(provider): the provider's turn adapter actually
 *      emits a native image content block. This mirrors the adapter truth
 *      (ProviderCapabilities::nativeInputImages) — only openai/anthropic/gemini
 *      are true. The OpenAI-compatible chat adapter (deepseek/openrouter/ollama/
 *      groq) hard-rejects input resources unless provider === 'openai', so those
 *      providers are treated as non-vision for the image path (fail-closed, never
 *      a silent wrong send).
 *
 * Unknown provider or unknown model family ⇒ false (default-deny).
 */
final class ProviderVisionCapabilityTable
{
    /**
     * Providers whose turn adapter emits a native image content block. This is
     * the hard fail-closed gate; anything else cannot carry images.
     *
     * @var list<string>
     */
    private const NATIVE_IMAGE_PROVIDERS = ['openai', 'anthropic', 'gemini'];

    /**
     * Derive whether the model family (within a native-image provider) is
     * vision-capable. Conservative substrings from published provider docs;
     * default false so TALOS never sends an image a model cannot see.
     */
    public static function resolve(string $provider, string $model): bool
    {
        $provider = strtolower(trim($provider));
        $model = strtolower(trim($model));

        return match ($provider) {
            'openai' => self::hasAny($model, [
                'gpt-4o', 'chatgpt-4o', 'gpt-4.1', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4v',
                'o3', 'o4', 'gpt-5',
            ]),
            'anthropic' => self::hasAny($model, [
                'claude-3', 'claude-4', 'sonnet', 'opus', 'haiku',
            ]),
            'gemini' => self::hasAny($model, [
                'gemini-1.5', 'gemini-1-5', 'gemini-2', 'gemini-2.0', 'gemini-2-0',
                'gemini-2.5', 'gemini-2-5', 'gemini-3', 'pro-vision',
            ]),
            // openrouter/deepseek/ollama/groq/openai_compatible and everything else:
            // the chat adapter cannot carry native input images → fail-closed.
            default => false,
        };
    }

    /**
     * The hard fail-closed gate: does the provider's turn adapter emit a native
     * image content block at all? openai/anthropic/gemini = true; else false.
     */
    public static function providerCanNativeImages(string $provider): bool
    {
        return in_array(strtolower(trim($provider)), self::NATIVE_IMAGE_PROVIDERS, true);
    }

    /**
     * The vision providers to advertise to the composer in a fail-closed refusal.
     *
     * @return list<string>
     */
    public static function supportedNativeImageProviders(): array
    {
        return self::NATIVE_IMAGE_PROVIDERS;
    }

    /**
     * @param  list<string>  $needles
     */
    private static function hasAny(string $model, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($model, $needle)) {
                return true;
            }
        }

        return false;
    }
}
