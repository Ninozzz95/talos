<?php

declare(strict_types=1);

namespace App\Services\Models;

use App\Models\TalosModelProfile;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Throwable;

final class TalosModelProbeService
{
    private PublicHttpUrlPolicy $urlPolicy;

    public function __construct()
    {
        $this->urlPolicy = PublicHttpUrlPolicy::fromConfig();
    }

    /**
     * @return array{status: string, result: array<string, mixed>}
     */
    public function probe(TalosModelProfile $profile): array
    {
        $provider = (string) $profile->provider;
        $url = TalosModelProviderCatalog::chatEndpointUrl($provider, $profile->base_url);
        $policyDecision = $this->urlPolicy->inspect($url);
        $trustedLocalProvider = TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $profile->base_url);
        if (! $policyDecision['allowed'] && ! $trustedLocalProvider) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'url_host' => $policyDecision['host'],
                    'error' => "Provider base URL blocked by TALOS policy: {$policyDecision['reason']}",
                ],
            ];
        }

        if (TalosModelProviderCatalog::requiresSecret($provider) && ! filled($profile->encrypted_secret)) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'error' => 'Profile has no provider secret.',
                ],
            ];
        }

        $secret = null;
        try {
            if (filled($profile->encrypted_secret)) {
                $secret = Crypt::decryptString((string) $profile->encrypted_secret);
            }
        } catch (Throwable) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'error' => 'Profile secret could not be decrypted.',
                ],
            ];
        }

        if (filled($secret) && ! $policyDecision['allowed']) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'url_host' => $policyDecision['host'],
                    'error' => 'Bearer token blocked for non-public provider endpoint.',
                ],
            ];
        }

        try {
            $request = Http::timeout((int) ($profile->timeout_seconds ?? 60))->acceptJson();
            if ($provider === 'anthropic' && filled($secret)) {
                $request = $request->withHeaders([
                    'x-api-key' => (string) $secret,
                    'anthropic-version' => '2023-06-01',
                ]);
            } elseif (filled($secret)) {
                $request = $request->withToken((string) $secret);
            }

            $response = $request->post($url, $this->probePayload($provider, (string) $profile->model));
        } catch (ConnectionException $exception) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'url' => $url,
                    'error' => $this->redactError($exception->getMessage()),
                ],
            ];
        }

        $json = $response->json();
        $hasJson = is_array($json);

        return [
            'status' => $response->successful() && $hasJson ? 'healthy' : 'degraded',
            'result' => [
                'ok' => $response->successful() && $hasJson,
                'url' => $url,
                'http_status' => $response->status(),
                'json' => $hasJson,
                'json_keys' => $hasJson ? array_values(array_map('strval', array_keys($json))) : [],
                'body_preview' => $hasJson ? null : substr($response->body(), 0, 500),
            ],
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{status: string, result: array<string, mixed>}
     */
    public function probeDraft(array $data): array
    {
        $profile = new TalosModelProfile([
            'provider' => (string) $data['provider'],
            'model' => (string) $data['model'],
            'display_name' => (string) $data['display_name'],
            'base_url' => $data['base_url'] ?? null,
            'timeout_seconds' => (int) ($data['timeout_seconds'] ?? 60),
            'capabilities' => $data['capabilities'] ?? null,
        ]);

        if (filled($data['secret'] ?? null)) {
            $profile->encrypted_secret = Crypt::encryptString((string) $data['secret']);
        }

        return $this->probe($profile);
    }

    /**
     * @return array<string, mixed>
     */
    private function probePayload(string $provider, string $model): array
    {
        if ($provider === 'anthropic') {
            return [
                'model' => $model,
                'max_tokens' => 8,
                'messages' => [
                    ['role' => 'user', 'content' => 'Reply with OK.'],
                ],
            ];
        }

        return [
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => 'Reply with OK.'],
            ],
            'max_tokens' => 8,
        ];
    }

    private function redactError(string $message): string
    {
        $redacted = preg_replace('/(Bearer|Token|Api-Key|x-api-key)\s+[^\s]+/i', '$1 [redacted]', $message) ?? $message;

        return substr($redacted, 0, 500);
    }
}
