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
        $url = $this->chatCompletionsUrl($profile);
        $policyDecision = $this->urlPolicy->inspect($url);
        if (! $policyDecision['allowed']) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'url_host' => $policyDecision['host'],
                    'error' => "Provider base URL blocked by TALOS policy: {$policyDecision['reason']}",
                ],
            ];
        }

        if (! filled($profile->encrypted_secret)) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'error' => 'Profile has no provider secret.',
                ],
            ];
        }

        try {
            $secret = Crypt::decryptString((string) $profile->encrypted_secret);
        } catch (Throwable) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'error' => 'Profile secret could not be decrypted.',
                ],
            ];
        }

        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->withToken($secret)
                ->post($url, [
                    'model' => $profile->model,
                    'messages' => [
                        ['role' => 'user', 'content' => 'Reply with OK.'],
                    ],
                    'max_tokens' => 8,
                ]);
        } catch (ConnectionException $exception) {
            return [
                'status' => 'failed',
                'result' => [
                    'ok' => false,
                    'url' => $url,
                    'error' => $exception->getMessage(),
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

    private function chatCompletionsUrl(TalosModelProfile $profile): string
    {
        $baseUrl = (string) ($profile->base_url ?: match ($profile->provider) {
            'deepseek' => 'https://api.deepseek.com',
            default => 'https://api.openai.com/v1',
        });

        return rtrim($baseUrl, '/') . '/chat/completions';
    }
}
