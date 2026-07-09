<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosExternalAccount;
use App\Services\FileIngestion\FileIngestionService;
use App\Services\Google\GoogleDriveException;
use App\Services\Google\GoogleDriveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TalosGoogleDriveController extends Controller
{
    public function files(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
            'q' => ['nullable', 'string', 'max:500'],
            'page_token' => ['nullable', 'string', 'max:500'],
            'page_size' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $account = $this->connectedGoogleAccount((string) $validated['account_id']);
        $drive = app(GoogleDriveService::class);

        try {
            /** @var array<string, mixed> $files */
            $files = $drive->listFiles($account, [
                'q' => $validated['q'] ?? null,
                'page_token' => $validated['page_token'] ?? null,
                'page_size' => $validated['page_size'] ?? null,
            ]);
        } catch (GoogleDriveException $exception) {
            return $this->driveError($exception);
        }

        return response()->json(['data' => $files]);
    }

    public function import(Request $request, FileIngestionService $ingestion): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
            'file_id' => ['required', 'string', 'max:500'],
        ]);

        $account = $this->connectedGoogleAccount((string) $validated['account_id']);
        $drive = app(GoogleDriveService::class);

        try {
            /** @var array<string, mixed> $driveFile */
            $driveFile = $drive->importableFile($account, (string) $validated['file_id']);
        } catch (GoogleDriveException $exception) {
            return $this->driveError($exception);
        }

        if (($driveFile['can_download'] ?? false) !== true) {
            return response()->json([
                'code' => 'GOOGLE_DRIVE_FILE_NOT_DOWNLOADABLE',
                'message' => 'Google Drive file cannot be downloaded by this account.',
            ], 422);
        }

        $contents = $driveFile['contents'] ?? null;
        if (! is_string($contents)) {
            return response()->json([
                'code' => 'GOOGLE_DRIVE_IMPORT_INVALID_RESPONSE',
                'message' => 'Google Drive import did not return text content.',
            ], 502);
        }

        $originalName = $driveFile['name'] ?? $validated['file_id'];
        $mimeType = $driveFile['mime_type'] ?? 'text/plain';

        $result = $ingestion->ingestString(
            $contents,
            is_string($originalName) && $originalName !== '' ? $originalName : (string) $validated['file_id'],
            is_string($mimeType) && $mimeType !== '' ? $mimeType : 'text/plain',
            [
                'source_provider' => 'google_drive',
                'trust_level' => 'untrusted',
                'google_drive_file_id' => (string) ($driveFile['id'] ?? $validated['file_id']),
                'google_drive_modified_time' => is_string($driveFile['modified_time'] ?? null)
                    ? $driveFile['modified_time']
                    : null,
                'google_drive_account_id' => $account->id,
                'google_drive_account_email' => $account->email,
                'imported_at' => now()->toJSON(),
            ],
        );

        TalosAuditEvent::record('google.drive.file_imported', 'file', (string) ($result['id'] ?? ''), [
            'account_id' => $account->id,
            'file_id' => $driveFile['id'] ?? $validated['file_id'],
            'original_name' => $result['original_name'] ?? null,
            'status' => $result['status'] ?? null,
            'mime_type' => $result['mime_type'] ?? null,
            'size_bytes' => $result['size_bytes'] ?? null,
            'checksum' => $result['checksum'] ?? $result['sha256'] ?? null,
        ]);

        if (($result['status'] ?? null) === 'failed') {
            return response()->json([
                'message' => $result['failure_reason'] ?? 'Google Drive file could not be parsed for Context Vault ingestion.',
                'data' => $result,
            ], 422);
        }

        return response()->json(['data' => $result], 201);
    }

    private function connectedGoogleAccount(string $accountId): TalosExternalAccount
    {
        $account = TalosExternalAccount::query()
            ->whereKey($accountId)
            ->where('provider', 'google')
            ->where('status', 'connected')
            ->first();

        if (! $account instanceof TalosExternalAccount) {
            throw ValidationException::withMessages([
                'account_id' => 'Connected Google account not found.',
            ]);
        }

        return $account;
    }

    private function driveError(GoogleDriveException $exception): JsonResponse
    {
        return response()->json([
            'code' => $exception->codeName(),
            'message' => $exception->getMessage(),
        ], $exception->httpStatus());
    }
}
