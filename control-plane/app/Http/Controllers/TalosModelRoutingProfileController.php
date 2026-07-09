<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosModelRoutingProfile;
use App\Models\User;
use App\Services\Models\TalosModelRoutingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

final class TalosModelRoutingProfileController extends Controller
{
    public function __construct(
        private readonly TalosModelRoutingService $routing,
    ) {}

    public function index(): JsonResponse
    {
        $user = $this->user();
        $profiles = TalosModelRoutingProfile::query()
            ->where('user_id', $user->id)
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosModelRoutingProfile $profile): array => $this->routing->apiPayload($profile))
            ->values();

        return response()->json(['data' => $profiles]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatedPayload($request, creating: true);
        $user = $this->user();
        $profile = $this->routing->create($validated, $user);

        TalosAuditEvent::record('model_routing_profile.created', 'model_routing_profile', $profile->id, [
            'name' => $profile->name,
            'task_type' => $profile->task_type,
            'status' => $profile->status,
            'lane_count' => count($profile->lanes ?? []),
        ], 'user', (string) $user->id);

        return response()->json(['data' => $this->routing->apiPayload($profile)], 201);
    }

    public function show(TalosModelRoutingProfile $routingProfile): JsonResponse
    {
        $this->authorizeRoutingProfile($routingProfile);

        return response()->json(['data' => $this->routing->apiPayload($routingProfile)]);
    }

    public function update(Request $request, TalosModelRoutingProfile $routingProfile): JsonResponse
    {
        $this->authorizeRoutingProfile($routingProfile);
        $validated = $this->validatedPayload($request, creating: false);
        $user = $this->user();
        $updated = $this->routing->update($routingProfile, $validated, $user);

        TalosAuditEvent::record('model_routing_profile.updated', 'model_routing_profile', $updated->id, [
            'fields' => array_values(array_keys($validated)),
            'lane_count' => count($updated->lanes ?? []),
        ], 'user', (string) $user->id);

        return response()->json(['data' => $this->routing->apiPayload($updated)]);
    }

    public function destroy(TalosModelRoutingProfile $routingProfile): JsonResponse
    {
        $this->authorizeRoutingProfile($routingProfile);
        $id = (string) $routingProfile->id;
        $routingProfile->delete();

        TalosAuditEvent::record('model_routing_profile.deleted', 'model_routing_profile', $id, [], 'user', (string) $this->user()->id);

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedPayload(Request $request, bool $creating): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:1', 'max:255'],
            'task_type' => ['sometimes', 'string', Rule::in(['chat', 'agent', 'search', 'research'])],
            'status' => ['sometimes', 'string', Rule::in(['enabled', 'disabled'])],
            'lanes' => [$creating ? 'required' : 'sometimes', 'array', 'min:1', 'max:3'],
            'lanes.*.model_profile_id' => ['required_with:lanes', 'string', 'distinct', 'exists:talos_model_profiles,id'],
            'lanes.*.role' => ['sometimes', 'string', 'min:1', 'max:64'],
            'lanes.*.weight' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);
    }

    private function authorizeRoutingProfile(TalosModelRoutingProfile $routingProfile): void
    {
        abort_unless(Auth::id() === $routingProfile->user_id, 404);
    }

    private function user(): User
    {
        $user = Auth::user();
        abort_unless($user !== null, 401);
        assert($user instanceof User);

        return $user;
    }
}
