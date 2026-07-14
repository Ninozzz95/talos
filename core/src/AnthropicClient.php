<?php

declare(strict_types=1);

namespace Kadmos;

use InvalidArgumentException;
use Kadmos\Provider\PinnedProviderHttpTransport;
use Kadmos\Security\ExecutionPolicy;
use RuntimeException;

/**
 * LLM client for Anthropic's Claude API.
 */
final class AnthropicClient implements LLMClientInterface
{
    private string $apiKey;
    private string $model;
    private string $systemPrompt;
    private int $timeoutMs;
    private ?\Closure $transport;
    private ?\Closure $curlTransport;
    private ExecutionPolicy $executionPolicy;

    /** @var list<array{role: string, content: string}> */
    private array $conversation = [];

    /** @var list<array{field: string, expected: string, received: string, message: string}> */
    private array $pendingFaults = [];

    public function __construct(
        string $apiKey,
        string $model = 'claude-sonnet-4-20250514',
        int $timeoutMs = 30000,
        ?callable $transport = null,
        ?ExecutionPolicy $executionPolicy = null,
        ?callable $curlTransport = null,
    ) {
        if (trim($apiKey) === '') {
            throw new InvalidArgumentException('Anthropic provider requires an API key.');
        }
        $this->apiKey = $apiKey;
        $this->model = $model;
        $this->timeoutMs = $timeoutMs;
        $this->transport = $transport !== null ? \Closure::fromCallable($transport) : null;
        $this->curlTransport = $curlTransport !== null ? \Closure::fromCallable($curlTransport) : null;
        $this->executionPolicy = $executionPolicy ?? new ExecutionPolicy(
            allowedHosts: ['api.anthropic.com'],
            maxTimeoutMs: max(1, $timeoutMs),
        );
        $decision = $this->executionPolicy->inspectUrl(
            'https://api.anthropic.com/v1/messages',
            $timeoutMs,
            requireResolution: false,
            rejectQueryAndFragment: true,
        );
        if (! $decision->allowed) {
            throw new RuntimeException('Anthropic endpoint blocked by execution policy: '.$decision->reason);
        }
        $this->systemPrompt = SystemPromptBuilder::build();
    }

    public function withSystemPrompt(string $systemPrompt): self
    {
        $this->systemPrompt = $systemPrompt;
        return $this;
    }

    public function generate(string $prompt): string
    {
        $messages = $this->buildMessages($prompt);

        $body = \json_encode([
            'model' => $this->model,
            'max_tokens' => 4096,
            'temperature' => 0.0,
            'system' => $this->systemPrompt,
            'messages' => $messages,
        ], JSON_THROW_ON_ERROR);

        $response = $this->callApi('https://api.anthropic.com/v1/messages', $body);

        $content = $response['content'][0]['text'] ?? '';
        $this->conversation[] = ['role' => 'assistant', 'content' => $content];

        return $this->extractJson($content);
    }

    public function injectFault(array $errors): void
    {
        $this->pendingFaults = \array_merge($this->pendingFaults, $errors);
    }

    /**
     * @return list<array{role: string, content: string}>
     */
    private function buildMessages(string $prompt): array
    {
        $messages = [];

        // Add pending faults as correction context
        if ($this->pendingFaults !== []) {
            $faultText = "VALIDATION_FAULT: Previous response had errors. Correct ONLY these fields:\n";
            foreach ($this->pendingFaults as $fault) {
                $faultText .= "- {$fault['field']}: expected {$fault['expected']}, got {$fault['received']}\n";
            }
            $messages[] = ['role' => 'user', 'content' => $faultText];
            $this->pendingFaults = [];
        }

        // Add the current DAG state
        $messages[] = ['role' => 'user', 'content' => $prompt];

        return $messages;
    }

    /**
     * @return array<string, mixed>
     */
    private function callApi(string $url, string $body): array
    {
        $headers = [
            'Content-Type: application/json',
            "x-api-key: {$this->apiKey}",
            'anthropic-version: 2023-06-01',
        ];
        if ($this->transport !== null) {
            $response = ($this->transport)($url, $body, $headers, $this->timeoutMs);
            if (! is_array($response)) {
                throw new RuntimeException('Anthropic custom transport returned an invalid response.');
            }

            return $response;
        }
        $payload = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($payload)) {
            throw new RuntimeException('Anthropic request body must be a JSON object.');
        }
        $transport = new PinnedProviderHttpTransport(
            provider: 'anthropic',
            executionPolicy: $this->executionPolicy,
            curlTransport: $this->curlTransport,
            maxTimeoutMs: $this->timeoutMs,
        );

        return $transport($url, $payload, $headers, $this->timeoutMs);
    }

    /**
     * Extracts JSON from LLM response, handling markdown code blocks.
     */
    private function extractJson(string $raw): string
    {
        if (\preg_match('/```(?:json)?\s*\n?(.*?)\n?```/s', $raw, $matches)) {
            return \trim($matches[1]);
        }

        return \trim($raw);
    }
}
