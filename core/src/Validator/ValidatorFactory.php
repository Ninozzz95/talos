<?php

declare(strict_types=1);

namespace Kadmos\Validator;

use Kadmos\CurlHttpClient;
use Kadmos\HttpClientInterface;

final class ValidatorFactory
{
    public function __construct(
        private ?ValidatorHealthCheck $healthCheck = null,
        private ?HttpClientInterface $http = null,
        private ?string $validatorUrl = null,
    ) {}

    public static function fromEnvironment(): self
    {
        $healthUrl = getenv('KADMOS_VALIDATOR_HEALTH_URL') ?: 'http://127.0.0.1:3000/health';
        $validatorUrl = getenv('KADMOS_VALIDATOR_URL') ?: 'http://127.0.0.1:3000/validate';

        return new self(
            healthCheck: new ValidatorHealthCheck($healthUrl),
            validatorUrl: $validatorUrl,
        );
    }

    public function create(bool $mock = false): JmpValidatorInterface
    {
        if ($mock) {
            return new MockJmpValidator(true);
        }

        $healthCheck = $this->healthCheck ?? new ValidatorHealthCheck();
        if (!$healthCheck->isHealthy()) {
            throw new \RuntimeException('Validator unavailable. AVM ON fails closed. Start validator or use --mock.');
        }

        return new HttpJmpValidator(
            $this->http ?? new CurlHttpClient(),
            $this->validatorUrl ?? 'http://127.0.0.1:3000/validate',
        );
    }
}

