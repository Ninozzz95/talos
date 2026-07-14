<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use InvalidArgumentException;
use Kadmos\Security\ExecutionPolicy;

final class ProviderTurnAdapterFactory
{
    public function create(
        string $provider,
        string $protocol,
        string $endpoint,
        string $apiKey,
        int $timeoutMs = 30000,
        ?ExecutionPolicy $executionPolicy = null,
        ?callable $curlTransport = null,
    ): ProviderTurnAdapter {
        $provider = strtolower(trim($provider));
        $protocol = strtolower(trim($protocol));
        $transport = new PinnedProviderHttpTransport(
            provider: $provider,
            executionPolicy: $executionPolicy,
            curlTransport: $curlTransport,
            maxTimeoutMs: $timeoutMs,
        );
        try {
            $transport->assertEndpointAllowed($endpoint, $timeoutMs);
        } catch (\RuntimeException $exception) {
            throw new InvalidArgumentException('Provider endpoint rejected by execution policy.', previous: $exception);
        }

        return match (true) {
            $protocol === 'chat_completions'
                && in_array($provider, ['openai', 'deepseek', 'openrouter', 'groq', 'ollama', 'openai_compatible'], true) => new OpenAiChatTurnAdapter(
                    provider: $provider,
                    endpoint: $endpoint,
                    apiKey: $apiKey,
                    transport: $transport,
                    timeoutMs: $timeoutMs,
                ),
            $provider === 'openai' && $protocol === 'responses' => new OpenAiResponsesTurnAdapter(
                endpoint: $endpoint,
                apiKey: $apiKey,
                transport: $transport,
                timeoutMs: $timeoutMs,
            ),
            $provider === 'anthropic' && $protocol === 'messages' => new AnthropicMessagesTurnAdapter(
                endpoint: $endpoint,
                apiKey: $apiKey,
                transport: $transport,
                timeoutMs: $timeoutMs,
            ),
            $provider === 'gemini' && $protocol === 'generate_content' => new GeminiTurnAdapter(
                endpoint: $endpoint,
                apiKey: $apiKey,
                transport: $transport,
                timeoutMs: $timeoutMs,
            ),
            default => throw new InvalidArgumentException("Unsupported provider/protocol pair: {$provider}/{$protocol}."),
        };
    }
}
