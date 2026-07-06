<?php

declare(strict_types=1);

namespace AVM;

/**
 * LLM client for OpenAI-compatible APIs (OpenAI, Groq, vLLM, etc.)
 */
final class OpenAIClient implements LLMClientInterface
{
    private string $apiKey;
    private string $model;
    private string $baseUrl;
    private string $systemPrompt;
    private int $timeoutMs;

    /** @var list<array{role: string, content: string}> */
    private array $conversation = [];

    /** @var list<array{field: string, expected: string, received: string, message: string}> */
    private array $pendingFaults = [];

    public function __construct(
        string $apiKey,
        string $model = 'gpt-4o',
        string $baseUrl = 'https://api.openai.com/v1',
        int $timeoutMs = 30000,
    ) {
        $this->apiKey = $apiKey;
        $this->model = $model;
        $this->baseUrl = $baseUrl;
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
        // Build conversation
        $messages = $this->buildMessages($prompt);

        $body = \json_encode([
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => 0.0,
            'max_tokens' => 4096,
        ]);

        $response = $this->callApi("{$this->baseUrl}/chat/completions", $body);

        $content = $response['choices'][0]['message']['content'] ?? '';
        $this->conversation[] = ['role' => 'assistant', 'content' => $content];

        // Extract JSON from markdown code blocks if present
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
        // Start fresh with system prompt
        $messages = [
            ['role' => 'system', 'content' => $this->systemPrompt],
        ];

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
                "Authorization: Bearer {$this->apiKey}",
            ],
            \CURLOPT_TIMEOUT_MS => $this->timeoutMs,
            \CURLOPT_SSL_VERIFYPEER => false,
            \CURLOPT_SSL_VERIFYHOST => 0,
        ]);

        $response = \curl_exec($ch);
        $error = \curl_error($ch);
        $httpCode = \curl_getinfo($ch, \CURLINFO_HTTP_CODE);

        if ($response === false) {
            throw new \RuntimeException("OpenAI API unreachable: {$error}");
        }

        if ($httpCode >= 400) {
            throw new \RuntimeException("OpenAI API error HTTP {$httpCode}: {$response}");
        }

        return \json_decode($response, true, flags: \JSON_THROW_ON_ERROR);
    }

    /**
     * Extracts JSON from LLM response, handling markdown code blocks.
     */
    private function extractJson(string $raw): string
    {
        // Try to extract from ```json ... ``` blocks
        if (\preg_match('/```(?:json)?\s*\n?(.*?)\n?```/s', $raw, $matches)) {
            return \trim($matches[1]);
        }

        // If no code block, return raw (should be pure JSON)
        return \trim($raw);
    }
}
