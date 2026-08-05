<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityGrantScope: string
{
    case ONCE = 'once';
    case SESSION = 'session';
    case DEVICE = 'device';
    case ACCOUNT = 'account';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(
            static fn (self $scope): string => $scope->value,
            self::cases(),
        );
    }

    public function requiresScopeId(): bool
    {
        return $this === self::SESSION || $this === self::DEVICE;
    }
}
