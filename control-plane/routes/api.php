<?php

declare(strict_types=1);

use App\Http\Controllers\FileIngestionController;
use Illuminate\Support\Facades\Route;

Route::post('/files/ingest', FileIngestionController::class);
