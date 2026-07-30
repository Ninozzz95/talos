<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapabilityRisk: string
{
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';
    case CRITICAL = 'critical';

    public function rank(): int
    {
        return match ($this) {
            self::LOW => 1,
            self::MEDIUM => 2,
            self::HIGH => 3,
            self::CRITICAL => 4,
        };
    }

    public function isHighOrCritical(): bool
    {
        return $this->rank() >= self::HIGH->rank();
    }
}
