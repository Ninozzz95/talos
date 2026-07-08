<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;

final class TalosFirstRunService
{
    public function hasUsers(): bool
    {
        return User::query()->exists();
    }

    public function setupRequired(): bool
    {
        $this->bootstrapAdminFromEnvironment();

        return ! $this->hasUsers();
    }

    public function bootstrapAdminFromEnvironment(): ?User
    {
        if ($this->hasUsers()) {
            return null;
        }

        $email = $this->envString('TALOS_ADMIN_EMAIL');
        $password = $this->envString('TALOS_ADMIN_PASSWORD');

        if ($email === null || $password === null) {
            return null;
        }

        return User::query()->create([
            'name' => $this->envString('TALOS_ADMIN_NAME') ?? 'TALOS Admin',
            'email' => $email,
            'password' => $password,
        ]);
    }

    private function envString(string $key): ?string
    {
        $value = env($key);

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : null;
    }
}
