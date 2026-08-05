<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityDecision: string
{
    case DENY = 'deny';
    case ASK = 'ask';
    case ALLOW = 'allow';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(
            static fn (self $decision): string => $decision->value,
            self::cases(),
        );
    }

    public function allows(): bool
    {
        return match ($this) {
            self::ALLOW => true,
            self::DENY, self::ASK => false,
        };
    }
}
