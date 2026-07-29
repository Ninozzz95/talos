<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosFile;
use App\Support\TalosStoragePathBoundary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\HeaderUtils;

final class TalosFileContentController extends Controller
{
    /** @var list<string> */
    private const INLINE_IMAGE_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    public function __invoke(Request $request, TalosFile $file): BinaryFileResponse|JsonResponse
    {
        if ($request->user()?->id !== $file->user_id
            || $file->status !== 'available'
            || $file->scan_status !== 'clean'
            || $file->storage_disk !== 'local'
            || ! is_string($file->storage_path)
            || trim($file->storage_path) === '') {
            abort(404);
        }

        $disk = Storage::disk('local');
        $absolutePath = $disk->path($file->storage_path);
        $realPath = realpath($absolutePath);
        $realRoot = realpath($disk->path(''));
        if (! is_string($realPath)
            || ! is_string($realRoot)
            || ! is_file($realPath)
            || ! TalosStoragePathBoundary::contains($realRoot, $realPath)) {
            return $this->integrityFault();
        }

        clearstatcache(true, $realPath);
        $size = filesize($realPath);
        $checksum = hash_file('sha256', $realPath);
        if (! is_int($size)
            || $size !== (int) $file->size_bytes
            || ! is_string($checksum)
            || ! hash_equals((string) $file->checksum, $checksum)) {
            return $this->integrityFault();
        }

        $mime = is_string($file->detected_mime) && trim($file->detected_mime) !== ''
            ? trim($file->detected_mime)
            : 'application/octet-stream';
        $disposition = in_array($mime, self::INLINE_IMAGE_MIMES, true)
            ? HeaderUtils::DISPOSITION_INLINE
            : HeaderUtils::DISPOSITION_ATTACHMENT;
        $filename = $this->safeDisplayFilename((string) $file->original_name, (string) $file->id);
        $fallback = $this->asciiFilenameFallback($filename, (string) $file->id);

        $response = response()->file($realPath, [
            'Content-Type' => $mime,
            'Content-Disposition' => HeaderUtils::makeDisposition($disposition, $filename, $fallback),
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $response->headers->set('Cache-Control', 'private, no-cache, must-revalidate');
        $response->setEtag('sha256-'.$checksum);
        $response->isNotModified($request);

        return $response;
    }

    private function integrityFault(): JsonResponse
    {
        return response()->json([
            'code' => 'TALOS_FILE_CONTENT_INTEGRITY',
            'message' => 'The file bytes are unavailable or no longer match their verified record.',
            'details' => [],
        ], 409);
    }

    private function safeDisplayFilename(string $name, string $fileId): string
    {
        $basename = trim(basename(str_replace('\\', '/', $name)));

        return $basename !== '' && ! in_array($basename, ['.', '..'], true)
            ? $basename
            : 'talos-file-'.$fileId;
    }

    private function asciiFilenameFallback(string $filename, string $fileId): string
    {
        $fallback = preg_replace('/[^A-Za-z0-9._ -]/', '_', Str::ascii($filename));
        $fallback = is_string($fallback) ? trim(str_replace('%', '_', $fallback)) : '';

        return $fallback !== '' && ! in_array($fallback, ['.', '..'], true)
            ? $fallback
            : 'talos-file-'.$fileId;
    }
}
