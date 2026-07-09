<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_model_routing_profiles', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('task_type')->default('chat');
            $table->string('status')->default('enabled');
            $table->json('lanes');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
            $table->index(['user_id', 'task_type']);
            $table->index(['status', 'updated_at']);
        });

        Schema::table('talos_runs', function (Blueprint $table): void {
            $table->string('model_routing_profile_id')->nullable()->after('model_profile_id');

            $table->foreign('model_routing_profile_id')
                ->references('id')
                ->on('talos_model_routing_profiles')
                ->nullOnDelete();

            $table->index('model_routing_profile_id');
        });
    }

    public function down(): void
    {
        Schema::table('talos_runs', function (Blueprint $table): void {
            $table->dropForeign(['model_routing_profile_id']);
            $table->dropIndex(['model_routing_profile_id']);
            $table->dropColumn('model_routing_profile_id');
        });

        Schema::dropIfExists('talos_model_routing_profiles');
    }
};
