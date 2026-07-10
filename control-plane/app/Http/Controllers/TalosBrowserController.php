<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;

final class TalosBrowserController extends Controller
{
    public function __construct(private readonly BrowserSessionClient $client, private readonly TalosBrowserPolicy $policy, private readonly TalosBrowserArtifactStore $artifacts) {}

    public function index(Request $request): JsonResponse { return response()->json(['data' => TalosBrowserSession::query()->where('user_id', $this->userId($request))->latest()->get()->map->toApiArray()->values()]); }
    public function store(Request $request): JsonResponse
    {
        $payload = $this->validated($request, ['viewport.width' => ['nullable', 'integer', 'min:320', 'max:3840'], 'viewport.height' => ['nullable', 'integer', 'min:240', 'max:2160']]);
        if ($payload instanceof JsonResponse) return $payload;
        $width = (int) data_get($payload, 'viewport.width', 1280); $height = (int) data_get($payload, 'viewport.height', 800); $userId = $this->userId($request);
        try { $worker = $this->client->create($this->ownerRef($userId), $width, $height); } catch (BrowserWorkerException $exception) { return $this->workerError($exception); }
        $session = TalosBrowserSession::query()->create(['user_id' => $userId, 'worker_session_id' => (string) $worker['sessionId'], 'status' => (string) ($worker['status'] ?? 'ready'), 'mode' => 'read_only', 'viewport_width' => $width, 'viewport_height' => $height, 'capabilities' => $worker['capabilities'] ?? [], 'policy' => [], 'expires_at' => $worker['expiresAt'] ?? null, 'last_seen_at' => now()]);
        $this->event($session, 'session.created', 'system', payload: ['mode' => 'read_only']);
        return response()->json(['data' => $session->toApiArray()], 201);
    }
    public function show(Request $request, TalosBrowserSession $browserSession): JsonResponse { if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error; return response()->json(['data' => $browserSession->toApiArray()]); }
    public function destroy(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error;
        try { $this->client->close($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id); } catch (BrowserWorkerException) { /* The durable session must still close when the transient worker cannot be reached. */ }
        $browserSession->update(['status' => 'closed', 'last_seen_at' => now()]); $this->event($browserSession, 'session.closed', 'system');
        return response()->json(['data' => $browserSession->fresh()->toApiArray()]);
    }
    public function navigate(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error;
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) return $error;
        $payload = $this->validated($request, ['url' => ['required', 'string', 'max:2048']]); if ($payload instanceof JsonResponse) return $payload;
        $url = (string) $payload['url']; $decision = $this->policy->inspect($url);
        $this->event($browserSession, 'navigation.requested', 'user', $browserSession->current_url, $url, policy: $decision);
        if (! $decision['allowed']) { $this->event($browserSession, 'policy.denied', 'policy', $browserSession->current_url, $url, policy: $decision); return response()->json(['code' => 'TALOS_BROWSER_POLICY_DENIED', 'message' => 'Browser navigation was blocked by policy.', 'details' => ['reason' => $decision['reason']]], 422); }
        try { $worker = $this->client->navigate($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id, $url); } catch (BrowserWorkerException $exception) { return $this->workerError($exception); }
        $finalUrl = is_string($worker['url'] ?? null) ? $worker['url'] : $url; $finalDecision = $this->policy->inspect($finalUrl);
        if (! $finalDecision['allowed']) { $this->event($browserSession, 'policy.denied', 'policy', $url, $finalUrl, policy: $finalDecision); return $this->policyDenied($finalDecision); }
        $browserSession->update(['status' => $worker['status'] ?? 'active', 'current_url' => $finalUrl, 'current_title' => $worker['title'] ?? null, 'policy' => $finalDecision, 'last_seen_at' => now()]);
        $this->event($browserSession, 'navigation.completed', 'worker', $url, $browserSession->current_url, ['title' => $browserSession->current_title], $finalDecision);
        return response()->json(['data' => $browserSession->fresh()->toApiArray()]);
    }
    public function screenshot(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error;
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) return $error;
        try { $worker = $this->client->screenshot($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id); } catch (BrowserWorkerException $exception) { return $this->workerError($exception); }
        $base64 = $worker['base64'] ?? null; $bytes = is_string($base64) && $base64 !== '' ? base64_decode($base64, true) : false; if (! is_string($bytes) || $bytes === '') return $this->failure('Browser worker returned an invalid screenshot.');
        $artifact = $this->artifacts->store($browserSession, 'screenshot', 'image/png', $bytes, ['width' => $worker['width'] ?? null, 'height' => $worker['height'] ?? null]);
        $browserSession->update(['last_screenshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]); $this->event($browserSession, 'screenshot.captured', 'worker', payload: ['artifact_id' => $artifact->id]);
        return response()->json(['data' => $artifact->toApiArray()], 201);
    }
    public function snapshot(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error;
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) return $error;
        try { $worker = $this->client->snapshot($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id); } catch (BrowserWorkerException $exception) { return $this->workerError($exception); }
        $content = json_encode($worker, JSON_THROW_ON_ERROR); $metadata = ['format' => $worker['format'] ?? null, 'text_digest' => $worker['textDigest'] ?? null, 'node_count' => is_array($worker['nodes'] ?? null) ? count($worker['nodes']) : 0];
        $artifact = $this->artifacts->store($browserSession, 'snapshot', 'application/json', $content, $metadata); $browserSession->update(['last_snapshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]); $this->event($browserSession, 'snapshot.captured', 'worker', payload: ['artifact_id' => $artifact->id, 'text_digest' => $metadata['text_digest']]);
        return response()->json(['data' => $artifact->toApiArray()], 201);
    }
    public function events(Request $request, TalosBrowserSession $browserSession): JsonResponse { if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) return $error; return response()->json(['data' => $browserSession->events()->oldest()->get()->map->toApiArray()->values()]); }
    public function artifact(Request $request, TalosBrowserArtifact $browserArtifact): JsonResponse { if (($error = $this->ownedArtifact($request, $browserArtifact)) instanceof JsonResponse) return $error; return response()->json(['data' => $browserArtifact->toApiArray()]); }
    public function preview(Request $request, TalosBrowserArtifact $browserArtifact)
    {
        if (($error = $this->ownedArtifact($request, $browserArtifact)) instanceof JsonResponse) return $error;
        if ($browserArtifact->type === 'snapshot') return $this->snapshotPreview($browserArtifact);
        if ($browserArtifact->type !== 'screenshot') return response()->json(['data' => ['preview_available' => false, 'artifact' => $browserArtifact->toApiArray()]]);
        if (! Storage::disk($browserArtifact->storage_disk)->exists($browserArtifact->storage_path)) return $this->notFound();
        return response(Storage::disk($browserArtifact->storage_disk)->get($browserArtifact->storage_path), 200, ['Content-Type' => $browserArtifact->mime, 'X-Content-Type-Options' => 'nosniff']);
    }
    private function userId(Request $request): int { $user = $request->user(); return $user instanceof User ? (int) $user->id : 0; }
    private function ownerRef(int $userId): string { return "talos-user:{$userId}"; }
    private function owned(Request $request, TalosBrowserSession $session): ?JsonResponse { return (int) $session->user_id === $this->userId($request) ? null : $this->notFound(); }
    private function ownedArtifact(Request $request, TalosBrowserArtifact $artifact): ?JsonResponse { $session = $artifact->session; return (int) $artifact->user_id === $this->userId($request) && $session instanceof TalosBrowserSession && (int) $session->user_id === $this->userId($request) ? null : $this->notFound(); }
    /** @param array<string,mixed> $payload @param array<string,mixed>|null $policy */
    private function event(TalosBrowserSession $session, string $type, string $actor, ?string $before = null, ?string $after = null, array $payload = [], ?array $policy = null): void { TalosBrowserEvent::query()->create(['browser_session_id' => $session->id, 'user_id' => $session->user_id, 'type' => $type, 'actor' => $actor, 'url_before' => $before, 'url_after' => $after, 'payload' => $payload, 'policy_decision' => $policy]); }
    private function workerError(BrowserWorkerException $exception): JsonResponse { return response()->json(['code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => []], $exception->errorCode === 'TALOS_BROWSER_WORKER_UNAVAILABLE' ? 503 : 502); }
    private function failure(string $message): JsonResponse { return response()->json(['code' => 'TALOS_BROWSER_WORKER_FAILURE', 'message' => $message, 'details' => []], 502); }
    /** @param array<string, mixed> $rules @return array<string, mixed>|JsonResponse */
    private function validated(Request $request, array $rules): array|JsonResponse { $validator = Validator::make($request->all(), $rules); return $validator->fails() ? response()->json(['code' => 'TALOS_BROWSER_VALIDATION_FAILED', 'message' => 'Browser request validation failed.', 'details' => $validator->errors()->toArray()], 422) : $validator->validated(); }
    private function operable(TalosBrowserSession $session): ?JsonResponse { return in_array($session->status, ['closed', 'expired', 'failed'], true) ? response()->json(['code' => 'TALOS_BROWSER_INVALID_STATE', 'message' => 'Browser session is not active.', 'details' => ['status' => $session->status]], 409) : null; }
    /** @param array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} $decision */
    private function policyDenied(array $decision): JsonResponse { return response()->json(['code' => 'TALOS_BROWSER_POLICY_DENIED', 'message' => 'Browser navigation was blocked by policy.', 'details' => ['reason' => $decision['reason']]], 422); }
    private function notFound(): JsonResponse { return response()->json(['code' => 'TALOS_BROWSER_NOT_FOUND', 'message' => 'Browser resource was not found.', 'details' => []], 404); }
    private function artifactInvalid(): JsonResponse { return response()->json(['code' => 'TALOS_BROWSER_ARTIFACT_INVALID', 'message' => 'Browser snapshot artifact is missing or invalid.', 'details' => []], 502); }

    private function snapshotPreview(TalosBrowserArtifact $artifact): JsonResponse
    {
        if (! Storage::disk($artifact->storage_disk)->exists($artifact->storage_path)) return $this->artifactInvalid();
        try { $raw = json_decode(Storage::disk($artifact->storage_disk)->get($artifact->storage_path), true, 32, JSON_THROW_ON_ERROR); } catch (\JsonException) { return $this->artifactInvalid(); }
        if (! is_array($raw) || ($raw['format'] ?? null) !== 'accessibility_refs_v1' || ! is_string($raw['url'] ?? null) || ! is_string($raw['title'] ?? null) || ! is_string($raw['textDigest'] ?? null) || ! is_array($raw['nodes'] ?? null)) return $this->artifactInvalid();
        $nodes = [];
        foreach (array_slice($raw['nodes'], 0, 200) as $node) {
            if (! is_array($node) || ! is_string($node['ref'] ?? null) || ! is_string($node['role'] ?? null) || ! is_string($node['name'] ?? null) || ! is_bool($node['visible'] ?? null)) continue;
            $safe = ['ref' => mb_substr($node['ref'], 0, 128), 'role' => mb_substr($node['role'], 0, 128), 'name' => mb_substr($node['name'], 0, 512), 'visible' => $node['visible']];
            if (isset($node['level']) && is_int($node['level']) && $node['level'] >= 1 && $node['level'] <= 6) $safe['level'] = $node['level'];
            $nodes[] = $safe;
        }
        return response()->json(['data' => ['preview_available' => true, 'snapshot' => ['untrusted' => true, 'format' => 'accessibility_refs_v1', 'url' => mb_substr($raw['url'], 0, 2048), 'title' => mb_substr($raw['title'], 0, 512), 'nodes' => $nodes, 'text_digest' => mb_substr($raw['textDigest'], 0, 128), 'truncated' => count($raw['nodes']) > 200]]]);
    }
}
