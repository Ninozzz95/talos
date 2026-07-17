<?php

declare(strict_types=1);

namespace App\Services\Talos\FileAuthority;

use App\Models\TalosAuditEvent;
use App\Models\TalosFile;
use App\Models\TalosFileAuthorityGrant;
use App\Models\TalosSession;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

final class TalosFileAuthorityService
{
    /** @var list<string> */
    public const SCOPES = ['file', 'folder', 'session', 'global'];

    /** @var list<string> */
    public const PERMISSIONS = ['model.read', 'browser.upload'];

    /** @return Collection<int, TalosFileAuthorityGrant> */
    public function listForUser(int $userId, ?string $sessionId = null): Collection
    {
        $this->expireActiveGrants($userId);

        return TalosFileAuthorityGrant::query()
            ->ownedBy($userId)
            ->when($sessionId !== null, static fn ($query) => $query->where(static function ($scope) use ($sessionId): void {
                $scope->whereNull('talos_session_id')->orWhere('talos_session_id', $sessionId);
            }))
            ->with('files')
            ->latest('created_at')
            ->get();
    }

    /**
     * @param array{scope: string, label?: string|null, permissions: list<string>, file_ids?: list<string>, session_id?: string|null, warning_acknowledged?: bool, expires_at?: string|null} $input
     */
    public function create(int $userId, array $input): TalosFileAuthorityGrant
    {
        $scope = (string) ($input['scope'] ?? '');
        $permissions = array_values(array_unique($input['permissions'] ?? []));
        $fileIds = array_values(array_unique($input['file_ids'] ?? []));
        $sessionId = is_string($input['session_id'] ?? null) ? $input['session_id'] : null;

        $this->assertContract($userId, $scope, $permissions, $fileIds, $sessionId, (bool) ($input['warning_acknowledged'] ?? false));
        $files = $this->ownedAvailableFiles($userId, $fileIds);
        $expiresAt = $this->expiresAt($input['expires_at'] ?? null);
        $label = trim((string) ($input['label'] ?? ''));
        if ($label === '') {
            $label = match ($scope) {
                'file' => (string) $files->first()?->original_name,
                'folder' => 'Selected folder',
                'session' => 'Chat session files',
                'global' => 'All Vault files',
                default => 'File authority',
            };
        }

        return DB::transaction(function () use ($userId, $scope, $permissions, $files, $sessionId, $expiresAt, $label): TalosFileAuthorityGrant {
            $grant = TalosFileAuthorityGrant::query()->create([
                'user_id' => $userId,
                'talos_session_id' => $scope === 'session' ? $sessionId : null,
                'scope' => $scope,
                'label' => mb_substr($label, 0, 255),
                'permissions' => $permissions,
                'status' => 'active',
                'expires_at' => $expiresAt,
            ]);
            foreach ($files as $file) {
                $grant->files()->attach((string) $file->id, [
                    'checksum_snapshot' => (string) $file->checksum,
                ]);
            }
            TalosAuditEvent::record('file_authority.grant_created', 'file_authority_grant', (string) $grant->id, [
                'scope' => $scope,
                'permissions' => $permissions,
                'file_ids' => $files->modelKeys(),
                'talos_session_id' => $grant->talos_session_id,
                'expires_at' => $expiresAt?->toISOString(),
            ], 'user', (string) $userId);

            return $grant->load('files');
        }, 3);
    }

    public function revoke(int $userId, string $grantId): TalosFileAuthorityGrant
    {
        return DB::transaction(function () use ($userId, $grantId): TalosFileAuthorityGrant {
            $grant = TalosFileAuthorityGrant::query()->ownedBy($userId)->whereKey($grantId)->lockForUpdate()->first();
            if (! $grant instanceof TalosFileAuthorityGrant) {
                throw new TalosFileAuthorityException('TALOS_FILE_GRANT_NOT_FOUND', 'File authority grant was not found.', 'grant_id', 404);
            }
            if ($grant->status === 'active') {
                $grant->forceFill(['status' => 'revoked', 'revoked_at' => now()])->save();
                TalosAuditEvent::record('file_authority.grant_revoked', 'file_authority_grant', (string) $grant->id, [
                    'scope' => $grant->scope,
                    'talos_session_id' => $grant->talos_session_id,
                ], 'user', (string) $userId);
            }

            return $grant->load('files');
        }, 3);
    }

    /**
     * @param list<string> $fileIds
     * @param list<string> $grantIds
     * @return Collection<int, TalosFile>
     */
    public function authorizeFiles(
        int $userId,
        array $fileIds,
        array $grantIds,
        string $permission,
        ?string $sessionId = null,
    ): Collection {
        $fileIds = array_values(array_unique($fileIds));
        $grantIds = array_values(array_unique($grantIds));
        if ($fileIds === [] || $grantIds === [] || ! in_array($permission, self::PERMISSIONS, true)) {
            throw new TalosFileAuthorityException('TALOS_FILE_AUTHORITY_REQUIRED', 'An active file authority grant is required.', 'attachment_grant_ids');
        }
        $this->expireActiveGrants($userId);
        $files = $this->ownedAvailableFiles($userId, $fileIds);
        $grants = TalosFileAuthorityGrant::query()
            ->ownedBy($userId)
            ->whereIn('id', $grantIds)
            ->where('status', 'active')
            ->with('files')
            ->get();
        if ($grants->count() !== count($grantIds)) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_INACTIVE', 'One or more file authority grants are missing, expired or revoked.', 'attachment_grant_ids');
        }

        $usedGrantIds = [];
        foreach ($files as $file) {
            $authorized = false;
            foreach ($grants as $grant) {
                if (! in_array($permission, is_array($grant->permissions) ? $grant->permissions : [], true)) {
                    continue;
                }
                if ($grant->scope === 'session' && ($sessionId === null || ! hash_equals((string) $grant->talos_session_id, $sessionId))) {
                    continue;
                }
                if ($grant->scope === 'global') {
                    $authorized = true;
                    $usedGrantIds[(string) $grant->id] = true;
                    break;
                }
                $grantedFile = $grant->files->firstWhere('id', $file->id);
                $snapshot = $grantedFile?->pivot?->checksum_snapshot;
                if ($grantedFile instanceof TalosFile && is_string($snapshot) && hash_equals((string) $file->checksum, $snapshot)) {
                    $authorized = true;
                    $usedGrantIds[(string) $grant->id] = true;
                    break;
                }
            }
            if (! $authorized) {
                throw new TalosFileAuthorityException('TALOS_FILE_AUTHORITY_DENIED', 'The selected grant does not authorize every requested file in this session.', 'attachment_grant_ids');
            }
        }

        TalosFileAuthorityGrant::query()->whereIn('id', array_keys($usedGrantIds))->update(['last_used_at' => now()]);
        TalosAuditEvent::record('file_authority.grant_used', 'file_authority_grant', implode(',', array_keys($usedGrantIds)), [
            'permission' => $permission,
            'file_ids' => $fileIds,
            'talos_session_id' => $sessionId,
        ], 'user', (string) $userId);

        $byId = $files->keyBy('id');

        return new Collection(array_map(static fn (string $fileId): TalosFile => $byId->get($fileId), $fileIds));
    }

    /** @param list<string> $fileIds @return list<string> */
    public function activeGrantIdsForFiles(int $userId, array $fileIds, string $permission, ?string $sessionId = null): array
    {
        $fileIds = array_values(array_unique($fileIds));
        if ($fileIds === [] || ! in_array($permission, self::PERMISSIONS, true)) {
            throw new TalosFileAuthorityException('TALOS_FILE_AUTHORITY_REQUIRED', 'An active file authority grant is required.', 'attachment_grant_ids');
        }
        $this->expireActiveGrants($userId);
        $grants = TalosFileAuthorityGrant::query()->ownedBy($userId)->where('status', 'active')->with('files')->get();
        $candidates = $grants->filter(static function (TalosFileAuthorityGrant $grant) use ($permission, $sessionId): bool {
            if (! in_array($permission, is_array($grant->permissions) ? $grant->permissions : [], true)) {
                return false;
            }

            return $grant->scope !== 'session' || ($sessionId !== null && hash_equals((string) $grant->talos_session_id, $sessionId));
        })->values();
        if ($candidates->isEmpty()) {
            throw new TalosFileAuthorityException('TALOS_FILE_AUTHORITY_REQUIRED', 'An active file authority grant is required.', 'attachment_grant_ids');
        }
        $files = $this->ownedAvailableFiles($userId, $fileIds);
        $usedGrantIds = [];
        foreach ($files as $file) {
            $matching = $candidates->first(static function (TalosFileAuthorityGrant $grant) use ($file): bool {
                if ($grant->scope === 'global') {
                    return true;
                }
                $grantedFile = $grant->files->firstWhere('id', $file->id);
                $snapshot = $grantedFile?->pivot?->checksum_snapshot;

                return $grantedFile instanceof TalosFile
                    && is_string($snapshot)
                    && hash_equals((string) $file->checksum, $snapshot);
            });
            if (! $matching instanceof TalosFileAuthorityGrant) {
                throw new TalosFileAuthorityException(
                    'TALOS_FILE_AUTHORITY_DENIED',
                    'The selected grant does not authorize every requested file in this session.',
                    'attachment_grant_ids',
                );
            }
            $usedGrantIds[(string) $matching->id] = true;
        }

        return array_keys($usedGrantIds);
    }

    /** @param list<string> $permissions @param list<string> $fileIds */
    private function assertContract(int $userId, string $scope, array $permissions, array $fileIds, ?string $sessionId, bool $warningAcknowledged): void
    {
        if (! in_array($scope, self::SCOPES, true)) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SCOPE_INVALID', 'File authority scope is invalid.', 'scope');
        }
        if ($permissions === [] || count(array_diff($permissions, self::PERMISSIONS)) > 0) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_PERMISSION_INVALID', 'File authority permissions are invalid.', 'permissions');
        }
        if ($scope === 'file' && count($fileIds) !== 1) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SHAPE_INVALID', 'A per-file grant requires exactly one available file.', 'file_ids');
        }
        if (in_array($scope, ['folder', 'session'], true) && ($fileIds === [] || count($fileIds) > 64)) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SHAPE_INVALID', 'This grant requires between 1 and 64 available files.', 'file_ids');
        }
        if ($scope === 'global' && $fileIds !== []) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SHAPE_INVALID', 'A global Vault grant cannot carry a fixed file list.', 'file_ids');
        }
        if ($scope === 'global' && ! $warningAcknowledged) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_WARNING_REQUIRED', 'A global Vault grant requires explicit warning acknowledgement.', 'warning_acknowledged');
        }
        if ($scope === 'session') {
            $owned = $sessionId !== null && TalosSession::query()->whereKey($sessionId)->where('user_id', $userId)->exists();
            if (! $owned) {
                throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SESSION_INVALID', 'A session grant requires an owned TALOS chat session.', 'session_id');
            }
        } elseif ($sessionId !== null) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_SESSION_INVALID', 'Only a session-scoped grant may specify a session.', 'session_id');
        }
    }

    /** @param list<string> $fileIds @return Collection<int, TalosFile> */
    private function ownedAvailableFiles(int $userId, array $fileIds): Collection
    {
        if ($fileIds === []) {
            return new Collection();
        }
        $files = TalosFile::query()->where('user_id', $userId)->where('status', 'available')->whereIn('id', $fileIds)->get();
        if ($files->count() !== count($fileIds)) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_FILE_INVALID', 'File grants can only reference owned files in available status.', 'file_ids');
        }

        return $files;
    }

    private function expiresAt(mixed $value): ?CarbonImmutable
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            $expiresAt = CarbonImmutable::parse((string) $value);
        } catch (\Throwable) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_EXPIRY_INVALID', 'Grant expiry must be a valid future timestamp.', 'expires_at');
        }
        if (! $expiresAt->isFuture() || $expiresAt->greaterThan(now()->addYear())) {
            throw new TalosFileAuthorityException('TALOS_FILE_GRANT_EXPIRY_INVALID', 'Grant expiry must be within the next year.', 'expires_at');
        }

        return $expiresAt;
    }

    private function expireActiveGrants(int $userId): void
    {
        TalosFileAuthorityGrant::query()
            ->ownedBy($userId)
            ->where('status', 'active')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);
    }
}
