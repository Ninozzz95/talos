<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\OpenAIClient;

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected: ' . var_export($expected, true) . ' Actual: ' . var_export($actual, true));
    }
}

function testOpenAIClientDoesNotDuplicateChatCompletionsEndpoint(): void
{
    $sentUrl = null;

    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions/',
        transport: static function (string $url, string $body, array $headers, int $timeoutMs) use (&$sentUrl): array {
            $sentUrl = $url;

            return [
                'choices' => [
                    ['message' => ['content' => 'ok']],
                ],
                'usage' => [
                    'total_tokens' => 1,
                    'prompt_tokens' => 1,
                    'completion_tokens' => 0,
                ],
            ];
        },
    );

    assertSameValue('ok', $client->generate('ping'), 'Client should return provider content.');
    assertSameValue('https://api.deepseek.com/v1/chat/completions', $sentUrl, 'Client should not append duplicate chat/completions segments.');
}

function testOpenAIClientAppendsChatCompletionsForBaseUrl(): void
{
    $sentUrl = null;

    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        transport: static function (string $url, string $body, array $headers, int $timeoutMs) use (&$sentUrl): array {
            $sentUrl = $url;

            return [
                'choices' => [
                    ['message' => ['content' => 'ok']],
                ],
                'usage' => [],
            ];
        },
    );

    $client->generate('ping');

    assertSameValue('https://api.deepseek.com/v1/chat/completions', $sentUrl, 'Client should append the chat endpoint for base provider URLs.');
}

testOpenAIClientDoesNotDuplicateChatCompletionsEndpoint();
testOpenAIClientAppendsChatCompletionsForBaseUrl();

echo "All OpenAIClient endpoint tests passed" . PHP_EOL;
