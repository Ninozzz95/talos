<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

final readonly class TalosToolArgumentValidationFault
{
    public string $code;

    public function __construct(
        public string $providerCallId,
        public string $toolName,
        public string $path,
        public string $keyword,
        public string $message,
    ) {
        $this->code = 'TALOS_TOOL_ARGUMENTS_INVALID';
    }

    /** @return array{code: string, provider_call_id: string, tool_name: string, path: string, keyword: string, message: string} */
    public function toSafeArray(): array
    {
        return [
            'code' => $this->code,
            'provider_call_id' => $this->providerCallId,
            'tool_name' => $this->toolName,
            'path' => $this->path,
            'keyword' => $this->keyword,
            'message' => $this->message,
        ];
    }

    public function providerMessage(): string
    {
        return sprintf(
            'Arguments for %s are invalid at %s (%s): %s Correct the arguments and issue a new tool call.',
            $this->toolName,
            $this->path,
            $this->keyword,
            $this->message,
        );
    }
}
