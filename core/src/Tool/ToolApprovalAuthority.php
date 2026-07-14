<?php

declare(strict_types=1);

namespace Kadmos\Tool;

interface ToolApprovalAuthority
{
    public function authorizes(ToolApprovalGrant $grant): bool;

    /**
     * Atomically claims this grant for one execution attempt.
     * Implementations backed by shared persistence must return false after the first successful claim.
     */
    public function claimForExecution(ToolApprovalGrant $grant): bool;
}
