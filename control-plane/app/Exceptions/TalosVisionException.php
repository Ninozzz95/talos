<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * Typed, user-safe refusal for the multimodal vision path. The controller maps
 * every one of these to a clean HTTP 422 (never a 500), so a refusal to send
 * image bytes to a provider is always a controlled, actionable outcome.
 *
 * Canonical codes:
 *   - TALOS_VISION_INTEGRITY        bytes do not match the recorded size/sha256
 *   - TALOS_VISION_IMAGE_TOO_LARGE  a single image exceeds the 10 MB per-image cap
 *   - TALOS_VISION_PAYLOAD_TOO_LARGE the aggregate exceeds the 20 MB budget
 *   - TALOS_VISION_IMAGE_UNSUPPORTED detected_mime not in the provider image set
 *   - TALOS_VISION_READ_FAILED       the stored bytes could not be read
 *
 * The message is always a safe human string — never file bytes, paths, or base64.
 */
final class TalosVisionException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $safeMessage,
    ) {
        parent::__construct($safeMessage);
    }
}
