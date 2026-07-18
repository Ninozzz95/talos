<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use App\Exceptions\TalosFilePolicyException;
use finfo;
use ZipArchive;

final class TalosUploadPolicy
{
    /** @var array<string, string> */
    private const OOXML_MIME = [
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    /** @var array<string, string> */
    private const OOXML_ENTRY = [
        'docx' => 'word/document.xml',
        'xlsx' => 'xl/workbook.xml',
        'pptx' => 'ppt/presentation.xml',
    ];

    /** @var list<string> */
    private const ZIP_MIME = [
        'application/zip',
        'application/x-zip',
        'application/x-zip-compressed',
        'application/octet-stream',
    ];

    /** @var array<string, string> */
    private const IMAGE_MIME = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
    ];

    /** @var list<string> */
    private const DANGEROUS_INTERMEDIATE_EXTENSIONS = [
        'bat', 'cmd', 'com', 'dll', 'exe', 'htm', 'html', 'jar', 'js', 'msi',
        'phar', 'php', 'phtml', 'ps1', 'scr', 'sh', 'svg', 'vbs',
    ];

    public function inspect(
        string $absolutePath,
        string $clientName,
        ?string $clientMime,
        int $size,
    ): TalosUploadDecision {
        $this->assertReadableFile($absolutePath, $size);
        $extension = $this->validateName($clientName);
        $rawDetectedMime = $this->detectMime($absolutePath);

        if (array_key_exists($extension, self::OOXML_MIME)) {
            $this->assertOoxml($absolutePath, $extension, $rawDetectedMime);
            $detectedMime = self::OOXML_MIME[$extension];
        } elseif (array_key_exists($extension, self::IMAGE_MIME)) {
            $detectedMime = $this->assertImageType($absolutePath, $extension, $rawDetectedMime);
        } else {
            $detectedMime = $this->assertSimpleType($absolutePath, $extension, $rawDetectedMime);
        }

        return new TalosUploadDecision(
            detectedMime: $detectedMime,
            canonicalExtension: $extension,
            evidence: [
                'client_mime' => $clientMime,
                'finfo_mime' => $rawDetectedMime,
                'extension' => $extension,
                'size_bytes' => $size,
                'signature_checked' => true,
                'archive_checked' => array_key_exists($extension, self::OOXML_MIME),
            ],
        );
    }

    private function assertReadableFile(string $path, int $declaredSize): void
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new TalosFilePolicyException('TALOS_FILE_UNREADABLE', 'The uploaded file could not be inspected safely.');
        }

        $actualSize = filesize($path);
        if (! is_int($actualSize) || $actualSize !== $declaredSize) {
            throw new TalosFilePolicyException('TALOS_FILE_SIZE_MISMATCH', 'The uploaded file changed while it was being inspected.');
        }

        if ($actualSize <= 0) {
            throw new TalosFilePolicyException('TALOS_FILE_EMPTY', 'The uploaded file is empty.');
        }

        if ($actualSize > $this->positiveConfigInt('talos-files.max_upload_bytes')) {
            throw new TalosFilePolicyException('TALOS_FILE_TOO_LARGE', 'The uploaded file exceeds the configured size limit.');
        }
    }

    private function validateName(string $name): string
    {
        if ($name === '' || strlen($name) > $this->positiveConfigInt('talos-files.max_original_name_bytes')) {
            throw new TalosFilePolicyException('TALOS_FILE_NAME_INVALID', 'The uploaded filename is invalid.');
        }

        if (preg_match('/[\x00-\x1F\x7F\\\\\/]/', $name) === 1
            || str_starts_with($name, '.')
            || str_ends_with($name, '.')
            || str_contains($name, '..')
        ) {
            throw new TalosFilePolicyException('TALOS_FILE_NAME_INVALID', 'The uploaded filename is invalid.');
        }

        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        $allowed = config('talos-files.allowed_extensions', []);
        if (! is_array($allowed) || $allowed === []) {
            throw new TalosFilePolicyException('TALOS_FILE_POLICY_INVALID', 'The file policy is not configured correctly.');
        }
        $allowed = array_values(array_map(static fn (mixed $value): string => strtolower((string) $value), $allowed));
        $segments = array_map('strtolower', explode('.', $name));
        array_pop($segments);

        if (array_intersect($segments, self::DANGEROUS_INTERMEDIATE_EXTENSIONS) !== []) {
            throw new TalosFilePolicyException('TALOS_FILE_NAME_AMBIGUOUS', 'The uploaded filename contains an ambiguous extension.');
        }

        if (! in_array($extension, $allowed, true)) {
            if (array_intersect($segments, $allowed) !== []) {
                throw new TalosFilePolicyException('TALOS_FILE_NAME_AMBIGUOUS', 'The uploaded filename contains an ambiguous extension.');
            }

            throw new TalosFilePolicyException(
                'TALOS_FILE_EXTENSION_UNSUPPORTED',
                'The file field must be a file of type: txt, md, json, csv, pdf, docx, xlsx, pptx, png, jpg, jpeg, webp.',
            );
        }

        return $extension;
    }

    private function detectMime(string $path): string
    {
        $detected = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (! is_string($detected) || trim($detected) === '') {
            throw new TalosFilePolicyException('TALOS_FILE_TYPE_UNDETECTABLE', 'The uploaded file type could not be verified.');
        }

        return strtolower(trim(explode(';', $detected, 2)[0]));
    }

    private function assertSimpleType(string $path, string $extension, string $detectedMime): string
    {
        if ($extension === 'pdf') {
            if ($detectedMime !== 'application/pdf' || ! $this->hasPdfSignature($path)) {
                throw new TalosFilePolicyException('TALOS_FILE_TYPE_MISMATCH', 'The uploaded file content does not match its extension.');
            }

            return 'application/pdf';
        }

        $acceptedTextMimes = ['text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'application/csv', 'application/json'];
        if (! in_array($detectedMime, $acceptedTextMimes, true) || $this->containsNullByte($path)) {
            throw new TalosFilePolicyException('TALOS_FILE_TYPE_MISMATCH', 'The uploaded file content does not match its extension.');
        }

        return match ($extension) {
            'json' => 'application/json',
            'csv' => 'text/csv',
            'md' => 'text/markdown',
            default => 'text/plain',
        };
    }

    private function assertImageType(string $path, string $extension, string $detectedMime): string
    {
        $expectedMime = self::IMAGE_MIME[$extension];
        if ($detectedMime !== $expectedMime || ! $this->hasImageSignature($path, $expectedMime)) {
            throw new TalosFilePolicyException('TALOS_FILE_TYPE_MISMATCH', 'The uploaded file content does not match its extension.');
        }

        return $expectedMime;
    }

    private function hasImageSignature(string $path, string $mimeType): bool
    {
        $bytes = file_get_contents($path);
        if (! is_string($bytes)) {
            return false;
        }

        return match ($mimeType) {
            'image/png' => str_starts_with($bytes, "\x89PNG\r\n\x1a\n"),
            'image/jpeg' => strlen($bytes) >= 4
                && str_starts_with($bytes, "\xff\xd8\xff")
                && str_ends_with($bytes, "\xff\xd9"),
            'image/webp' => $this->hasWebpSignature($bytes),
            default => false,
        };
    }

    private function hasWebpSignature(string $bytes): bool
    {
        if (strlen($bytes) < 12 || substr($bytes, 0, 4) !== 'RIFF' || substr($bytes, 8, 4) !== 'WEBP') {
            return false;
        }
        $length = unpack('Vsize', substr($bytes, 4, 4));

        return is_array($length) && ($length['size'] ?? -1) === strlen($bytes) - 8;
    }

    private function hasPdfSignature(string $path): bool
    {
        $handle = fopen($path, 'rb');
        if (! is_resource($handle)) {
            return false;
        }

        try {
            $header = fread($handle, 5);
            $size = filesize($path);
            if (! is_int($size)) {
                return false;
            }
            fseek($handle, max(0, $size - 2048));
            $tail = stream_get_contents($handle);

            return $header === '%PDF-' && is_string($tail) && str_contains($tail, '%%EOF');
        } finally {
            fclose($handle);
        }
    }

    private function containsNullByte(string $path): bool
    {
        $handle = fopen($path, 'rb');
        if (! is_resource($handle)) {
            return true;
        }

        try {
            while (! feof($handle)) {
                $chunk = fread($handle, 65_536);
                if ($chunk === false || str_contains($chunk, "\0")) {
                    return true;
                }
            }

            return false;
        } finally {
            fclose($handle);
        }
    }

    private function assertOoxml(string $path, string $extension, string $detectedMime): void
    {
        if (! in_array($detectedMime, [...self::ZIP_MIME, ...array_values(self::OOXML_MIME)], true)) {
            throw new TalosFilePolicyException('TALOS_FILE_TYPE_MISMATCH', 'The uploaded file content does not match its extension.');
        }

        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::RDONLY | ZipArchive::CHECKCONS) !== true) {
            throw new TalosFilePolicyException('TALOS_FILE_OOXML_INVALID', 'The uploaded Office document is not a valid package.');
        }

        try {
            $this->inspectArchiveEntries($zip);

            $contentTypes = $zip->getFromName('[Content_Types].xml', 65_536);
            if (! is_string($contentTypes) || ! str_contains($contentTypes, '<Types') || $zip->locateName('_rels/.rels') === false) {
                throw new TalosFilePolicyException('TALOS_FILE_OOXML_INVALID', 'The uploaded Office document is missing required package metadata.');
            }

            if ($zip->locateName(self::OOXML_ENTRY[$extension]) === false) {
                $otherFamilies = array_diff(array_values(self::OOXML_ENTRY), [self::OOXML_ENTRY[$extension]]);
                foreach ($otherFamilies as $entry) {
                    if ($zip->locateName($entry) !== false) {
                        throw new TalosFilePolicyException('TALOS_FILE_OOXML_FAMILY_MISMATCH', 'The Office document family does not match its extension.');
                    }
                }

                throw new TalosFilePolicyException('TALOS_FILE_OOXML_INVALID', 'The uploaded Office document is missing its primary document part.');
            }
        } finally {
            $zip->close();
        }
    }

    private function inspectArchiveEntries(ZipArchive $zip): void
    {
        $maxEntries = $this->positiveConfigInt('talos-files.archive.max_entries');
        if ($zip->numFiles > $maxEntries) {
            throw new TalosFilePolicyException('TALOS_FILE_ARCHIVE_ENTRY_LIMIT', 'The Office document contains too many archive entries.');
        }

        $maxEntryBytes = $this->positiveConfigInt('talos-files.archive.max_entry_bytes');
        $maxExpandedBytes = $this->positiveConfigInt('talos-files.archive.max_expanded_bytes');
        $maxRatio = $this->positiveConfigInt('talos-files.archive.max_compression_ratio');
        $expandedBytes = 0;

        for ($index = 0; $index < $zip->numFiles; $index++) {
            $stat = $zip->statIndex($index, ZipArchive::FL_UNCHANGED);
            if (! is_array($stat)) {
                throw new TalosFilePolicyException('TALOS_FILE_OOXML_INVALID', 'The Office document archive could not be inspected.');
            }

            $name = (string) ($stat['name'] ?? '');
            if ($this->archivePathIsUnsafe($name)) {
                throw new TalosFilePolicyException('TALOS_FILE_ARCHIVE_PATH_INVALID', 'The Office document contains an unsafe archive path.');
            }

            $size = (int) ($stat['size'] ?? -1);
            $compressedSize = (int) ($stat['comp_size'] ?? -1);
            if ($size < 0 || $compressedSize < 0) {
                throw new TalosFilePolicyException('TALOS_FILE_OOXML_INVALID', 'The Office document archive contains invalid size metadata.');
            }
            if ($size > $maxEntryBytes) {
                throw new TalosFilePolicyException('TALOS_FILE_ARCHIVE_ENTRY_TOO_LARGE', 'An Office document entry exceeds the configured expansion limit.');
            }

            $expandedBytes += $size;
            if ($expandedBytes > $maxExpandedBytes) {
                throw new TalosFilePolicyException('TALOS_FILE_ARCHIVE_EXPANDED_LIMIT', 'The Office document exceeds the configured expanded-size limit.');
            }

            if ($size > 0 && ($compressedSize === 0 || ($size / max(1, $compressedSize)) > $maxRatio)) {
                throw new TalosFilePolicyException('TALOS_FILE_ARCHIVE_RATIO_LIMIT', 'The Office document exceeds the configured compression-ratio limit.');
            }
        }
    }

    private function archivePathIsUnsafe(string $name): bool
    {
        $normalized = str_replace('\\', '/', $name);
        $segments = explode('/', $normalized);

        return $normalized === ''
            || str_starts_with($normalized, '/')
            || preg_match('/^[A-Za-z]:/', $normalized) === 1
            || str_contains($normalized, "\0")
            || in_array('..', $segments, true);
    }

    private function positiveConfigInt(string $key): int
    {
        $value = config($key);
        if (! is_int($value) || $value <= 0) {
            throw new TalosFilePolicyException('TALOS_FILE_POLICY_INVALID', 'The file policy is not configured correctly.');
        }

        return $value;
    }
}
