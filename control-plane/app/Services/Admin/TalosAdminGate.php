<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\TalosApiToken;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

final class TalosAdminGate
{
    /**
     * @return list<string>
     */
    public static function capabilities(): array
    {
        return [
            'talos.doctor.read',
            'talos.audit.read',
            'talos.policy.read',
            'talos.backup.read',
            'talos.backup.restore',
            'talos.shell.preview',
            'talos.shell.exec',
            'talos.admin.all',
        ];
    }

    public function require(Request $request, string $scope): TalosApiToken
    {
        $plainToken = trim((string) $request->header('X-Talos-Api-Token', ''));

        if ($plainToken === '') {
            $this->deny(['error' => 'TALOS_ADMIN_TOKEN_REQUIRED']);
        }

        $token = TalosApiToken::findForPlainToken($plainToken);
        if (! $token instanceof TalosApiToken || $token->is_disabled) {
            $this->deny(['error' => 'TALOS_ADMIN_TOKEN_INVALID']);
        }

        if ($token->isExpired()) {
            $this->deny(['error' => 'TALOS_TOKEN_EXPIRED']);
        }

        if (! $token->hasScope($scope)) {
            $this->deny([
                'error' => 'TALOS_SCOPE_DENIED',
                'required_scope' => $scope,
            ]);
        }

        $token->forceFill(['last_used_at' => now()])->save();

        return $token;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function deny(array $payload): never
    {
        throw new HttpResponseException(response()->json($payload, 403));
    }
}
