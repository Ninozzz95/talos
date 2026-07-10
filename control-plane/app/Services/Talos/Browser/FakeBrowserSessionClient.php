<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class FakeBrowserSessionClient implements BrowserSessionClient
{
    /** @var list<array<string, mixed>> */ public array $requests = [];
    public ?BrowserWorkerException $failure = null;
    /** @var (callable(string): void)|null */ public $afterRequest = null;
    /** @var array<string, mixed>|null */ public ?array $navigateResponse = null;
    /** @var array<string, mixed>|null */ public ?array $screenshotResponse = null;
    /** @var array<string, mixed>|null */ public ?array $snapshotResponse = null;
    /** @var array<string, mixed>|null */ public ?array $inspectResponse = null;
    public int $delayMilliseconds = 0;
    private int $nextSession = 1;
    public function create(string $ownerRef, int $width, int $height): array { return $this->respond('create', compact('ownerRef', 'width', 'height'), ['sessionId' => 'worker-'.$this->nextSession++, 'status' => 'ready', 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'downloads' => false, 'uploads' => false], 'expiresAt' => now()->addHour()->toJSON()]); }
    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->respond('inspect', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->inspectResponse ?? ['status' => 'ready', 'mode' => 'read_only', 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true], 'expiresAt' => now()->addHour()->toJSON()]); }
    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array { return $this->respond('navigate', compact('ownerRef', 'workerSessionId', 'url', 'timeoutMilliseconds'), $this->navigateResponse ?? ['url' => $url, 'title' => 'Example page', 'status' => 'active']); }
    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->respond('screenshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->screenshotResponse ?? ['mime' => 'image/png', 'width' => 1280, 'height' => 800, 'base64' => base64_encode('fake png bytes'), 'sha256' => hash('sha256', 'fake png bytes')]); }
    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array { return $this->respond('snapshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->snapshotResponse ?? ['format' => 'accessibility_refs_v1', 'textDigest' => hash('sha256', 'snapshot'), 'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]], 'url' => 'https://example.com', 'title' => 'Example page']); }
    public function close(string $ownerRef, string $workerSessionId): void { $this->respond('close', compact('ownerRef', 'workerSessionId'), []); }
    /** @param array<string,mixed> $request @param array<string,mixed> $response @return array<string,mixed> */
    private function respond(string $method, array $request, array $response): array { $this->requests[] = ['method' => $method] + $request; if ($this->delayMilliseconds > 0) usleep($this->delayMilliseconds * 1000); if ($this->failure) throw $this->failure; if (is_callable($this->afterRequest)) ($this->afterRequest)($method); return $response; }
}
