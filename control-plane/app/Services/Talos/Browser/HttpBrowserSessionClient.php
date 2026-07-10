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
    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->request('get', "/sessions/{$workerSessionId}", $ownerRef, [], $timeoutMilliseconds); }
    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array { return $this->request('post', "/sessions/{$workerSessionId}/navigate", $ownerRef, ['url' => $url], $timeoutMilliseconds); }
    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->request('post', "/sessions/{$workerSessionId}/screenshot", $ownerRef, [], $timeoutMilliseconds); }
    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->request('post', "/sessions/{$workerSessionId}/snapshot", $ownerRef, [], $timeoutMilliseconds); }
    public function close(string $ownerRef, string $workerSessionId): void { $this->request('delete', "/sessions/{$workerSessionId}", $ownerRef); }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function request(string $method, string $path, string $ownerRef, array $payload = [], int $timeoutMilliseconds = 15000): array
    {
        if (trim($this->baseUrl) === '' || trim($this->token) === '') throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is not configured.');
        try {
            $timeoutSeconds = min($this->timeoutSeconds, max(0.001, $timeoutMilliseconds / 1000));
            $response = Http::timeout($timeoutSeconds)->acceptJson()->withHeaders(['X-Talos-Worker-Token' => $this->token, 'X-Talos-Owner-Ref' => $ownerRef])->send($method, rtrim($this->baseUrl, '/').$path, ['json' => $payload]);
        } catch (ConnectionException $exception) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is unavailable.');
        }
        if ($response->status() === 204) return [];
        if (! $response->successful() || ! is_array($response->json('data'))) throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker failed to complete the request.');
        /** @var array<string, mixed> $data */ $data = $response->json('data');
        return $data;
    }
}
