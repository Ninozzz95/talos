<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosModelProfile;
use InvalidArgumentException;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Provider\ProviderTurnAdapterFactory;
use Kadmos\Security\ExecutionPolicy;

final class TalosCoreProviderAdapterResolver implements TalosProviderAdapterResolver
{
    public function __construct(
        private readonly ?ProviderTurnAdapterFactory $factory = null,
        private readonly ?ExecutionPolicy $executionPolicy = null,
    ) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        $provider = strtolower(trim((string) $profile->provider));
        [$protocol, $endpoint] = $this->endpointFor($profile, $provider);
        $timeoutMs = max(1, min(120000, (int) ($profile->timeout_seconds ?? 60) * 1000));
        $allowedHosts = config('services.talos.model_provider_allowed_hosts', []);
        $policy = $this->executionPolicy ?? new ExecutionPolicy(
            allowedHosts: is_array($allowedHosts) ? array_values(array_filter($allowedHosts, 'is_string')) : [],
            maxTimeoutMs: $timeoutMs,
        );

        return ($this->factory ?? new ProviderTurnAdapterFactory)->create(
            provider: $provider,
            protocol: $protocol,
            endpoint: $endpoint,
            apiKey: $decryptedSecret,
            timeoutMs: $timeoutMs,
            executionPolicy: $policy,
        );
    }

    /** @return array{string, string} */
    private function endpointFor(TalosModelProfile $profile, string $provider): array
    {
        $capabilities = is_array($profile->capabilities) ? $profile->capabilities : [];
        $requestedProtocol = is_string($capabilities['protocol'] ?? null)
            ? strtolower(trim($capabilities['protocol']))
            : null;

        return match ($provider) {
            'openai' => $this->openAiEndpoint($profile, $requestedProtocol),
            'deepseek', 'openrouter', 'groq', 'ollama', 'openai_compatible' => $this->fixedEndpoint(
                $requestedProtocol,
                'chat_completions',
                $this->appendPath($this->baseUrl($profile, $provider), '/chat/completions'),
            ),
            'anthropic' => $this->fixedEndpoint(
                $requestedProtocol,
                'messages',
                $this->appendPath($this->baseUrl($profile, $provider), '/messages'),
            ),
            'gemini' => $this->fixedEndpoint(
                $requestedProtocol,
                'generate_content',
                $this->geminiEndpoint($profile),
            ),
            default => throw new InvalidArgumentException('Provider profile uses an unsupported provider.'),
        };
    }

    /** @return array{string, string} */
    private function openAiEndpoint(TalosModelProfile $profile, ?string $requestedProtocol): array
    {
        $protocol = $requestedProtocol ?? 'chat_completions';
        if (! in_array($protocol, ['chat_completions', 'responses'], true)) {
            throw new InvalidArgumentException('OpenAI provider protocol is unsupported.');
        }

        return [
            $protocol,
            $this->appendPath(
                $this->baseUrl($profile, 'openai'),
                $protocol === 'responses' ? '/responses' : '/chat/completions',
            ),
        ];
    }

    private function geminiEndpoint(TalosModelProfile $profile): string
    {
        $base = $this->baseUrl($profile, 'gemini');
        if (str_ends_with($base, '/openai')) {
            $base = substr($base, 0, -strlen('/openai'));
        }
        if (str_ends_with($base, ':generateContent')) {
            return $base;
        }

        return rtrim($base, '/').'/models/'.rawurlencode((string) $profile->model).':generateContent';
    }

    private function baseUrl(TalosModelProfile $profile, string $provider): string
    {
        if (filled($profile->base_url)) {
            return rtrim((string) $profile->base_url, '/');
        }

        return match ($provider) {
            'openai' => 'https://api.openai.com/v1',
            'deepseek' => 'https://api.deepseek.com/v1',
            'openrouter' => 'https://openrouter.ai/api/v1',
            'anthropic' => 'https://api.anthropic.com/v1',
            'gemini' => 'https://generativelanguage.googleapis.com/v1beta',
            'ollama' => 'http://127.0.0.1:11434/v1',
            default => throw new InvalidArgumentException('Provider profile requires an explicit base URL.'),
        };
    }

    private function appendPath(string $base, string $suffix): string
    {
        $base = rtrim($base, '/');
        if (str_ends_with($base, $suffix)) {
            return $base;
        }

        return $base.$suffix;
    }

    /** @return array{string, string} */
    private function fixedEndpoint(?string $requestedProtocol, string $protocol, string $endpoint): array
    {
        if ($requestedProtocol !== null && $requestedProtocol !== $protocol) {
            throw new InvalidArgumentException('Provider profile protocol does not match the provider.');
        }

        return [$protocol, $endpoint];
    }
}
