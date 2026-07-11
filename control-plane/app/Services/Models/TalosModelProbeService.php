<?php

declare(strict_types=1);

namespace App\Services\Models;

use App\Models\TalosModelProfile;
use App\Services\Security\PublicHttpRequestPinning;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Throwable;

final class TalosModelProbeService
{
    private readonly PublicHttpRequestPinning $connectionPinning;

    public function __construct(?PublicHttpRequestPinning $connectionPinning = null)
    {
        $this->connectionPinning = $connectionPinning ?? new PublicHttpRequestPinning;
    }

    /**
     * @return array{status: string, capabilities: array<string, bool>, result: array<string, mixed>}
     */
    public function probe(TalosModelProfile $profile): array
    {
        $provider = (string) $profile->provider;
        $url = TalosModelProviderCatalog::chatEndpointUrl($provider, $profile->base_url);
        $trustedLocalProvider = TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $profile->base_url);
        if (TalosModelProviderCatalog::requiresTrustedLocalBaseUrl($provider) && ! $trustedLocalProvider) {
            $policyDecision = $this->localOnlyPolicyDecision($url);

            return [
                'status' => 'failed',
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => 'BASE_URL_POLICY_BLOCKED',
                    'message' => 'Local provider base URL must use an approved loopback host.',
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'url_host' => $policyDecision['host'],
                    'base_url_policy' => $policyDecision,
                    'error' => 'Local provider base URL must use an approved loopback host.',
                ],
            ];
        }

        $connectionPin = $this->connectionPinning->pin($url, $trustedLocalProvider);
        $policyDecision = $connectionPin['policy'];
        if (! $connectionPin['allowed']) {
            return [
                'status' => 'failed',
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => $connectionPin['code'],
                    'message' => "Provider base URL blocked by TALOS policy: {$connectionPin['reason']}",
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'url_host' => $policyDecision['host'],
                    'base_url_policy' => $policyDecision,
                    'error' => "Provider base URL blocked by TALOS policy: {$connectionPin['reason']}",
                ],
            ];
        }

        if (! $trustedLocalProvider && TalosModelProviderCatalog::requiresSecret($provider) && ! filled($profile->encrypted_secret)) {
            return [
                'status' => 'failed',
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => 'PROVIDER_SECRET_MISSING',
                    'message' => 'Profile has no provider secret.',
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'base_url_policy' => $policyDecision,
                    'error' => 'Profile has no provider secret.',
                ],
            ];
        }

        $secret = null;
        try {
            if (! $trustedLocalProvider && filled($profile->encrypted_secret)) {
                $secret = Crypt::decryptString((string) $profile->encrypted_secret);
            }
        } catch (Throwable) {
            return [
                'status' => 'failed',
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => 'PROVIDER_SECRET_DECRYPT_FAILED',
                    'message' => 'Profile secret could not be decrypted.',
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'base_url_policy' => $policyDecision,
                    'error' => 'Profile secret could not be decrypted.',
                ],
            ];
        }

        try {
            $request = $this->connectionPinning->apply(
                Http::timeout((int) ($profile->timeout_seconds ?? 60))->acceptJson(),
                $connectionPin,
            );
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
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => 'PROVIDER_CONNECTION_FAILED',
                    'message' => 'Provider connection failed during probe.',
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'base_url_policy' => $policyDecision,
                    'error' => $this->redactSensitiveText($exception->getMessage(), [$secret]),
                ],
            ];
        }

        if (! $this->connectionPinning->connectedToPinnedIp($response, $connectionPin)) {
            return [
                'status' => 'failed',
                'capabilities' => $this->unverifiedCapabilities(),
                'result' => [
                    'ok' => false,
                    'code' => 'PROVIDER_CONNECTED_IP_MISMATCH',
                    'message' => 'Provider connection did not use an approved IP address.',
                    'provider' => $provider,
                    'url' => $this->safeUrlForResult($url),
                    'base_url_policy' => $policyDecision,
                    'error' => 'Provider connection did not use an approved IP address.',
                ],
            ];
        }

        $json = $response->json();
        $hasJson = is_array($json);
        $ok = $response->successful() && $hasJson;
        $redirectBlocked = $this->isRedirectStatus($response->status());

        return [
            'status' => $redirectBlocked ? 'failed' : ($ok ? 'healthy' : 'degraded'),
            'capabilities' => $this->observedCapabilities($ok, ! $trustedLocalProvider, $trustedLocalProvider),
            'result' => [
                'ok' => $ok,
                'code' => $this->probeResultCode($response->status(), $hasJson),
                'message' => $this->probeResultMessage($response->status(), $hasJson),
                'provider' => $provider,
                'url' => $this->safeUrlForResult($url),
                'base_url_policy' => $policyDecision,
                'http_status' => $response->status(),
                'json' => $hasJson,
                'json_keys' => $hasJson ? array_values(array_map('strval', array_keys($json))) : [],
                'body_preview' => $hasJson ? null : $this->responseExcerpt($response->body(), [$secret]),
                'provider_response_excerpt' => $this->responseExcerpt($hasJson ? json_encode($json, JSON_UNESCAPED_SLASHES) ?: '' : $response->body(), [$secret]),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{status: string, capabilities: array<string, bool>, result: array<string, mixed>}
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

    private function probeResultCode(int $status, bool $hasJson): string
    {
        if ($this->isRedirectStatus($status)) {
            return 'PROVIDER_REDIRECT_BLOCKED';
        }

        if ($status >= 200 && $status < 300 && $hasJson) {
            return 'PROVIDER_OK';
        }

        if ($status >= 200 && $status < 300) {
            return 'PROVIDER_INVALID_JSON';
        }

        return 'PROVIDER_HTTP_ERROR';
    }

    private function probeResultMessage(int $status, bool $hasJson): string
    {
        if ($this->isRedirectStatus($status)) {
            return 'Provider redirect was blocked; credentials were not forwarded.';
        }

        if ($status >= 200 && $status < 300 && $hasJson) {
            return 'Provider probe succeeded.';
        }

        if ($status >= 200 && $status < 300) {
            return 'Provider returned a non-JSON response during probe.';
        }

        return "Provider returned HTTP {$status} during probe.";
    }

    private function isRedirectStatus(int $status): bool
    {
        return $status >= 300 && $status < 400;
    }

    /**
     * @return array<string, bool>
     */
    private function observedCapabilities(bool $successfulJsonResponse, bool $publicEndpointAllowed, bool $trustedLocalProvider): array
    {
        return [
            'json' => $successfulJsonResponse,
            'tools' => false,
            'vision' => false,
            'embeddings' => false,
            'local' => $successfulJsonResponse && $trustedLocalProvider,
            'remote' => $successfulJsonResponse && $publicEndpointAllowed,
        ];
    }

    /**
     * @return array<string, bool>
     */
    private function unverifiedCapabilities(): array
    {
        return $this->observedCapabilities(false, false, false);
    }

    /**
     * @param  list<string|null>  $knownSensitiveValues
     */
    private function responseExcerpt(string $body, array $knownSensitiveValues = []): string
    {
        return substr($this->redactSensitiveText($body, $knownSensitiveValues), 0, 500);
    }

    /**
     * @param  list<string|null>  $knownSensitiveValues
     */
    private function redactSensitiveText(string $message, array $knownSensitiveValues = []): string
    {
        $redacted = $message;
        foreach ($knownSensitiveValues as $sensitiveValue) {
            if (! is_string($sensitiveValue) || $sensitiveValue === '') {
                continue;
            }

            $redacted = str_replace($sensitiveValue, '[redacted]', $redacted);
            $redacted = str_replace(rawurlencode($sensitiveValue), '[redacted]', $redacted);
        }

        $redacted = preg_replace('/(Bearer|Token|Api-Key|x-api-key)\s+[^\s]+/i', '$1 [redacted]', $redacted) ?? $redacted;
        $redacted = preg_replace('/\bsk-[A-Za-z0-9._-]+/i', '[redacted]', $redacted) ?? $redacted;
        $redacted = preg_replace('/([?&](?:api_key|key|token|secret)=)[^&\s]+/i', '$1[redacted]', $redacted) ?? $redacted;

        return substr($redacted, 0, 500);
    }

    /**
     * @return array{allowed: bool, reason: string, host: string, resolved_ips: list<string>}
     */
    private function localOnlyPolicyDecision(string $url): array
    {
        return [
            'allowed' => false,
            'reason' => 'local provider requires loopback base URL',
            'host' => strtolower(rtrim((string) parse_url($url, PHP_URL_HOST), '.')),
            'resolved_ips' => [],
        ];
    }

    private function safeUrlForResult(string $url): string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return '[invalid provider URL]';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');
        if ($scheme === '' || $host === '') {
            return '[invalid provider URL]';
        }

        $displayHost = str_contains($host, ':') ? "[{$host}]" : $host;
        $port = isset($parts['port']) ? ':'.(int) $parts['port'] : '';
        $path = (string) ($parts['path'] ?? '');

        return "{$scheme}://{$displayHost}{$port}{$path}";
    }
}
