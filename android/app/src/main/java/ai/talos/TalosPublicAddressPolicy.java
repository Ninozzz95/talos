package ai.talos;

import java.net.InetAddress;

/**
 * IANA special-purpose address boundary for arbitrary model-selected page
 * reads. Search-provider endpoints are an explicit user configuration and do
 * not use this policy.
 */
final class TalosPublicAddressPolicy {

    private TalosPublicAddressPolicy() {}

    static boolean isPublic(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) return isPublicIpv4(bytes);
        if (bytes.length != 16) return false;

        if (isIpv4Mapped(bytes)) {
            return isPublicIpv4(lastIpv4(bytes));
        }
        if (isWellKnownNat64(bytes)) {
            return isPublicIpv4(lastIpv4(bytes));
        }

        // Current globally routed IPv6 unicast is 2000::/3. Explicit special
        // ranges inside it are rejected below.
        int first = unsigned(bytes[0]);
        if (first < 0x20 || first > 0x3f) return false;

        // 2001:0000::/23: special assignments (Teredo, benchmarking, ORCHID,
        // AMT and other non-general-purpose ranges).
        if (
            first == 0x20
            && unsigned(bytes[1]) == 0x01
            && (unsigned(bytes[2]) & 0xfe) == 0
        ) return false;

        // Documentation and transition ranges.
        if (
            first == 0x20
            && unsigned(bytes[1]) == 0x01
            && unsigned(bytes[2]) == 0x0d
            && unsigned(bytes[3]) == 0xb8
        ) return false;
        if (first == 0x20 && unsigned(bytes[1]) == 0x02) return false;
        if (
            first == 0x3f
            && unsigned(bytes[1]) == 0xff
            && (unsigned(bytes[2]) & 0xf0) == 0
        ) return false;

        return true;
    }

    private static boolean isPublicIpv4(byte[] bytes) {
        int a = unsigned(bytes[0]);
        int b = unsigned(bytes[1]);
        int c = unsigned(bytes[2]);

        if (a == 0 || a == 10 || a == 127 || a >= 224) return false;
        if (a == 100 && b >= 64 && b <= 127) return false;
        if (a == 169 && b == 254) return false;
        if (a == 172 && b >= 16 && b <= 31) return false;
        if (a == 192) {
            if (b == 0 || b == 2 || b == 168) return false;
            if (b == 31 && c == 196) return false;
            if (b == 52 && c == 193) return false;
            if (b == 88 && c == 99) return false;
            if (b == 175 && c == 48) return false;
        }
        if (a == 198 && (b == 18 || b == 19)) return false;
        if (a == 198 && b == 51 && c == 100) return false;
        if (a == 203 && b == 0 && c == 113) return false;
        return true;
    }

    private static boolean isIpv4Mapped(byte[] bytes) {
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) return false;
        }
        return unsigned(bytes[10]) == 0xff && unsigned(bytes[11]) == 0xff;
    }

    private static boolean isWellKnownNat64(byte[] bytes) {
        if (
            unsigned(bytes[0]) != 0x00
            || unsigned(bytes[1]) != 0x64
            || unsigned(bytes[2]) != 0xff
            || unsigned(bytes[3]) != 0x9b
        ) return false;
        for (int index = 4; index < 12; index++) {
            if (bytes[index] != 0) return false;
        }
        return true;
    }

    private static byte[] lastIpv4(byte[] bytes) {
        return new byte[] { bytes[12], bytes[13], bytes[14], bytes[15] };
    }

    private static int unsigned(byte value) {
        return value & 0xff;
    }
}

