<?php

declare(strict_types=1);

namespace Kadmos;

/**
 * LLM client for Anthropic's Claude API.
 */
final class AnthropicClient implements LLMClientInterface
{
    private string $apiKey;
    private string $model;
    private string $systemPrompt;
    private int $timeoutMs;

    /** @var list<array{role: string, content: string}> */
    private array $conversation = [];

    /** @var list<array{field: string, expected: string, received: string, message: string}> */
    private array $pendingFaults = [];

    public function __construct(
        string $apiKey,
        string $model = 'claude-sonnet-4-20250514',
        int $timeoutMs = 30000,
    ) {
        $this->apiKey = $apiKey;
        $this->model = $model;
        $this->timeoutMs = $timeoutMs;
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
        ]);

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
        $ch = \curl_init($url);
        \curl_setopt_array($ch, [
            \CURLOPT_RETURNTRANSFER => true,
            \CURLOPT_POST => true,
            \CURLOPT_POSTFIELDS => $body,
            \CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                "x-api-key: {$this->apiKey}",
                'anthropic-version: 2023-06-01',
            ],
            \CURLOPT_TIMEOUT_MS => $this->timeoutMs,
            \CURLOPT_SSL_VERIFYPEER => false,
            \CURLOPT_SSL_VERIFYHOST => 0,
        ]);

        $response = \curl_exec($ch);
        $error = \curl_error($ch);
        $httpCode = \curl_getinfo($ch, \CURLINFO_HTTP_CODE);

        if ($response === false) {
            throw new \RuntimeException("Anthropic API unreachable: {$error}");
        }

        if ($httpCode >= 400) {
            throw new \RuntimeException("Anthropic API error HTTP {$httpCode}: {$response}");
        }

        return \json_decode($response, true, flags: \JSON_THROW_ON_ERROR);
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
