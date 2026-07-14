<?php

declare(strict_types=1);

namespace Kadmos\Tool;

interface ToolApprovalAuthority
{
    public function authorizes(ToolApprovalGrant $grant): bool;
}
