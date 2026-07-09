<?php

declare(strict_types=1);

namespace App\Services\Models;

use App\Models\TalosModelProfile;
use App\Models\TalosModelRoutingProfile;
use App\Models\User;
use App\Services\Security\PublicHttpUrlPolicy;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TalosModelRoutingService
{
    private readonly PublicHttpUrlPolicy $urlPolicy;

    public function __construct(?PublicHttpUrlPolicy $urlPolicy = null)
    {
        $this->urlPolicy = $urlPolicy ?? PublicHttpUrlPolicy::fromConfig();
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function create(array $payload, User $user): TalosModelRoutingProfile
    {
        $lanes = $this->normalizeLanes($payload['lanes'] ?? [], $user);

        return DB::transaction(function () use ($payload, $user, $lanes): TalosModelRoutingProfile {
            $profile = TalosModelRoutingProfile::query()->create([
                'user_id' => $user->id,
                'name' => $payload['name'],
                'task_type' => $payload['task_type'] ?? 'chat',
                'status' => $payload['status'] ?? 'enabled',
                'lanes' => $lanes,
                'metadata' => $payload['metadata'] ?? [
                    'policy' => 'same_user_server_side_profiles_only',
                    'lane_limit' => 3,
                ],
            ]);
            assert($profile instanceof TalosModelRoutingProfile);

            return $profile;
        });
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function update(TalosModelRoutingProfile $routingProfile, array $payload, User $user): TalosModelRoutingProfile
    {
        $updates = $payload;

        if (array_key_exists('lanes', $payload)) {
            $updates['lanes'] = $this->normalizeLanes($payload['lanes'], $user);
        }

        $routingProfile->update($updates);

        return $routingProfile->refresh();
    }

    public function resolveEnabled(string $id, User $user): TalosModelRoutingProfile
    {
        $routingProfile = TalosModelRoutingProfile::query()
            ->whereKey($id)
            ->where('user_id', $user->id)
            ->first();

        if (! $routingProfile instanceof TalosModelRoutingProfile) {
            throw ValidationException::withMessages([
                'model_routing_profile_id' => ['Model routing profile was not found.'],
            ]);
        }

        if ($routingProfile->status !== 'enabled') {
            throw ValidationException::withMessages([
                'model_routing_profile_id' => ['Model routing profile is disabled.'],
            ]);
        }

        return $routingProfile;
    }

    /**
     * @return array<string, mixed>
     */
    public function apiPayload(TalosModelRoutingProfile $routingProfile): array
    {
        return [
            ...$routingProfile->toApiArray(),
            'lanes' => $this->enrichedLanes($routingProfile),
        ];
    }

    /**
     * @return array{profile_id: string, name: string, task_type: string, lanes: list<array<string, mixed>>}
     */
    public function routingContext(TalosModelRoutingProfile $routingProfile): array
    {
        return [
            'profile_id' => (string) $routingProfile->id,
            'name' => (string) $routingProfile->name,
            'task_type' => (string) $routingProfile->task_type,
            'lanes' => $this->enrichedLanes($routingProfile),
        ];
    }

    /**
     * @return array{profile: TalosModelProfile, lane: array<string, mixed>}
     */
    public function primaryLane(TalosModelRoutingProfile $routingProfile, User $user): array
    {
        $lanes = $this->normalizeLanes($routingProfile->lanes ?? [], $user);
        $lane = $lanes[0] ?? null;

        if (! is_array($lane)) {
            throw ValidationException::withMessages([
                'model_routing_profile_id' => ['Model routing profile has no usable lanes.'],
            ]);
        }

        $profile = TalosModelProfile::query()
            ->whereKey((string) $lane['model_profile_id'])
            ->where('user_id', $user->id)
            ->first();

        if (! $profile instanceof TalosModelProfile) {
            throw ValidationException::withMessages([
                'model_routing_profile_id' => ['Primary routing lane is no longer available.'],
            ]);
        }

        return [
            'profile' => $profile,
            'lane' => $lane,
        ];
    }

    /**
     * @param mixed $lanes
     * @return list<array{model_profile_id: string, role: string, weight: int, position: int}>
     */
    private function normalizeLanes(mixed $lanes, User $user): array
    {
        if (! is_array($lanes) || array_is_list($lanes) === false || $lanes === []) {
            throw ValidationException::withMessages([
                'lanes' => ['Model routing lanes must be a non-empty list.'],
            ]);
        }

        if (count($lanes) > 3) {
            throw ValidationException::withMessages([
                'lanes' => ['Model routing supports up to three lanes.'],
            ]);
        }

        $profileIds = [];
        foreach ($lanes as $lane) {
            if (! is_array($lane) || ! isset($lane['model_profile_id'])) {
                throw ValidationException::withMessages([
                    'lanes' => ['Every routing lane must select a model profile.'],
                ]);
            }

            $profileIds[] = (string) $lane['model_profile_id'];
        }

        if (count($profileIds) !== count(array_unique($profileIds))) {
            throw ValidationException::withMessages([
                'lanes' => ['Routing lanes must use distinct model profiles.'],
            ]);
        }

        $profiles = $this->usableProfiles($profileIds, $user);

        $normalized = [];
        foreach (array_values($lanes) as $index => $lane) {
            assert(is_array($lane));
            $profileId = (string) $lane['model_profile_id'];
            if (! $profiles->has($profileId)) {
                throw ValidationException::withMessages([
                    'lanes' => ['Every routing lane must belong to the current user.'],
                ]);
            }

            $normalized[] = [
                'model_profile_id' => $profileId,
                'role' => $this->normalizeRole($lane['role'] ?? null, $index),
                'weight' => $this->normalizeWeight($lane['weight'] ?? null),
                'position' => $index + 1,
            ];
        }

        return $normalized;
    }

    /**
     * @param list<string> $profileIds
     * @return Collection<string, TalosModelProfile>
     */
    private function usableProfiles(array $profileIds, User $user): Collection
    {
        $profiles = TalosModelProfile::query()
            ->whereIn('id', $profileIds)
            ->where('user_id', $user->id)
            ->get()
            ->keyBy('id');

        if ($profiles->count() !== count($profileIds)) {
            throw ValidationException::withMessages([
                'lanes' => ['Every routing lane must belong to the current user.'],
            ]);
        }

        foreach ($profileIds as $profileId) {
            $profile = $profiles->get($profileId);
            assert($profile instanceof TalosModelProfile);

            if ($profile->status === 'disabled') {
                throw ValidationException::withMessages([
                    'lanes' => ['Disabled model profiles cannot be used in routing.'],
                ]);
            }

            if (! filled($profile->encrypted_secret)) {
                throw ValidationException::withMessages([
                    'lanes' => ['Every routed model profile must have a server-side secret.'],
                ]);
            }

            if (filled($profile->base_url)) {
                $decision = $this->urlPolicy->inspect((string) $profile->base_url);
                if (! $decision['allowed']) {
                    throw ValidationException::withMessages([
                        'lanes' => ["Provider base URL blocked by TALOS policy: {$decision['reason']}"],
                    ]);
                }
            }
        }

        return $profiles;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function enrichedLanes(TalosModelRoutingProfile $routingProfile): array
    {
        $lanes = is_array($routingProfile->lanes) ? $routingProfile->lanes : [];
        $profileIds = array_values(array_filter(array_map(
            static fn (mixed $lane): ?string => is_array($lane) && isset($lane['model_profile_id'])
                ? (string) $lane['model_profile_id']
                : null,
            $lanes,
        )));

        $profiles = TalosModelProfile::query()
            ->whereIn('id', $profileIds)
            ->get()
            ->keyBy('id');

        return array_values(array_map(static function (mixed $lane) use ($profiles): array {
            $data = is_array($lane) ? $lane : [];
            $profile = isset($data['model_profile_id']) ? $profiles->get((string) $data['model_profile_id']) : null;

            return [
                'model_profile_id' => isset($data['model_profile_id']) ? (string) $data['model_profile_id'] : '',
                'role' => isset($data['role']) ? (string) $data['role'] : 'worker',
                'weight' => isset($data['weight']) ? (int) $data['weight'] : 100,
                'position' => isset($data['position']) ? (int) $data['position'] : 1,
                'model' => $profile instanceof TalosModelProfile ? [
                    'id' => $profile->id,
                    'display_name' => $profile->display_name,
                    'provider' => $profile->provider,
                    'model' => $profile->model,
                    'status' => $profile->status,
                    'has_secret' => filled($profile->encrypted_secret),
                ] : null,
            ];
        }, $lanes));
    }

    private function normalizeRole(mixed $role, int $index): string
    {
        if (is_string($role) && trim($role) !== '') {
            return mb_substr(trim($role), 0, 64);
        }

        return match ($index) {
            0 => 'planner',
            1 => 'critic',
            default => 'executor',
        };
    }

    private function normalizeWeight(mixed $weight): int
    {
        if (is_int($weight)) {
            return max(1, min(1000, $weight));
        }

        if (is_numeric($weight)) {
            return max(1, min(1000, (int) $weight));
        }

        return 100;
    }
}
