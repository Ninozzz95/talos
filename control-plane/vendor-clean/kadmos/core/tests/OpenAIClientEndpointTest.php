<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\OpenAIClient;
use Kadmos\Provider\ProviderRequestException;

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected: ' . var_export($expected, true) . ' Actual: ' . var_export($actual, true));
    }
}

function assertTrueValue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
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

function testOpenAIClientSendsAndCapturesNativeToolCallsByType(): void
{
    $sentPayload = null;
    $toolCall = [
        'id' => 'call_browser_1',
        'type' => 'function',
        'function' => [
            'name' => 'talos_browser_read',
            'arguments' => '{"operation":"screenshot","arguments":{}}',
        ],
    ];
    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        transport: static function (string $url, string $body) use (&$sentPayload, $toolCall): array {
            $sentPayload = json_decode($body, true, flags: JSON_THROW_ON_ERROR);

            return [
                'choices' => [['message' => ['content' => null, 'tool_calls' => [$toolCall]]]],
                'usage' => [],
            ];
        },
    );
    $tools = [[
        'type' => 'function',
        'function' => [
            'name' => 'talos_browser_read',
            'description' => 'Execute one read-only browser observation.',
            'parameters' => ['type' => 'object'],
        ],
    ]];

    $content = $client->withTools($tools)->generate('Capture the current page.');

    assertSameValue('', $content, 'A native tool-only response has no assistant prose.');
    assertSameValue($tools, $sentPayload['tools'] ?? null, 'Configured native tools must be sent to the provider.');
    assertSameValue('auto', $sentPayload['tool_choice'] ?? null, 'Native Browser planning should allow automatic tool selection.');
    assertSameValue([$toolCall], $client->getLastToolCalls(), 'Tool calls must be captured by response type instead of array position.');
}

function testOpenAIClientFallsBackToTextPlanningOnlyWhenProviderRejectsTools(): void
{
    $sentPayloads = [];
    $client = new OpenAIClient(
        apiKey: 'secret',
        model: 'compatible-model',
        baseUrl: 'https://api.deepseek.com/v1',
        transport: static function (string $url, string $body) use (&$sentPayloads): array {
            $sentPayloads[] = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
            if (count($sentPayloads) === 1) {
                throw new ProviderRequestException(400, '{"error":{"message":"tools are not supported"}}');
            }

            return [
                'choices' => [['message' => ['content' => '[{"action":"SPAWN_NODE"}]']]],
                'usage' => [],
            ];
        },
    );
    $tools = [[
        'type' => 'function',
        'function' => ['name' => 'talos_browser_read', 'parameters' => ['type' => 'object']],
    ]];

    $content = $client->withTools($tools)->generateWithToolFallback('Inspect the page.');

    assertSameValue('[{"action":"SPAWN_NODE"}]', $content, 'The text fallback response must be returned for normal parsing.');
    assertSameValue($tools, $sentPayloads[0]['tools'] ?? null, 'The first attempt must use native tools.');
    assertSameValue(false, array_key_exists('tools', $sentPayloads[1]), 'The fallback attempt must omit native tools.');
}

function testKadmosChatForwardsProviderIdentityToTheNetworkPolicy(): void
{
    $source = (string) file_get_contents(__DIR__ . '/../kadmos-chat.php');

    assertTrueValue(
        str_contains($source, 'provider: $provider'),
        'kadmos-chat must pass provider identity into OpenAIClient so Ollama and remote policies cannot be confused.',
    );
    assertTrueValue(
        str_contains($source, "'ollama' => 'http://127.0.0.1:11434/v1'"),
        'kadmos-chat must keep the default Ollama endpoint on loopback.',
    );
}

testOpenAIClientDoesNotDuplicateChatCompletionsEndpoint();
testOpenAIClientAppendsChatCompletionsForBaseUrl();
testOpenAIClientSendsAndCapturesNativeToolCallsByType();
testOpenAIClientFallsBackToTextPlanningOnlyWhenProviderRejectsTools();
testKadmosChatForwardsProviderIdentityToTheNetworkPolicy();

echo "All OpenAIClient endpoint tests passed" . PHP_EOL;
