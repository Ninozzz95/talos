<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserOwnerReference
{
    public static function forUser(int $userId): string
    {
        return "talos-user:{$userId}";
    }
}
