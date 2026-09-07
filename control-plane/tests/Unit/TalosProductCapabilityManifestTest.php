<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\User;
use App\Support\TalosProductCapabilityManifest;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class TalosProductCapabilityManifestTest extends TestCase
{
    public function test_rejects_duplicate_capability_identifiers(): void
    {
        $manifest = $this->manifestWith([
            $this->available('chat.provider'),
            $this->available('chat.provider'),
        ]);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Duplicate capability identifier');

        $manifest->forUser($this->user(1));
    }

    public function test_rejects_unknown_capability_states(): void
    {
        $manifest = $this->manifestWith([
            [
                'id' => 'chat.provider',
                'state' => 'experimental',
                'reason' => 'Not a canonical capability state.',
                'evidence' => ['api:POST /api/talos/chat'],
            ],
        ]);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown capability state');

        $manifest->forUser($this->user(1));
    }

    public function test_requires_a_blocking_reason_outside_available_state(): void
    {
        $manifest = $this->manifestWith([
            [
                'id' => 'browser.hmi',
                'state' => 'blocked',
                'reason' => null,
                'evidence' => ['api:POST /api/talos/browser/sessions'],
            ],
        ]);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('requires a non-empty reason');

        $manifest->forUser($this->user(1));
    }

    public function test_never_advertises_a_capability_without_registered_evidence(): void
    {
        $manifest = $this->manifestWith([
            [
                'id' => 'runs.replay',
                'state' => 'available',
                'reason' => null,
                'evidence' => [],
            ],
        ]);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('requires registered evidence');

        $manifest->forUser($this->user(1));
    }

    public function test_returns_only_the_authenticated_users_effective_capability_state(): void
    {
        $manifest = new TalosProductCapabilityManifest(
            fn (User $user): array => [
                (int) $user->getKey() === 7
                    ? $this->available('chat.provider')
                    : [
                        'id' => 'chat.provider',
                        'state' => 'blocked',
                        'reason' => 'No healthy model profile is available for this operator.',
                        'evidence' => ['database:talos_model_profiles.user_id'],
                    ],
            ],
        );

        self::assertSame(
            'available',
            $manifest->forUser($this->user(7))['capabilities'][0]['state'],
        );
        self::assertSame(
            'blocked',
            $manifest->forUser($this->user(9))['capabilities'][0]['state'],
        );
    }

    /**
     * @param list<array<string, mixed>> $records
     */
    private function manifestWith(array $records): TalosProductCapabilityManifest
    {
        return new TalosProductCapabilityManifest(
            static fn (User $user): array => $records,
        );
    }

    /**
     * @return array{id:string,state:string,reason:null,evidence:list<string>}
     */
    private function available(string $id): array
    {
        return [
            'id' => $id,
            'state' => 'available',
            'reason' => null,
            'evidence' => ["contract:{$id}"],
        ];
    }

    private function user(int $id): User
    {
        $user = new User;
        $user->forceFill(['id' => $id]);

        return $user;
    }
}
