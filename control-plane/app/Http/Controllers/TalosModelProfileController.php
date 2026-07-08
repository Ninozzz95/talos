<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosModelProfile;
use App\Services\Models\TalosModelProbeService;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

final class TalosModelProfileController extends Controller
{
    private PublicHttpUrlPolicy $urlPolicy;

    public function __construct()
    {
        $this->urlPolicy = PublicHttpUrlPolicy::fromConfig();
    }

    public function index(): JsonResponse
    {
        $profiles = TalosModelProfile::query()
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosModelProfile $profile): array => $profile->toApiArray())
            ->values();

        return response()->json(['data' => $profiles]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'provider' => ['required', 'string', Rule::in(['deepseek', 'openai'])],
            'model' => ['required', 'string', 'min:1', 'max:255'],
            'display_name' => ['required', 'string', 'min:1', 'max:255'],
            'secret' => ['required', 'string', 'min:1', 'max:4096'],
            'base_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'status' => ['sometimes', 'string', Rule::in(['untested', 'healthy', 'degraded', 'failed', 'disabled'])],
            'capabilities' => ['sometimes', 'nullable', 'array'],
            'probe_result' => ['sometimes', 'nullable', 'array'],
        ]);

        $this->assertSafeBaseUrl($validated['base_url'] ?? null);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $validated['user_id'] ?? null,
            'provider' => $validated['provider'],
            'model' => $validated['model'],
            'display_name' => $validated['display_name'],
            'encrypted_secret' => Crypt::encryptString($validated['secret']),
            'base_url' => $validated['base_url'] ?? null,
            'status' => $validated['status'] ?? 'untested',
            'capabilities' => $validated['capabilities'] ?? null,
            'probe_result' => $validated['probe_result'] ?? null,
        ]);

        TalosAuditEvent::record('model_profile.created', 'model_profile', $profile->id, [
            ...$validated,
            'secret' => array_key_exists('secret', $validated) ? $validated['secret'] : null,
        ]);

        return response()->json(['data' => $profile->toApiArray()], 201);
    }

    public function show(TalosModelProfile $profile): JsonResponse
    {
        return response()->json(['data' => $profile->toApiArray()]);
    }

    public function update(Request $request, TalosModelProfile $profile): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'provider' => ['sometimes', 'string', Rule::in(['deepseek', 'openai'])],
            'model' => ['sometimes', 'string', 'min:1', 'max:255'],
            'display_name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'secret' => ['sometimes', 'string', 'min:1', 'max:4096'],
            'base_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'status' => ['sometimes', 'string', Rule::in(['untested', 'healthy', 'degraded', 'failed', 'disabled'])],
            'capabilities' => ['sometimes', 'nullable', 'array'],
            'probe_result' => ['sometimes', 'nullable', 'array'],
        ]);

        $this->assertSafeBaseUrl($validated['base_url'] ?? null);

        if (array_key_exists('secret', $validated)) {
            $validated['encrypted_secret'] = Crypt::encryptString($validated['secret']);
            unset($validated['secret']);
        }

        $profile->update($validated);

        TalosAuditEvent::record('model_profile.updated', 'model_profile', $profile->id, $validated);

        return response()->json(['data' => $profile->refresh()->toApiArray()]);
    }

    public function destroy(TalosModelProfile $profile): JsonResponse
    {
        $profile->delete();

        return response()->json(null, 204);
    }

    public function probe(TalosModelProfile $profile, TalosModelProbeService $probeService): JsonResponse
    {
        $probe = $probeService->probe($profile);

        $profile->update([
            'status' => $probe['status'],
            'probe_result' => $probe['result'],
        ]);

        return response()->json(['data' => $profile->refresh()->toApiArray()]);
    }

    private function assertSafeBaseUrl(?string $baseUrl): void
    {
        if (! filled($baseUrl)) {
            return;
        }

        $decision = $this->urlPolicy->inspect((string) $baseUrl);
        if (! $decision['allowed']) {
            throw ValidationException::withMessages([
                'base_url' => "Provider base URL blocked by TALOS policy: {$decision['reason']}",
            ]);
        }
    }
}
