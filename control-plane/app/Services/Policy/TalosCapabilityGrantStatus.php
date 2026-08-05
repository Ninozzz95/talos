<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityGrantStatus: string
{
    case ACTIVE = 'active';
    case CONSUMED = 'consumed';
    case EXPIRED = 'expired';
    case REVOKED = 'revoked';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(
            static fn (self $status): string => $status->value,
            self::cases(),
        );
    }
}
