<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosModelProfile;
use App\Services\Models\TalosModelProviderCatalog;
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
            'provider' => ['required', 'string', Rule::in(TalosModelProviderCatalog::ids())],
            'model' => ['sometimes', 'nullable', 'string', 'min:1', 'max:255'],
            'display_name' => ['sometimes', 'nullable', 'string', 'min:1', 'max:255'],
            'secret' => ['sometimes', 'nullable', 'string', 'min:1', 'max:4096'],
            'base_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'timeout_seconds' => ['sometimes', 'integer', 'min:5', 'max:300'],
            'status' => ['sometimes', 'string', Rule::in(['untested', 'healthy', 'degraded', 'failed', 'disabled'])],
            'capabilities' => ['sometimes', 'nullable', 'array'],
            'probe_result' => ['sometimes', 'nullable', 'array'],
        ]);

        $validated = TalosModelProviderCatalog::applyCreateDefaults($validated);
        $this->assertSecretPolicy((string) $validated['provider'], $validated['secret'] ?? null, false);
        $this->assertSafeBaseUrl((string) $validated['provider'], $validated['base_url'] ?? null);

        $profile = TalosModelProfile::query()->create([
            'user_id' => $validated['user_id'] ?? null,
            'provider' => $validated['provider'],
            'model' => $validated['model'],
            'display_name' => $validated['display_name'],
            'encrypted_secret' => filled($validated['secret'] ?? null) ? Crypt::encryptString((string) $validated['secret']) : null,
            'base_url' => $validated['base_url'] ?? null,
            'timeout_seconds' => $validated['timeout_seconds'],
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

    public function probeDraft(Request $request, TalosModelProbeService $probeService): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', Rule::in(TalosModelProviderCatalog::ids())],
            'model' => ['sometimes', 'nullable', 'string', 'min:1', 'max:255'],
            'display_name' => ['sometimes', 'nullable', 'string', 'min:1', 'max:255'],
            'secret' => ['sometimes', 'nullable', 'string', 'min:1', 'max:4096'],
            'base_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'timeout_seconds' => ['sometimes', 'integer', 'min:5', 'max:300'],
            'capabilities' => ['sometimes', 'nullable', 'array'],
        ]);

        $validated = TalosModelProviderCatalog::applyCreateDefaults($validated);
        $this->assertSecretPolicy((string) $validated['provider'], $validated['secret'] ?? null, false);
        $this->assertSafeBaseUrl((string) $validated['provider'], $validated['base_url'] ?? null);

        return response()->json(['data' => $probeService->probeDraft($validated)]);
    }

    public function show(TalosModelProfile $profile): JsonResponse
    {
        return response()->json(['data' => $profile->toApiArray()]);
    }

    public function update(Request $request, TalosModelProfile $profile): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'provider' => ['sometimes', 'string', Rule::in(TalosModelProviderCatalog::ids())],
            'model' => ['sometimes', 'string', 'min:1', 'max:255'],
            'display_name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'secret' => ['sometimes', 'nullable', 'string', 'min:1', 'max:4096'],
            'base_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'timeout_seconds' => ['sometimes', 'integer', 'min:5', 'max:300'],
            'status' => ['sometimes', 'string', Rule::in(['untested', 'healthy', 'degraded', 'failed', 'disabled'])],
            'capabilities' => ['sometimes', 'nullable', 'array'],
            'probe_result' => ['sometimes', 'nullable', 'array'],
        ]);

        $provider = (string) ($validated['provider'] ?? $profile->provider);
        $baseUrl = array_key_exists('base_url', $validated) ? $validated['base_url'] : $profile->base_url;

        $this->assertSecretPolicy($provider, $validated['secret'] ?? null, filled($profile->encrypted_secret));
        $this->assertSafeBaseUrl($provider, $baseUrl);

        if (array_key_exists('secret', $validated)) {
            $validated['encrypted_secret'] = filled($validated['secret'])
                ? Crypt::encryptString((string) $validated['secret'])
                : null;
            unset($validated['secret']);
        }

        if (! TalosModelProviderCatalog::requiresSecret($provider)) {
            $validated['encrypted_secret'] = null;
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

    private function assertSafeBaseUrl(string $provider, ?string $baseUrl): void
    {
        if (! filled($baseUrl)) {
            return;
        }

        if (TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $baseUrl)) {
            return;
        }

        $decision = $this->urlPolicy->inspect((string) $baseUrl);
        if (! $decision['allowed']) {
            throw ValidationException::withMessages([
                'base_url' => "Provider base URL blocked by TALOS policy: {$decision['reason']}",
            ]);
        }
    }

    private function assertSecretPolicy(string $provider, mixed $secret, bool $alreadyHasSecret): void
    {
        if (TalosModelProviderCatalog::requiresSecret($provider)) {
            if (! filled($secret) && ! $alreadyHasSecret) {
                throw ValidationException::withMessages([
                    'secret' => 'Provider API key is required for this remote provider.',
                ]);
            }

            return;
        }

        if (filled($secret)) {
            throw ValidationException::withMessages([
                'secret' => 'Local providers are allowed only without bearer tokens.',
            ]);
        }
    }
}
