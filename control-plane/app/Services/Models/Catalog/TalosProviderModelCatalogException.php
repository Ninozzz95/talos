<?php

declare(strict_types=1);

namespace App\Services\Models\Catalog;

use RuntimeException;

/**
 * Typed, redaction-safe fault for provider model-catalog discovery.
 *
 * It carries only a stable code, a safe message, retry semantics and the
 * provider id. It never carries upstream body or credential material.
 */
final class TalosProviderModelCatalogException extends RuntimeException
{
    public const SECRET_MISSING = 'MODEL_CATALOG_SECRET_MISSING';
    public const AUTH_FAILED = 'MODEL_CATALOG_AUTH_FAILED';
    public const RATE_LIMITED = 'MODEL_CATALOG_RATE_LIMITED';
    public const POLICY_BLOCKED = 'MODEL_CATALOG_POLICY_BLOCKED';
    public const CONNECTION_FAILED = 'MODEL_CATALOG_CONNECTION_FAILED';
    public const CONNECTED_IP_MISMATCH = 'MODEL_CATALOG_CONNECTED_IP_MISMATCH';
    public const REDIRECT_BLOCKED = 'MODEL_CATALOG_REDIRECT_BLOCKED';
    public const RESPONSE_TOO_LARGE = 'MODEL_CATALOG_RESPONSE_TOO_LARGE';
    public const RESPONSE_INVALID = 'MODEL_CATALOG_RESPONSE_INVALID';
    public const PAGINATION_INVALID = 'MODEL_CATALOG_PAGINATION_INVALID';
    public const LIMIT_EXCEEDED = 'MODEL_CATALOG_LIMIT_EXCEEDED';

    public function __construct(
        private readonly string $faultCode,
        string $message,
        private readonly int $httpStatus,
        private readonly bool $retryable,
        private readonly ?int $retryAfterSeconds,
        private readonly string $provider,
    ) {
        parent::__construct($message);
    }

    public static function secretMissing(string $provider): self
    {
        return new self(self::SECRET_MISSING, 'The provider credential is required to discover models.', 422, false, null, $provider);
    }

    public static function authFailed(string $provider): self
    {
        return new self(self::AUTH_FAILED, 'The provider rejected the credential during model discovery.', 401, false, null, $provider);
    }

    public static function rateLimited(string $provider, ?int $retryAfterSeconds): self
    {
        return new self(self::RATE_LIMITED, 'The provider rate-limited model discovery.', 429, true, $retryAfterSeconds, $provider);
    }

    public static function policyBlocked(string $provider, string $message): self
    {
        return new self(self::POLICY_BLOCKED, $message, 422, false, null, $provider);
    }

    public static function connectionFailed(string $provider): self
    {
        return new self(self::CONNECTION_FAILED, 'The provider connection failed during model discovery.', 502, true, null, $provider);
    }

    public static function connectedIpMismatch(string $provider): self
    {
        return new self(self::CONNECTED_IP_MISMATCH, 'The provider connection did not use an approved IP address.', 502, false, null, $provider);
    }

    public static function redirectBlocked(string $provider): self
    {
        return new self(self::REDIRECT_BLOCKED, 'The provider issued a blocked redirect during model discovery.', 502, false, null, $provider);
    }

    public static function responseTooLarge(string $provider): self
    {
        return new self(self::RESPONSE_TOO_LARGE, 'The provider response exceeded the model-catalog size bound.', 502, false, null, $provider);
    }

    public static function responseInvalid(string $provider, string $message = 'The provider returned an unrecognized model-catalog response.'): self
    {
        return new self(self::RESPONSE_INVALID, $message, 502, false, null, $provider);
    }

    public static function paginationInvalid(string $provider): self
    {
        return new self(self::PAGINATION_INVALID, 'The provider returned an invalid pagination cursor during model discovery.', 502, false, null, $provider);
    }

    public static function limitExceeded(string $provider): self
    {
        return new self(self::LIMIT_EXCEEDED, 'Model discovery exceeded the allowed page or model bound.', 502, false, null, $provider);
    }

    public function faultCode(): string
    {
        return $this->faultCode;
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }

    public function retryable(): bool
    {
        return $this->retryable;
    }

    public function retryAfterSeconds(): ?int
    {
        return $this->retryAfterSeconds;
    }

    public function provider(): string
    {
        return $this->provider;
    }

    /**
     * @return array{code: string, message: string, retryable: bool, retry_after_seconds: ?int, provider: string}
     */
    public function toApiArray(): array
    {
        return [
            'code' => $this->faultCode,
            'message' => $this->getMessage(),
            'retryable' => $this->retryable,
            'retry_after_seconds' => $this->retryAfterSeconds,
            'provider' => $this->provider,
        ];
    }
}
