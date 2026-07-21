<?php

declare(strict_types=1);

namespace Kadmos;

use Kadmos\Provider\ProviderRequestException;
use Kadmos\Provider\PinnedProviderHttpTransport;
use Kadmos\Provider\ReasoningEffortMap;
use Kadmos\Security\ExecutionPolicy;
use Kadmos\Security\PolicyDecision;

/**
 * LLM client for OpenAI-compatible APIs (OpenAI, Groq, vLLM, etc.)
 */
final class OpenAIClient implements LLMClientInterface
{
    /** @var list<string> */
    private const DEFAULT_PROVIDER_HOSTS = [
        'api.openai.com',
        'api.deepseek.com',
        'api.anthropic.com',
        'generativelanguage.googleapis.com',
        'openrouter.ai',
    ];

    private string $apiKey;
    private string $provider;
    private string $model;
    private string $baseUrl;
    private string $systemPrompt;
    private int $timeoutMs;
    private ?\Closure $transport;
    private ?\Closure $curlTransport;
    private ExecutionPolicy $executionPolicy;

    /** @var list<array{role: string, content: string}> */
    private array $conversation = [];

    /** @var list<array<string, mixed>> */
    private array $tools = [];

    /** @var list<array<string, mixed>> */
    private array $lastToolCalls = [];

    private bool $nativeToolsUnsupported = false;

    private ?string $reasoningEffort = null;

    private int $lastTotalTokens = 0;
    private int $lastPromptTokens = 0;
    private int $lastCompletionTokens = 0;

    /** @var list<array{field: string, expected: string, received: string, message: string}> */
    private array $pendingFaults = [];

    public function __construct(
        string $apiKey,
        string $model = 'gpt-4o',
        string $baseUrl = 'https://api.openai.com/v1',
        int $timeoutMs = 30000,
        ?callable $transport = null,
        string $provider = 'openai',
        ?ExecutionPolicy $executionPolicy = null,
        ?callable $curlTransport = null,
    ) {
        $this->apiKey = $apiKey;
        $this->provider = strtolower(trim($provider));
        $this->model = $model;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeoutMs = $timeoutMs;
        $this->transport = $transport !== null ? \Closure::fromCallable($transport) : null;
        $this->curlTransport = $curlTransport !== null ? \Closure::fromCallable($curlTransport) : null;
        $this->executionPolicy = $executionPolicy ?? new ExecutionPolicy(
            allowedHosts: self::configuredProviderHosts(),
            maxTimeoutMs: max(1, $timeoutMs),
        );
        $this->assertProviderContract($baseUrl);
        $this->assertProviderBaseUrlAllowed($baseUrl, $timeoutMs, requireResolution: false);
        $this->systemPrompt = SystemPromptBuilder::build();
    }

    public function withSystemPrompt(string $systemPrompt): self
    {
        $this->systemPrompt = $systemPrompt;
        return $this;
    }

    /** @param list<array<string, mixed>> $tools */
    public function withTools(array $tools): self
    {
        foreach ($tools as $tool) {
            if (! is_array($tool)) throw new \InvalidArgumentException('Provider tools must be structured arrays.');
        }
        $this->tools = $this->nativeToolsUnsupported && $tools !== [] ? [] : array_values($tools);
        return $this;
    }

    public function withReasoningEffort(?string $effort): self
    {
        $this->reasoningEffort = $effort;
        return $this;
    }

    public function generateWithToolFallback(string $prompt): string
    {
        try {
            return $this->generate($prompt);
        } catch (ProviderRequestException $exception) {
            if ($this->tools === [] || ! self::isNativeToolContractRejection($exception)) {
                throw $exception;
            }

            $this->nativeToolsUnsupported = true;
            $this->tools = [];

            return $this->generate($prompt);
        }
    }

    public function generate(string $prompt): string
    {
        $this->lastToolCalls = [];
        // Build conversation
        $messages = $this->buildMessages($prompt);

        $request = [
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => 0.0,
            'max_tokens' => 4096,
        ];
        foreach (ReasoningEffortMap::paramsFor(
            ReasoningEffortMap::TARGET_OPENAI_CHAT,
            $this->reasoningEffort,
            false,
            $request['max_tokens'],
        ) as $reasoningKey => $reasoningValue) {
            $request[$reasoningKey] = $reasoningValue;
        }
        if ($this->tools !== []) {
            $request['tools'] = $this->tools;
            $request['tool_choice'] = 'auto';
        }
        $body = \json_encode($request, \JSON_THROW_ON_ERROR);

        $response = $this->callApi(self::chatCompletionsEndpoint($this->baseUrl), $body);
        $message = $response['choices'][0]['message'] ?? [];
        $content = is_array($message) && is_string($message['content'] ?? null) ? $message['content'] : '';
        $providerToolCalls = is_array($message) && is_array($message['tool_calls'] ?? null) ? $message['tool_calls'] : [];
        $this->lastToolCalls = array_values(array_filter($providerToolCalls, 'is_array'));

        // Capture exact token usage
        $usage = $response['usage'] ?? [];
        $this->lastTotalTokens = $usage['total_tokens'] ?? 0;
        $this->lastPromptTokens = $usage['prompt_tokens'] ?? 0;
        $this->lastCompletionTokens = $usage['completion_tokens'] ?? 0;

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
    public static function chatCompletionsEndpoint(string $baseUrl): string
    {
        $normalizedBase = \rtrim($baseUrl, '/');
        $suffix = '/chat/completions';

        if (\str_ends_with($normalizedBase, $suffix)) {
            return $normalizedBase;
        }

        return $normalizedBase . $suffix;
    }

    private function callApi(string $url, string $body): array
    {
        $headers = ['Content-Type: application/json'];
        if ($this->provider !== 'ollama') {
            $headers[] = "Authorization: Bearer {$this->apiKey}";
        }

        if ($this->transport !== null) {
            /** @var array<string, mixed> $response */
            $response = ($this->transport)($url, $body, $headers, $this->timeoutMs);

            return $response;
        }
        $payload = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($payload)) {
            throw new \RuntimeException('Provider request body must be a JSON object.');
        }
        $transport = new PinnedProviderHttpTransport(
            provider: $this->provider,
            executionPolicy: $this->executionPolicy,
            curlTransport: $this->curlTransport,
            maxTimeoutMs: $this->timeoutMs,
        );

        return $transport($url, $payload, $headers, $this->timeoutMs);
    }

    private function assertProviderBaseUrlAllowed(
        string $baseUrl,
        int $timeoutMs,
        bool $requireResolution,
    ): PolicyDecision
    {
        if ($this->provider === 'ollama') {
            $host = self::normalizeHost((string) parse_url($baseUrl, PHP_URL_HOST));
            $resolvedIps = match ($host) {
                'localhost' => ['127.0.0.1', '::1'],
                '127.0.0.1', '::1' => [$host],
                default => [],
            };

            return new PolicyDecision(true, 'trusted local provider', max(1, $timeoutMs), [
                'host' => $host,
                'resolved_ips' => $resolvedIps,
            ]);
        }

        $decision = $this->executionPolicy->inspectUrl(
            self::chatCompletionsEndpoint($baseUrl),
            $timeoutMs,
            requireResolution: $requireResolution,
            rejectQueryAndFragment: true,
        );

        if (!$decision->allowed) {
            throw new \RuntimeException("Provider base URL blocked by execution policy: {$decision->reason}");
        }

        return $decision;
    }

    private function assertProviderContract(string $baseUrl): void
    {
        $parts = parse_url($baseUrl);
        $host = is_array($parts) ? self::normalizeHost((string) ($parts['host'] ?? '')) : '';
        $safeUrl = is_array($parts)
            && !isset($parts['user'])
            && !isset($parts['pass'])
            && !isset($parts['query'])
            && !isset($parts['fragment'])
            && in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            && $host !== '';

        if (!$safeUrl) {
            throw new \RuntimeException('Provider base URL blocked by execution policy: invalid or unsupported URL');
        }

        if ($this->provider === 'ollama') {
            if (!in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
                throw new \RuntimeException('Ollama provider base URL must use a loopback host.');
            }
            if ($this->apiKey !== '') {
                throw new \RuntimeException('Ollama provider must remain credential-free.');
            }
            return;
        }

        if (trim($this->apiKey) === '') {
            throw new \RuntimeException('Remote model provider requires an API key.');
        }
    }

    /** @return list<string> */
    private static function configuredProviderHosts(): array
    {
        $configured = getenv('KADMOS_ALLOWED_PROVIDER_HOSTS');
        if ($configured === false || trim($configured) === '') {
            $configured = getenv('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS');
        }

        $hosts = $configured !== false && trim($configured) !== ''
            ? explode(',', $configured)
            : self::DEFAULT_PROVIDER_HOSTS;

        return array_values(array_unique(array_filter(array_map(
            static fn(string $host): string => self::normalizeHost($host),
            $hosts,
        ))));
    }

    private static function normalizeHost(string $host): string
    {
        return strtolower(rtrim(trim($host, "[] \t\n\r\0\x0B"), '.'));
    }

    private static function isNativeToolContractRejection(ProviderRequestException $exception): bool
    {
        if (! in_array($exception->status, [400, 404, 422], true)) {
            return false;
        }

        $body = strtolower($exception->responseBody);
        $mentionsToolContract = str_contains($body, 'tool') || str_contains($body, 'function');
        $isUnsupported = str_contains($body, 'unsupported')
            || str_contains($body, 'not support')
            || str_contains($body, 'unknown')
            || str_contains($body, 'unrecognized')
            || str_contains($body, 'invalid')
            || str_contains($body, 'not allowed')
            || str_contains($body, 'extra');

        return $mentionsToolContract && $isUnsupported;
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

    public function getLastTotalTokens(): int { return $this->lastTotalTokens; }
    public function getLastPromptTokens(): int { return $this->lastPromptTokens; }
    public function getLastCompletionTokens(): int { return $this->lastCompletionTokens; }
    /** @return list<array<string, mixed>> */
    public function getLastToolCalls(): array { return $this->lastToolCalls; }
}
