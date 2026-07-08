<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Admin\TalosAdminGate;
use App\Services\Admin\TalosDoctorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosAdminDoctorController extends Controller
{
    public function __invoke(Request $request, TalosAdminGate $gate, TalosDoctorService $doctor): JsonResponse
    {
        $gate->require($request, 'talos.doctor.read');

        return response()->json($doctor->report());
    }
}
