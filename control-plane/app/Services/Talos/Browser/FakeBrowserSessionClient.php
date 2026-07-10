<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class FakeBrowserSessionClient implements BrowserSessionClient
{
    /** @var list<array<string, mixed>> */ public array $requests = [];
    public ?BrowserWorkerException $failure = null;
    /** @var array<string, mixed>|null */ public ?array $navigateResponse = null;
    /** @var array<string, mixed>|null */ public ?array $screenshotResponse = null;
    private int $nextSession = 1;
    public function create(string $ownerRef, int $width, int $height): array { return $this->respond('create', compact('ownerRef', 'width', 'height'), ['sessionId' => 'worker-'.$this->nextSession++, 'status' => 'ready', 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'downloads' => false, 'uploads' => false], 'expiresAt' => now()->addHour()->toJSON()]); }
    public function navigate(string $ownerRef, string $workerSessionId, string $url): array { return $this->respond('navigate', compact('ownerRef', 'workerSessionId', 'url'), $this->navigateResponse ?? ['url' => $url, 'title' => 'Example page', 'status' => 'active']); }
    public function screenshot(string $ownerRef, string $workerSessionId): array { return $this->respond('screenshot', compact('ownerRef', 'workerSessionId'), $this->screenshotResponse ?? ['mime' => 'image/png', 'width' => 1280, 'height' => 800, 'base64' => base64_encode('fake png bytes'), 'sha256' => hash('sha256', 'fake png bytes')]); }
    public function snapshot(string $ownerRef, string $workerSessionId): array { return $this->respond('snapshot', compact('ownerRef', 'workerSessionId'), ['format' => 'accessibility_refs_v1', 'textDigest' => hash('sha256', 'snapshot'), 'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]], 'url' => 'https://example.com', 'title' => 'Example page']); }
    public function close(string $ownerRef, string $workerSessionId): void { $this->respond('close', compact('ownerRef', 'workerSessionId'), []); }
    /** @param array<string,mixed> $request @param array<string,mixed> $response @return array<string,mixed> */
    private function respond(string $method, array $request, array $response): array { $this->requests[] = ['method' => $method] + $request; if ($this->failure) throw $this->failure; return $response; }
}
