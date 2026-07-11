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
use Throwable;

final class TalosModelProfileController extends Controller
{
    private PublicHttpUrlPolicy $urlPolicy;

    public function __construct()
    {
        $this->urlPolicy = PublicHttpUrlPolicy::fromConfig();
    }

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $profiles = TalosModelProfile::query()
            ->where('user_id', $userId)
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosModelProfile $profile): array => $profile->toApiArray())
            ->values();

        return response()->json(['data' => $profiles]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);

        $validated = $request->validate([
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
        $this->assertSafeBaseUrl((string) $validated['provider'], $validated['base_url'] ?? null);
        $this->assertSecretPolicy((string) $validated['provider'], $validated['secret'] ?? null, false);
        $requestedCapabilities = $validated['capabilities'] ?? null;

        $profile = TalosModelProfile::query()->create([
            'user_id' => $userId,
            'provider' => $validated['provider'],
            'model' => $validated['model'],
            'display_name' => $validated['display_name'],
            'encrypted_secret' => filled($validated['secret'] ?? null) ? Crypt::encryptString((string) $validated['secret']) : null,
            'base_url' => $validated['base_url'] ?? null,
            'timeout_seconds' => $validated['timeout_seconds'],
            'status' => 'untested',
            'capabilities' => null,
            'probe_result' => null,
        ]);

        TalosAuditEvent::record('model_profile.created', 'model_profile', $profile->id, [
            ...$validated,
            'secret' => array_key_exists('secret', $validated) ? $validated['secret'] : null,
            'requested_capabilities' => $requestedCapabilities,
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
        $this->assertSafeBaseUrl((string) $validated['provider'], $validated['base_url'] ?? null);
        $this->assertSecretPolicy((string) $validated['provider'], $validated['secret'] ?? null, false);

        return response()->json(['data' => $probeService->probeDraft($validated)]);
    }

    public function show(Request $request, TalosModelProfile $profile): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $profile);

        return response()->json(['data' => $profile->toApiArray()]);
    }

    public function update(Request $request, TalosModelProfile $profile): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $profile);

        $validated = $request->validate([
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
        $this->assertSafeBaseUrl($provider, $baseUrl);
        $requestedCapabilities = $validated['capabilities'] ?? null;
        $secretChanged = array_key_exists('secret', $validated)
            && $this->submittedSecretChanges($profile, $validated['secret']);
        $connectionIdentityChanged = (array_key_exists('provider', $validated) && $validated['provider'] !== $profile->provider)
            || (array_key_exists('model', $validated) && $validated['model'] !== $profile->model)
            || (array_key_exists('base_url', $validated) && $validated['base_url'] !== $profile->base_url)
            || $secretChanged;

        $this->assertSecretPolicy($provider, $validated['secret'] ?? null, filled($profile->encrypted_secret));

        if (array_key_exists('secret', $validated)) {
            if ($secretChanged) {
                $validated['encrypted_secret'] = filled($validated['secret'])
                    ? Crypt::encryptString((string) $validated['secret'])
                    : null;
            }
            unset($validated['secret']);
        }

        if (! TalosModelProviderCatalog::requiresSecret($provider)) {
            $validated['encrypted_secret'] = null;
        }

        $requestedStatus = $validated['status'] ?? null;
        unset($validated['status'], $validated['capabilities'], $validated['probe_result']);

        if ($connectionIdentityChanged) {
            $validated['status'] = 'untested';
            $validated['capabilities'] = null;
            $validated['probe_result'] = null;
        } elseif (is_string($requestedStatus) && $requestedStatus !== 'healthy') {
            // Healthy status requires a server probe; other operational status changes are valid updates.
            $validated['status'] = $requestedStatus;
        }

        $profile->update($validated);

        TalosAuditEvent::record('model_profile.updated', 'model_profile', $profile->id, [
            ...$validated,
            'requested_capabilities' => $requestedCapabilities,
        ]);

        return response()->json(['data' => $profile->refresh()->toApiArray()]);
    }

    private function submittedSecretChanges(TalosModelProfile $profile, mixed $submittedSecret): bool
    {
        if (! filled($profile->encrypted_secret)) {
            return filled($submittedSecret);
        }

        if (! filled($submittedSecret)) {
            return true;
        }

        try {
            return ! hash_equals(
                Crypt::decryptString((string) $profile->encrypted_secret),
                (string) $submittedSecret,
            );
        } catch (Throwable) {
            return true;
        }
    }

    public function destroy(Request $request, TalosModelProfile $profile): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $profile);

        $profile->delete();

        return response()->json(null, 204);
    }

    public function probe(Request $request, TalosModelProfile $profile, TalosModelProbeService $probeService): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $profile);

        $probe = $probeService->probe($profile);

        $profile->update([
            'status' => $probe['status'],
            'capabilities' => $probe['capabilities'],
            'probe_result' => $probe['result'],
        ]);

        return response()->json(['data' => $profile->refresh()->toApiArray()]);
    }

    private function assertSafeBaseUrl(string $provider, ?string $baseUrl): void
    {
        if (TalosModelProviderCatalog::requiresTrustedLocalBaseUrl($provider)) {
            if (TalosModelProviderCatalog::allowsTrustedLocalBaseUrl($provider, $baseUrl)) {
                return;
            }

            throw ValidationException::withMessages([
                'base_url' => 'Local provider base URL must use loopback localhost, 127.0.0.1, or ::1 without userinfo, query, or fragment.',
            ]);
        }

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

    private function abortUnlessOwnedByCurrentUser(Request $request, TalosModelProfile $profile): void
    {
        abort_unless($request->user()?->id === $profile->user_id, 404);
    }
}
