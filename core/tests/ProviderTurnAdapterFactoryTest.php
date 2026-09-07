<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\AnthropicMessagesTurnAdapter;
use Kadmos\Provider\GeminiTurnAdapter;
use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\OpenAiResponsesTurnAdapter;
use Kadmos\Provider\ProviderTurnAdapterFactory;
use Kadmos\Provider\StreamingProviderTurnAdapter;

function assertAdapterFactory(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function testProviderTurnAdapterFactoryRoutesExplicitProtocolsWithoutFallback(): void
{
    $factory = new ProviderTurnAdapterFactory();

    $adapters = [
        [$factory->create('deepseek', 'chat_completions', 'https://api.deepseek.com/v1/chat/completions', 'secret'), OpenAiChatTurnAdapter::class, 'DeepSeek must use the OpenAI-compatible chat adapter.'],
        [$factory->create('openai', 'responses', 'https://api.openai.com/v1/responses', 'secret'), OpenAiResponsesTurnAdapter::class, 'OpenAI Responses must use its native adapter.'],
        [$factory->create('anthropic', 'messages', 'https://api.anthropic.com/v1/messages', 'secret'), AnthropicMessagesTurnAdapter::class, 'Anthropic must use the Messages adapter.'],
        [$factory->create('gemini', 'generate_content', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', 'secret'), GeminiTurnAdapter::class, 'Gemini must use the generateContent adapter.'],
        [$factory->create('ollama', 'chat_completions', 'http://127.0.0.1:11434/v1/chat/completions', ''), OpenAiChatTurnAdapter::class, 'Ollama must use the credential-free loopback chat adapter.'],
    ];
    foreach ($adapters as [$adapter, $expectedClass, $message]) {
        assertAdapterFactory($adapter instanceof $expectedClass, $message);
        assertAdapterFactory($adapter instanceof StreamingProviderTurnAdapter, "{$expectedClass} must expose canonical streaming through the production factory.");
    }

    $hostileRejected = false;
    try {
        $factory->create('openai', 'responses', 'https://evil.example/v1/responses', 'secret');
    } catch (InvalidArgumentException) {
        $hostileRejected = true;
    }
    assertAdapterFactory($hostileRejected, 'The production factory must reject endpoints outside the provider allowlist before any request.');

    foreach ([
        ['anthropic', 'chat_completions'],
        ['gemini', 'responses'],
        ['unknown', 'chat_completions'],
    ] as [$provider, $protocol]) {
        try {
            $factory->create($provider, $protocol, 'https://example.com/v1', 'secret');
        } catch (InvalidArgumentException) {
            continue;
        }

        throw new RuntimeException("Unsupported provider/protocol pair {$provider}/{$protocol} must fail closed.");
    }
}

testProviderTurnAdapterFactoryRoutesExplicitProtocolsWithoutFallback();
echo "All provider turn adapter factory tests passed\n";
