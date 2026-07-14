<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\OpenAiResponsesTurnAdapter;
use Kadmos\Provider\ProviderRequestException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Kadmos\Tests\Support\FixtureProviderTransport;

function assertResponsesAdapter(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function responsesFixture(string $name): array
{
    $decoded = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/providers/openai-responses/'.$name.'.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    return is_array($decoded) ? $decoded : throw new RuntimeException("Invalid Responses fixture: {$name}");
}

function responsesRequest(bool $emptyProperties = false): ProviderTurnRequest
{
    $definition = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/tool-contracts/valid-definition.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    if ($emptyProperties) {
        $definition['inputSchema']['properties'] = [];
        $definition['inputSchema']['required'] = [];
    }

    return new ProviderTurnRequest(
        provider: 'openai',
        model: 'gpt-4.1-mini',
        systemPrompt: 'Ground current web claims in tool evidence.',
        messages: [
            ['role' => 'user', 'content' => 'Earlier question.'],
            ['role' => 'assistant', 'content' => 'Earlier answer.'],
            ['role' => 'user', 'content' => 'Inspect https://example.com.'],
        ],
        tools: [ToolDefinition::fromStrictArray($definition)],
        maxTokens: 2048,
        temperature: 0.0,
    );
}

function testResponsesAdapterSerializesEmptySchemaPropertiesAsAnObject(): void
{
    $responses = [responsesFixture('final-text')['provider_response']];
    $requests = [];
    responsesAdapter($responses, $requests)->start(responsesRequest(emptyProperties: true));

    $payload = json_encode($requests[0]['payload'], JSON_THROW_ON_ERROR);
    assertResponsesAdapter(str_contains($payload, '"properties":{}'), 'Responses tool schemas must preserve empty JSON objects on the wire.');
}

/** @param list<array<string, mixed>|Throwable> $responses @param list<array<string, mixed>> $requests */
function responsesAdapter(array &$responses, array &$requests): OpenAiResponsesTurnAdapter
{
    return new OpenAiResponsesTurnAdapter(
        endpoint: 'https://api.openai.com/v1/responses',
        apiKey: 'test-provider-secret',
        transport: new FixtureProviderTransport(static function (string $endpoint, array $payload, array $headers, int $timeoutMs) use (&$responses, &$requests): array {
            $requests[] = compact('endpoint', 'payload', 'headers', 'timeoutMs');
            $next = array_shift($responses);
            if ($next instanceof Throwable) {
                throw $next;
            }

            return is_array($next) ? $next : throw new RuntimeException('Responses fixture queue is empty.');
        }),
    );
}

function testResponsesAdapterNormalizesFinalMixedAndMultipleOutputs(): void
{
    $responses = [responsesFixture('final-text')['provider_response']];
    $requests = [];
    $final = responsesAdapter($responses, $requests)->start(responsesRequest());
    assertResponsesAdapter($final->kind === 'final' && $final->text === 'The page is ready.', 'Responses final output_text must normalize to final text.');
    assertResponsesAdapter(($requests[0]['payload']['input'][1]['content'] ?? null) === 'Earlier answer.', 'Responses input must preserve complete conversation history.');

    $responses = [responsesFixture('mixed-preamble-tool-call')['provider_response']];
    $requests = [];
    $mixed = responsesAdapter($responses, $requests)->start(responsesRequest());
    assertResponsesAdapter($mixed->kind === 'tool_calls', 'Responses function_call must normalize as executable intent.');
    assertResponsesAdapter($mixed->text === 'I will inspect the page.', 'Responses output_text beside a call is preamble.');
    assertResponsesAdapter($mixed->toolCalls[0]->providerCallId === 'call_browser_1', 'Responses call_id must survive normalization.');

    $responses = [responsesFixture('multiple-tool-calls')['provider_response']];
    $requests = [];
    $multiple = responsesAdapter($responses, $requests)->start(responsesRequest());
    assertResponsesAdapter(array_map(static fn ($call): string => $call->providerCallId, $multiple->toolCalls) === ['call_browser_1', 'call_browser_2'], 'Responses multiple calls must preserve output order.');
}

function testResponsesAdapterUsesFunctionCallOutputContinuation(): void
{
    $responses = [
        responsesFixture('mixed-preamble-tool-call')['provider_response'],
        responsesFixture('tool-error-continuation')['provider_response'],
    ];
    $requests = [];
    $adapter = responsesAdapter($responses, $requests);
    $first = $adapter->start(responsesRequest());
    $second = $adapter->continue(
        $first->state,
        [ToolResult::error('call_browser_1', 'BROWSER_TIMEOUT', 'The page timed out.')],
    );

    assertResponsesAdapter($second->kind === 'final', 'Responses may finalize after a tool-level error.');
    assertResponsesAdapter(($requests[1]['payload']['previous_response_id'] ?? null) === 'resp-tools-1', 'Responses continuation must bind previous_response_id.');
    assertResponsesAdapter(($requests[1]['payload']['instructions'] ?? null) === 'Ground current web claims in tool evidence.', 'Responses continuation must resend instructions because previous_response_id does not carry them forward.');
    assertResponsesAdapter(($requests[1]['payload']['input'][0]['type'] ?? null) === 'function_call_output', 'Responses continuation must use function_call_output.');
    assertResponsesAdapter(($requests[1]['payload']['input'][0]['call_id'] ?? null) === 'call_browser_1', 'Responses continuation must correlate call_id.');
}

function testResponsesCapabilitiesSeparateAdapterSupportFromModelVerification(): void
{
    $responses = [];
    $requests = [];
    $capabilities = responsesAdapter($responses, $requests)->capabilities();

    assertResponsesAdapter($capabilities->statefulContinuation === true, 'Responses has provider-managed continuation via previous_response_id.');
    assertResponsesAdapter($capabilities->modelVerified === false, 'Adapter support must not be presented as a verified model capability.');
}

function testResponsesAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors(): void
{
    foreach ([
        'malformed-arguments' => 'failure',
        'refusal' => 'refusal',
        'truncation' => 'incomplete',
    ] as $fixture => $expectedKind) {
        $responses = [responsesFixture($fixture)['provider_response']];
        $requests = [];
        $response = responsesAdapter($responses, $requests)->start(responsesRequest());
        assertResponsesAdapter($response->kind === $expectedKind, "Responses {$fixture} must normalize to {$expectedKind}.");
        assertResponsesAdapter($response->toolCalls === [], "Responses {$fixture} cannot execute partial calls.");
    }

    $responses = [new ProviderRequestException(429, '{"error":{"message":"Bearer sk-provider-secret-value"}}')];
    $requests = [];
    $failure = responsesAdapter($responses, $requests)->start(responsesRequest());
    assertResponsesAdapter($failure->kind === 'failure' && $failure->failure?->retryable === true, 'Responses HTTP 429 must be a typed retryable failure.');
    assertResponsesAdapter(! str_contains(json_encode($failure->failure?->toArray(), JSON_THROW_ON_ERROR), 'sk-provider-secret-value'), 'Responses provider failures must be redacted.');
}

function testResponsesAdapterRejectsListShapedToolArguments(): void
{
    $fixture = responsesFixture('mixed-preamble-tool-call')['provider_response'];
    foreach ($fixture['output'] as &$item) {
        if (($item['type'] ?? null) === 'function_call') {
            $item['arguments'] = '[]';
            break;
        }
    }
    unset($item);
    $responses = [$fixture];
    $requests = [];

    $response = responsesAdapter($responses, $requests)->start(responsesRequest());

    assertResponsesAdapter($response->kind === 'failure', 'List-shaped Responses arguments must fail closed.');
    assertResponsesAdapter($response->toolCalls === [], 'List-shaped Responses arguments must never reach execution.');
}

$tests = [
    'testResponsesAdapterNormalizesFinalMixedAndMultipleOutputs',
    'testResponsesAdapterSerializesEmptySchemaPropertiesAsAnObject',
    'testResponsesAdapterUsesFunctionCallOutputContinuation',
    'testResponsesAdapterFailsClosedForMalformedRefusedIncompleteAndProviderErrors',
    'testResponsesAdapterRejectsListShapedToolArguments',
    'testResponsesCapabilitiesSeparateAdapterSupportFromModelVerification',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All OpenAI Responses adapter tests passed\n";
