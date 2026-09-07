<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityDecision: string
{
    case DENY = 'deny';
    case ASK = 'ask';
    case ALLOW_FOR_SESSION = 'allow_for_session';
    case ALLOW_UNTIL_REVOKED = 'allow_until_revoked';

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
            self::ALLOW_FOR_SESSION, self::ALLOW_UNTIL_REVOKED => true,
            self::DENY, self::ASK => false,
        };
    }

    public function requiresSession(): bool
    {
        return $this === self::ALLOW_FOR_SESSION;
    }

    public function persistent(): bool
    {
        return $this === self::ALLOW_UNTIL_REVOKED;
    }
}
