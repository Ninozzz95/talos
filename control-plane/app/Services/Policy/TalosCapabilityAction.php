<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityAction: string
{
    case READ = 'read';
    case WRITE = 'write';
    case OUTBOUND = 'outbound';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(
            static fn (self $action): string => $action->value,
            self::cases(),
        );
    }
}
