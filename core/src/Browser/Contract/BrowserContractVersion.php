<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final class BrowserContractVersion
{
    public const TASK = 'talos.browser.task.v1';
    public const INTENT = 'talos.browser.intent.v1';
    public const ACTION = 'talos.browser.action.v1';
    public const ARTIFACT = 'talos.browser.artifact.v1';
    public const EVIDENCE = 'talos.browser.evidence.v1';
    public const CHECKPOINT = 'talos.browser.checkpoint.v1';
    public const CAPABILITIES = 'talos.browser.capabilities.v1';
    public const LEASE = 'talos.browser.lease.v1';
    public const WORKER_PROTOCOL = 'talos.browser.worker.v2';

    /** @return list<string> */
    public static function all(): array
    {
        return [
            self::TASK,
            self::INTENT,
            self::ACTION,
            self::ARTIFACT,
            self::EVIDENCE,
            self::CHECKPOINT,
            self::CAPABILITIES,
            self::LEASE,
        ];
    }
}
