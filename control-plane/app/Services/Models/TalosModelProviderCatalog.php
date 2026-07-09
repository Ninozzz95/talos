<?php

declare(strict_types=1);

namespace App\Services\Models;

final class TalosModelProviderCatalog
{
    /**
     * @var array<string, array{
     *     label: string,
     *     default_model: string,
     *     default_base_url: string,
     *     default_timeout_seconds: int,
     *     requires_secret: bool,
     *     allows_trusted_local_base_url: bool,
     *     capabilities: array<string, bool>
     * }>
     */
    private const PROVIDERS = [
        'openai' => [
            'label' => 'OpenAI',
            'default_model' => 'gpt-4.1-mini',
            'default_base_url' => 'https://api.openai.com/v1',
            'default_timeout_seconds' => 60,
            'requires_secret' => true,
            'allows_trusted_local_base_url' => false,
            'capabilities' => ['json' => true, 'tools' => true, 'vision' => true, 'embeddings' => true, 'remote' => true, 'local' => false],
        ],
        'deepseek' => [
            'label' => 'DeepSeek',
            'default_model' => 'deepseek-chat',
            'default_base_url' => 'https://api.deepseek.com/v1',
            'default_timeout_seconds' => 60,
            'requires_secret' => true,
            'allows_trusted_local_base_url' => false,
            'capabilities' => ['json' => true, 'tools' => true, 'vision' => false, 'embeddings' => false, 'remote' => true, 'local' => false],
        ],
        'anthropic' => [
            'label' => 'Anthropic',
            'default_model' => 'claude-sonnet',
            'default_base_url' => 'https://api.anthropic.com/v1',
            'default_timeout_seconds' => 60,
            'requires_secret' => true,
            'allows_trusted_local_base_url' => false,
            'capabilities' => ['json' => true, 'tools' => true, 'vision' => true, 'embeddings' => false, 'remote' => true, 'local' => false],
        ],
        'gemini' => [
            'label' => 'Google Gemini',
            'default_model' => 'gemini-2.5-flash',
            'default_base_url' => 'https://generativelanguage.googleapis.com/v1beta/openai',
            'default_timeout_seconds' => 60,
            'requires_secret' => true,
            'allows_trusted_local_base_url' => false,
            'capabilities' => ['json' => true, 'tools' => true, 'vision' => true, 'embeddings' => true, 'remote' => true, 'local' => false],
        ],
        'openrouter' => [
            'label' => 'OpenRouter',
            'default_model' => 'openai/gpt-4.1-mini',
            'default_base_url' => 'https://openrouter.ai/api/v1',
            'default_timeout_seconds' => 60,
            'requires_secret' => true,
            'allows_trusted_local_base_url' => false,
            'capabilities' => ['json' => true, 'tools' => true, 'vision' => true, 'embeddings' => false, 'remote' => true, 'local' => false],
        ],
        'ollama' => [
            'label' => 'Ollama Local',
            'default_model' => 'llama3.1',
            'default_base_url' => 'http://127.0.0.1:11434/v1',
            'default_timeout_seconds' => 60,
            'requires_secret' => false,
            'allows_trusted_local_base_url' => true,
            'capabilities' => ['json' => true, 'tools' => false, 'vision' => false, 'embeddings' => true, 'remote' => false, 'local' => true],
        ],
    ];

    /**
     * @return list<string>
     */
    public static function ids(): array
    {
        return array_keys(self::PROVIDERS);
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaultsFor(string $provider): array
    {
        return self::PROVIDERS[$provider] ?? self::PROVIDERS['openai'];
    }

    public static function requiresSecret(string $provider): bool
    {
        return (bool) self::defaultsFor($provider)['requires_secret'];
    }

    public static function allowsTrustedLocalBaseUrl(string $provider, ?string $baseUrl): bool
    {
        if (! (bool) self::defaultsFor($provider)['allows_trusted_local_base_url'] || ! filled($baseUrl)) {
            return false;
        }

        $scheme = strtolower((string) parse_url((string) $baseUrl, PHP_URL_SCHEME));
        $host = self::normalizeHost((string) parse_url((string) $baseUrl, PHP_URL_HOST));

        return in_array($scheme, ['http', 'https'], true)
            && in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function applyCreateDefaults(array $data): array
    {
        $provider = (string) $data['provider'];
        $defaults = self::defaultsFor($provider);

        $data['display_name'] = filled($data['display_name'] ?? null)
            ? trim((string) $data['display_name'])
            : $defaults['label'];
        $data['model'] = filled($data['model'] ?? null)
            ? trim((string) $data['model'])
            : $defaults['default_model'];
        $data['base_url'] = array_key_exists('base_url', $data) && filled($data['base_url'])
            ? trim((string) $data['base_url'])
            : $defaults['default_base_url'];
        $data['capabilities'] = $data['capabilities'] ?? $defaults['capabilities'];
        $data['timeout_seconds'] = (int) ($data['timeout_seconds'] ?? $defaults['default_timeout_seconds']);

        return $data;
    }

    public static function chatEndpointUrl(string $provider, ?string $baseUrl): string
    {
        $base = (string) ($baseUrl ?: self::defaultsFor($provider)['default_base_url']);
        $suffix = $provider === 'anthropic' ? '/messages' : '/chat/completions';

        return rtrim($base, '/') . $suffix;
    }

    private static function normalizeHost(string $host): string
    {
        return strtolower(rtrim(trim($host, "[] \t\n\r\0\x0B"), '.'));
    }
}
