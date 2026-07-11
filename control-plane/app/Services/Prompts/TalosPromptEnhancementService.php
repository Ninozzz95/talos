<?php

declare(strict_types=1);

namespace App\Services\Prompts;

use App\Models\TalosModelProfile;
use App\Services\Models\TalosModelProviderCatalog;
use App\Services\Security\PublicHttpRequestPinning;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use JsonException;
use Throwable;

final class TalosPromptEnhancementService
{
    private const MAX_ENHANCED_PROMPT_LENGTH = 24000;

    private const SYSTEM_PROMPT = <<<'PROMPT'
You are the TALOS Prompt Enhancer. Rewrite the user's prompt into a stronger execution brief without answering it or performing the requested task.

Preserve the user's intent, facts, constraints, and risk level. Write enhanced_prompt, summary, and applied_principles in the same natural language as the original prompt; when the input mixes languages, use its dominant language. Never invent missing facts, credentials, files, tools, deadlines, or permissions. Make the objective explicit, specify the expected output, surface relevant constraints and context, and add verifiable acceptance checks. Keep the result concise enough to use directly as the next model prompt.

Return only a valid JSON object with this schema:
{
  "enhanced_prompt": "string",
  "summary": "short description of what was improved",
  "applied_principles": ["short principle name"]
}

The enhanced_prompt must be self-contained. applied_principles must contain at most eight short strings. Do not wrap the JSON in prose.
PROMPT;

    public function __construct(private readonly ?PublicHttpRequestPinning $connectionPinning = null) {}

    /**
     * @return array{
     *     provider: string,
     *     model: string,
     *     enhanced_prompt: string,
     *     summary: string,
     *     applied_principles: list<string>
     * }
     */
    public function enhance(TalosModelProfile $profile, string $prompt): array
    {
        $provider = (string) $profile->provider;
        $model = trim((string) $profile->model);
        $endpoint = TalosModelProviderCatalog::chatEndpointUrl($provider, $profile->base_url);
        $trustedLocalProvider = TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $profile->base_url);
        if (TalosModelProviderCatalog::requiresTrustedLocalBaseUrl($provider) && ! $trustedLocalProvider) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_BASE_URL_BLOCKED',
                'The selected local model endpoint must use an approved loopback host.',
                422,
                false,
            );
        }

        $connectionPinning = $this->connectionPinning ?? new PublicHttpRequestPinning;
        $connectionPin = $connectionPinning->pin($endpoint, $trustedLocalProvider);

        if (! $connectionPin['allowed']) {
            throw new TalosPromptEnhancementException(
                $connectionPin['code'] === 'CONNECTION_PINNING_UNAVAILABLE'
                    ? 'PROMPT_ENHANCER_CONNECTION_PINNING_UNAVAILABLE'
                    : 'PROMPT_ENHANCER_BASE_URL_BLOCKED',
                $connectionPin['code'] === 'CONNECTION_PINNING_UNAVAILABLE'
                    ? 'TALOS could not pin the selected model connection to an approved IP address.'
                    : 'The selected model endpoint is blocked by TALOS network policy.',
                422,
                false,
            );
        }

        $secret = $trustedLocalProvider ? null : $this->decryptSecret($profile, $provider);

        try {
            $response = $connectionPinning->apply($this->request($profile, $provider, $secret), $connectionPin)
                ->post($endpoint, $this->payload($provider, $model, $prompt));
        } catch (ConnectionException $exception) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_PROVIDER_UNAVAILABLE',
                'The selected model provider could not be reached. Check the profile and try again.',
                503,
                true,
                $exception,
            );
        }

        if (! $connectionPinning->connectedToPinnedIp($response, $connectionPin)) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_CONNECTED_IP_MISMATCH',
                'TALOS rejected the provider response because its connection IP was not approved.',
                502,
                false,
            );
        }

        $this->assertSuccessfulResponse($response);
        $content = $this->extractContent($provider, $response);
        $result = $this->parseResult($content);

        return [
            'provider' => $provider,
            'model' => $model,
            ...$result,
        ];
    }

    private function decryptSecret(TalosModelProfile $profile, string $provider): ?string
    {
        if (! filled($profile->encrypted_secret)) {
            if (TalosModelProviderCatalog::requiresSecret($provider)) {
                throw new TalosPromptEnhancementException(
                    'PROMPT_ENHANCER_SECRET_MISSING',
                    'The selected model profile has no server-side credential.',
                    409,
                    false,
                );
            }

            return null;
        }

        try {
            return Crypt::decryptString((string) $profile->encrypted_secret);
        } catch (Throwable $exception) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_SECRET_DECRYPT_FAILED',
                'The selected model credential could not be decrypted. Rotate the profile secret and retry.',
                409,
                false,
                $exception,
            );
        }
    }

    private function request(TalosModelProfile $profile, string $provider, ?string $secret): PendingRequest
    {
        $timeout = max(5, min(120, (int) ($profile->timeout_seconds ?? 60)));
        $request = Http::timeout($timeout)
            ->connectTimeout(min(15, $timeout))
            ->acceptJson();

        if ($provider === 'anthropic' && filled($secret)) {
            return $request->withHeaders([
                'x-api-key' => (string) $secret,
                'anthropic-version' => '2023-06-01',
            ]);
        }

        return filled($secret) ? $request->withToken((string) $secret) : $request;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $provider, string $model, string $prompt): array
    {
        $userMessage = json_encode([
            'task' => 'enhance_prompt',
            'language_policy' => 'same_as_original_prompt',
            'original_prompt' => $prompt,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        if ($provider === 'anthropic') {
            return [
                'model' => $model,
                'system' => self::SYSTEM_PROMPT,
                'messages' => [
                    ['role' => 'user', 'content' => $userMessage],
                ],
                'temperature' => 0.2,
                'max_tokens' => 1800,
            ];
        }

        return [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
                ['role' => 'user', 'content' => $userMessage],
            ],
            'temperature' => 0.2,
            'max_tokens' => 1800,
            'response_format' => ['type' => 'json_object'],
        ];
    }

    private function assertSuccessfulResponse(Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        $status = $response->status();
        if ($status >= 300 && $status < 400) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_REDIRECT_BLOCKED',
                'The selected model provider returned a redirect, which TALOS blocked before credentials could follow it.',
                502,
                false,
            );
        }

        if (in_array($status, [401, 403], true)) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_PROVIDER_AUTH_FAILED',
                'The selected model provider rejected the profile credentials.',
                502,
                false,
            );
        }

        if ($status === 429) {
            throw new TalosPromptEnhancementException(
                'PROMPT_ENHANCER_PROVIDER_RATE_LIMITED',
                'The selected model provider is rate limited. Retry after its cooldown period.',
                429,
                true,
            );
        }

        throw new TalosPromptEnhancementException(
            'PROMPT_ENHANCER_PROVIDER_FAILED',
            'The selected model provider could not enhance the prompt.',
            $status >= 500 ? 503 : 502,
            $status >= 500,
        );
    }

    private function extractContent(string $provider, Response $response): string
    {
        $json = $response->json();
        if (! is_array($json)) {
            $this->invalidResponse();
        }

        $content = $provider === 'anthropic'
            ? $this->anthropicText($json)
            : $this->openAiCompatibleText($json);

        if (! is_string($content) || trim($content) === '') {
            $this->invalidResponse();
        }

        return trim($content);
    }

    /**
     * @param  array<string, mixed>  $json
     */
    private function anthropicText(array $json): ?string
    {
        $blocks = $json['content'] ?? null;
        if (! is_array($blocks) || ! array_is_list($blocks)) {
            return null;
        }

        foreach ($blocks as $block) {
            if (is_array($block) && ($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                return $block['text'];
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $json
     */
    private function openAiCompatibleText(array $json): ?string
    {
        $content = data_get($json, 'choices.0.message.content');
        if (is_string($content)) {
            return $content;
        }

        if (! is_array($content) || ! array_is_list($content)) {
            return null;
        }

        foreach ($content as $part) {
            if (is_array($part) && ($part['type'] ?? null) === 'text' && is_string($part['text'] ?? null)) {
                return $part['text'];
            }
        }

        return null;
    }

    /**
     * @return array{enhanced_prompt: string, summary: string, applied_principles: list<string>}
     */
    private function parseResult(string $content): array
    {
        $jsonText = $this->stripCodeFence($content);

        try {
            $decoded = json_decode($jsonText, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $this->invalidResponse();
        }

        if (! is_array($decoded) || array_is_list($decoded)) {
            $this->invalidResponse();
        }

        $enhancedPrompt = is_string($decoded['enhanced_prompt'] ?? null)
            ? trim($decoded['enhanced_prompt'])
            : '';
        if ($enhancedPrompt === '' || mb_strlen($enhancedPrompt) > self::MAX_ENHANCED_PROMPT_LENGTH) {
            $this->invalidResponse();
        }

        $summary = $decoded['summary'] ?? '';
        if (! is_string($summary) || mb_strlen(trim($summary)) > 500) {
            $this->invalidResponse();
        }

        $principles = $decoded['applied_principles'] ?? [];
        if (! is_array($principles) || ! array_is_list($principles) || count($principles) > 8) {
            $this->invalidResponse();
        }

        $normalizedPrinciples = [];
        foreach ($principles as $principle) {
            if (! is_string($principle) || trim($principle) === '' || mb_strlen(trim($principle)) > 160) {
                $this->invalidResponse();
            }

            $normalizedPrinciples[] = trim($principle);
        }

        return [
            'enhanced_prompt' => $enhancedPrompt,
            'summary' => trim($summary),
            'applied_principles' => $normalizedPrinciples,
        ];
    }

    private function stripCodeFence(string $content): string
    {
        if (preg_match('/\A```(?:json)?\s*(.*?)\s*```\z/is', trim($content), $matches) === 1) {
            return trim((string) $matches[1]);
        }

        return trim($content);
    }

    private function invalidResponse(): never
    {
        throw new TalosPromptEnhancementException(
            'PROMPT_ENHANCER_INVALID_RESPONSE',
            'The selected model returned an invalid prompt enhancement. Retry or choose another model profile.',
            502,
            true,
        );
    }
}
