<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function authenticateTalosUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        return $user;
    }
}
