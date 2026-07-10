<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

final class HttpBrowserSessionClient implements BrowserSessionClient
{
    public function __construct(private readonly string $baseUrl, private readonly string $token, private readonly int $timeoutSeconds = 15) {}

    public function create(string $ownerRef, int $width, int $height): array
    {
        return $this->request('post', '/sessions', $ownerRef, ['ownerRef' => $ownerRef, 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'ttlSeconds' => 3600, 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'downloads' => false, 'uploads' => false]]);
    }
    public function navigate(string $ownerRef, string $workerSessionId, string $url): array { return $this->request('post', "/sessions/{$workerSessionId}/navigate", $ownerRef, ['url' => $url]); }
    public function screenshot(string $ownerRef, string $workerSessionId): array { return $this->request('post', "/sessions/{$workerSessionId}/screenshot", $ownerRef); }
    public function snapshot(string $ownerRef, string $workerSessionId): array { return $this->request('post', "/sessions/{$workerSessionId}/snapshot", $ownerRef); }
    public function close(string $ownerRef, string $workerSessionId): void { $this->request('delete', "/sessions/{$workerSessionId}", $ownerRef); }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function request(string $method, string $path, string $ownerRef, array $payload = []): array
    {
        if (trim($this->baseUrl) === '' || trim($this->token) === '') throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is not configured.');
        try {
            $response = Http::timeout($this->timeoutSeconds)->acceptJson()->withHeaders(['X-Talos-Worker-Token' => $this->token, 'X-Talos-Owner-Ref' => $ownerRef])->send($method, rtrim($this->baseUrl, '/').$path, ['json' => $payload]);
        } catch (ConnectionException $exception) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is unavailable.');
        }
        if ($response->status() === 204) return [];
        if (! $response->successful() || ! is_array($response->json('data'))) throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker failed to complete the request.');
        /** @var array<string, mixed> $data */ $data = $response->json('data');
        return $data;
    }
}
