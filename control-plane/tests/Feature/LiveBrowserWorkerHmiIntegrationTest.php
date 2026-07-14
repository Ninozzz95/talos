<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Talos\Browser\HttpBrowserSessionClient;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('live-browser-worker')]
final class LiveBrowserWorkerHmiIntegrationTest extends TestCase
{
    public function test_laravel_client_executes_a_real_chromium_hmi_transition(): void
    {
        $baseUrl = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_URL'));
        $token = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_TOKEN'));
        if ($baseUrl === '' || $token === '') {
            $this->markTestSkipped('Set TALOS_LIVE_BROWSER_WORKER_URL and TALOS_LIVE_BROWSER_WORKER_TOKEN to run the live Chromium integration gate.');
        }

        $fixture = realpath(base_path('../browser-worker/tests/fixtures/hmi-page.html'));
        $this->assertNotFalse($fixture, 'The Browser Worker HMI fixture must exist.');
        $fixtureUrl = 'file:///'.str_replace('\\', '/', ltrim((string) $fixture, '/'));

        $client = new HttpBrowserSessionClient($baseUrl, $token, 20);
        $ownerRef = 'talos-live-hmi:'.bin2hex(random_bytes(8));
        $workerSessionId = null;

        try {
            $created = $client->create($ownerRef, 800, 600, 20_000, 300);
            $workerSessionId = $created['sessionId'] ?? null;
            $this->assertIsString($workerSessionId);
            $this->assertNotSame('', $workerSessionId);
            $this->assertFalse((bool) data_get($created, 'capabilities.actions'));
            $this->assertTrue((bool) data_get($created, 'capabilities.hmiActions'));

            $navigated = $client->navigate($ownerRef, $workerSessionId, $fixtureUrl, 20_000);
            $sourceStateVersion = $navigated['stateVersion'] ?? null;
            $this->assertSame(1, $sourceStateVersion);

            $frame = $client->screenshot($ownerRef, $workerSessionId, 20_000);
            $frameSha256 = $frame['sha256'] ?? null;
            $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', (string) $frameSha256);
            $interactionId = (string) Str::uuid();

            $pointer = [
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => $interactionId,
                'state_version' => $sourceStateVersion,
                'expected_frame_sha256' => 'sha256:'.$frameSha256,
                'normalized_x' => 0.200625,
                'normalized_y' => 0.280834,
                'button' => 'left',
                'click_count' => 1,
            ];
            $preflight = $client->preflightPointer($ownerRef, $workerSessionId, $pointer, 20_000);
            $this->assertSame('talos_browser_hmi_preflight_v2', $preflight['schema_version'] ?? null);
            $this->assertSame($interactionId, $preflight['interaction_id'] ?? null);
            $this->assertSame($pointer['expected_frame_sha256'], $preflight['frame_sha256'] ?? null);
            $this->assertSame(0.200625, data_get($preflight, 'point.normalized_x'));
            $this->assertSame(0.280834, data_get($preflight, 'point.normalized_y'));
            $this->assertSame(161, data_get($preflight, 'point.x'));
            $this->assertSame(169, data_get($preflight, 'point.y'));
            $this->assertSame('Reject optional cookies', data_get($preflight, 'target.name'));
            $effectClassification = data_get($preflight, 'target.required_effect_classification');
            $this->assertContains($effectClassification, ['ordinary', 'sensitive']);
            $commandId = 'hmi_live_'.bin2hex(random_bytes(16));

            $result = $client->executePointer($ownerRef, $workerSessionId, [
                ...$pointer,
                'command_id' => $commandId,
                'expected_fingerprint' => data_get($preflight, 'target.fingerprint'),
                'effect_classification' => $effectClassification,
                'sensitive_effect_authorized' => $effectClassification === 'sensitive',
            ], 20_000);

            $this->assertSame('talos_browser_hmi_result_v2', $result['schema_version'] ?? null);
            $this->assertSame($interactionId, $result['interaction_id'] ?? null);
            $this->assertSame($commandId, $result['command_id'] ?? null);
            $this->assertSame($sourceStateVersion, $result['source_state_version'] ?? null);
            $this->assertSame($sourceStateVersion + 1, $result['state_version'] ?? null);
            $this->assertSame('image/png', data_get($result, 'screenshot.mime_type'));
            $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', (string) data_get($result, 'screenshot.sha256'));
            $this->assertSame('accessibility_refs_v1', data_get($result, 'snapshot.format'));
            $this->assertNotSame('', (string) data_get($result, 'snapshot.snapshot_id'));

            $inspected = $client->inspect($ownerRef, $workerSessionId, 20_000);
            $this->assertSame($sourceStateVersion + 1, $inspected['stateVersion'] ?? null);
        } finally {
            if (is_string($workerSessionId) && $workerSessionId !== '') {
                $client->close($ownerRef, $workerSessionId, 20_000);
            }
        }
    }
}
