<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\TalosBrowserOwnerReference;
use PHPUnit\Framework\TestCase;

final class TalosBrowserOwnerReferenceTest extends TestCase
{
    public function test_user_owner_reference_has_one_canonical_worker_format(): void
    {
        $this->assertSame('talos-user:42', TalosBrowserOwnerReference::forUser(42));
    }
}
