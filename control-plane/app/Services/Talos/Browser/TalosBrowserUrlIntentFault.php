<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final readonly class TalosBrowserUrlIntentFault
{
    public function __construct(
        public string $raw,
        public int $startByte,
        public int $endByte,
        public string $code,
        public string $message,
    ) {}

    /** @return array{raw: string, start_byte: int, end_byte: int, code: string, message: string} */
    public function toSafeArray(): array
    {
        return [
            'raw' => $this->raw,
            'start_byte' => $this->startByte,
            'end_byte' => $this->endByte,
            'code' => $this->code,
            'message' => $this->message,
        ];
    }
}
