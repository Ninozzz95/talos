<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\TalosExternalAccount;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Throwable;

final class GoogleDriveService
{
    private const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

    /**
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function listFiles(TalosExternalAccount $account, array $filters = []): array
    {
        $query = [
            'fields' => 'nextPageToken,files(id,name,mimeType,modifiedTime,capabilities/canDownload,webViewLink,size)',
            'pageSize' => $this->pageSize($filters['page_size'] ?? null),
            'spaces' => 'drive',
            'q' => $this->driveQuery($filters['q'] ?? null),
        ];

        if (is_string($filters['page_token'] ?? null) && $filters['page_token'] !== '') {
            $query['pageToken'] = $filters['page_token'];
        }

        $response = Http::withToken($this->accessToken($account))
            ->acceptJson()
            ->get(self::DRIVE_FILES_URL, $query);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Drive file listing failed.');

            throw new GoogleDriveException(
                'GOOGLE_DRIVE_LIST_FAILED',
                'Google Drive file listing failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $files = is_array($payload['files'] ?? null) ? $payload['files'] : [];

        $account->forceFill([
            'last_used_at' => Carbon::now(),
            'last_error' => null,
        ])->save();

        return [
            'files' => array_values(array_map(
                fn (array $file): array => $this->fileSummary($file),
                $files,
            )),
            'next_page_token' => is_string($payload['nextPageToken'] ?? null) ? $payload['nextPageToken'] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function importableFile(TalosExternalAccount $account, string $fileId): array
    {
        $metadata = $this->fileMetadata($account, $fileId);
        if (($metadata['can_download'] ?? false) !== true) {
            throw new GoogleDriveException(
                'GOOGLE_DRIVE_FILE_NOT_DOWNLOADABLE',
                'Google Drive file cannot be downloaded by this account.',
                422,
            );
        }

        $contents = $this->downloadTextContents($account, $fileId, (string) $metadata['mime_type']);

        return [
            ...$metadata,
            'contents' => $contents['contents'],
            'mime_type' => $contents['mime_type'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function fileMetadata(TalosExternalAccount $account, string $fileId): array
    {
        $response = Http::withToken($this->accessToken($account))
            ->acceptJson()
            ->get($this->fileUrl($fileId), [
                'fields' => 'id,name,mimeType,modifiedTime,capabilities/canDownload,exportLinks,webViewLink,size',
            ]);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Drive file metadata lookup failed.');

            throw new GoogleDriveException(
                'GOOGLE_DRIVE_FILE_LOOKUP_FAILED',
                'Google Drive file metadata lookup failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();

        return $this->fileSummary($payload);
    }

    /**
     * @return array{contents: string, mime_type: string}
     */
    private function downloadTextContents(TalosExternalAccount $account, string $fileId, string $mimeType): array
    {
        if ($this->isWorkspaceMimeType($mimeType)) {
            $exportMimeType = $this->exportMimeType($mimeType);
            if ($exportMimeType === null) {
                throw new GoogleDriveException(
                    'GOOGLE_DRIVE_FILE_UNSUPPORTED',
                    'Google Drive file type cannot be imported as text.',
                    422,
                );
            }

            $response = Http::withToken($this->accessToken($account))
                ->get($this->fileUrl($fileId) . '/export', ['mimeType' => $exportMimeType]);

            if (! $response->successful()) {
                $this->markAccountError($account, 'Google Drive file export failed.');

                throw new GoogleDriveException(
                    'GOOGLE_DRIVE_EXPORT_FAILED',
                    'Google Drive file export failed.',
                    502,
                );
            }

            return [
                'contents' => $response->body(),
                'mime_type' => $exportMimeType,
            ];
        }

        if (! $this->isSupportedTextMimeType($mimeType)) {
            throw new GoogleDriveException(
                'GOOGLE_DRIVE_FILE_UNSUPPORTED',
                'Google Drive file type cannot be imported as text.',
                422,
            );
        }

        $response = Http::withToken($this->accessToken($account))
            ->get($this->fileUrl($fileId), ['alt' => 'media']);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Drive file download failed.');

            throw new GoogleDriveException(
                'GOOGLE_DRIVE_DOWNLOAD_FAILED',
                'Google Drive file download failed.',
                502,
            );
        }

        return [
            'contents' => $response->body(),
            'mime_type' => $mimeType,
        ];
    }

    private function accessToken(TalosExternalAccount $account): string
    {
        if (filled($account->encrypted_access_token)
            && (! $account->token_expires_at instanceof Carbon || $account->token_expires_at->isFuture())
        ) {
            return $this->decryptToken((string) $account->encrypted_access_token);
        }

        if (filled($account->encrypted_refresh_token)) {
            return $this->refreshAccessToken($account);
        }

        throw new GoogleDriveException(
            'GOOGLE_DRIVE_ACCOUNT_REAUTH_REQUIRED',
            'Google account must be reconnected before Drive files can be imported.',
            422,
        );
    }

    private function refreshAccessToken(TalosExternalAccount $account): string
    {
        $clientId = config('services.google.client_id');
        $clientSecret = config('services.google.client_secret');
        $tokenUri = config('services.google.token_uri');

        if (! is_string($clientId) || $clientId === ''
            || ! is_string($clientSecret) || $clientSecret === ''
            || ! is_string($tokenUri) || $tokenUri === ''
        ) {
            throw new GoogleDriveException(
                'GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED',
                'Google OAuth is not configured for Drive token refresh.',
                503,
            );
        }

        $response = Http::asForm()->post($tokenUri, [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $this->decryptToken((string) $account->encrypted_refresh_token),
        ]);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Drive token refresh failed.');

            throw new GoogleDriveException(
                'GOOGLE_DRIVE_TOKEN_REFRESH_FAILED',
                'Google Drive token refresh failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $accessToken = $payload['access_token'] ?? null;
        if (! is_string($accessToken) || $accessToken === '') {
            throw new GoogleDriveException(
                'GOOGLE_DRIVE_TOKEN_REFRESH_INVALID',
                'Google Drive token refresh did not return an access token.',
                502,
            );
        }

        $expiresIn = $payload['expires_in'] ?? null;
        $account->forceFill([
            'encrypted_access_token' => Crypt::encryptString($accessToken),
            'token_expires_at' => is_numeric($expiresIn) ? Carbon::now()->addSeconds((int) $expiresIn) : null,
            'last_error' => null,
        ])->save();

        return $accessToken;
    }

    /**
     * @param array<string, mixed> $file
     * @return array<string, mixed>
     */
    private function fileSummary(array $file): array
    {
        $capabilities = is_array($file['capabilities'] ?? null) ? $file['capabilities'] : [];

        return [
            'id' => is_string($file['id'] ?? null) ? $file['id'] : '',
            'name' => is_string($file['name'] ?? null) ? $file['name'] : 'Untitled',
            'mime_type' => is_string($file['mimeType'] ?? null) ? $file['mimeType'] : 'application/octet-stream',
            'modified_time' => is_string($file['modifiedTime'] ?? null) ? $file['modifiedTime'] : null,
            'can_download' => ($capabilities['canDownload'] ?? false) === true,
            'web_view_link' => is_string($file['webViewLink'] ?? null) ? $file['webViewLink'] : null,
            'size_bytes' => is_numeric($file['size'] ?? null) ? (int) $file['size'] : null,
        ];
    }

    private function decryptToken(string $encryptedToken): string
    {
        try {
            return Crypt::decryptString($encryptedToken);
        } catch (DecryptException $exception) {
            throw new GoogleDriveException(
                'GOOGLE_DRIVE_TOKEN_INVALID',
                'Stored Google Drive token could not be decrypted.',
                422,
                $exception,
            );
        }
    }

    private function markAccountError(TalosExternalAccount $account, string $message): void
    {
        $account->forceFill(['last_error' => $message])->save();
    }

    private function driveQuery(mixed $query): string
    {
        if (! is_string($query) || trim($query) === '') {
            return 'trashed = false';
        }

        return '(' . trim($query) . ') and trashed = false';
    }

    private function pageSize(mixed $pageSize): int
    {
        if (! is_numeric($pageSize)) {
            return 25;
        }

        return max(1, min(100, (int) $pageSize));
    }

    private function fileUrl(string $fileId): string
    {
        return self::DRIVE_FILES_URL . '/' . rawurlencode($fileId);
    }

    private function isWorkspaceMimeType(string $mimeType): bool
    {
        return str_starts_with($mimeType, 'application/vnd.google-apps.');
    }

    private function isSupportedTextMimeType(string $mimeType): bool
    {
        return str_starts_with($mimeType, 'text/')
            || in_array($mimeType, ['application/json', 'application/csv'], true);
    }

    private function exportMimeType(string $mimeType): ?string
    {
        return match ($mimeType) {
            'application/vnd.google-apps.document' => 'text/markdown',
            'application/vnd.google-apps.presentation',
            'application/vnd.google-apps.spreadsheet' => 'text/plain',
            default => null,
        };
    }
}
