<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\TalosPublicSuffixList;
use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Tests\TestCase;

final class TalosPublicSuffixListTest extends TestCase
{
    #[Test]
    public function bundled_data_matches_the_exact_pinned_commit_and_hash(): void
    {
        $path = resource_path('talos/public_suffix_list.dat');
        $provenance = json_decode(
            (string) file_get_contents(resource_path('talos/public_suffix_list.provenance.json')),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertFileExists($path);
        $this->assertSame('6.4.0', TalosPublicSuffixList::PACKAGE_VERSION);
        $this->assertSame('9b5c814414374aa19a93dc6dd7e47c01909524cc', TalosPublicSuffixList::DATA_COMMIT);
        $this->assertSame(TalosPublicSuffixList::DATA_COMMIT, $provenance['commit'] ?? null);
        $this->assertSame(TalosPublicSuffixList::DATA_SHA256, $provenance['sha256'] ?? null);
        $this->assertSame(TalosPublicSuffixList::DATA_SHA256, hash_file('sha256', $path));
    }

    #[Test]
    public function it_resolves_icann_private_wildcard_and_exception_rules(): void
    {
        $rules = new TalosPublicSuffixList;

        $uk = $rules->resolve('www.example.co.uk');
        $private = $rules->resolve('tenant.blogspot.com');
        $exception = $rules->resolve('www.city.kawasaki.jp');

        $this->assertSame(['co.uk', 'example.co.uk'], [$uk->suffix, $uk->registrableDomain]);
        $this->assertSame(['blogspot.com', 'tenant.blogspot.com'], [$private->suffix, $private->registrableDomain]);
        $this->assertSame(['kawasaki.jp', 'city.kawasaki.jp'], [$exception->suffix, $exception->registrableDomain]);
    }

    #[Test]
    public function ip_and_single_label_hosts_have_no_registrable_domain(): void
    {
        $rules = new TalosPublicSuffixList;

        $ip = $rules->resolve('93.184.216.34');
        $single = $rules->resolve('localhost');

        $this->assertTrue($ip->isIp);
        $this->assertNull($ip->suffix);
        $this->assertNull($ip->registrableDomain);
        $this->assertFalse($single->isIp);
        $this->assertNull($single->suffix);
        $this->assertNull($single->registrableDomain);
    }

    #[Test]
    public function modified_psl_bytes_fail_closed(): void
    {
        $temporary = tempnam(sys_get_temp_dir(), 'talos-psl-');
        $this->assertIsString($temporary);
        copy(resource_path('talos/public_suffix_list.dat'), $temporary);
        file_put_contents($temporary, "\n// tampered\n", FILE_APPEND);

        try {
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('integrity');
            new TalosPublicSuffixList($temporary);
        } finally {
            @unlink($temporary);
        }
    }
}
