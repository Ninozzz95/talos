package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;
import org.junit.Test;

public class TalosPublicAddressPolicyTest {

    private static boolean allowed(String address) throws Exception {
        return TalosPublicAddressPolicy.isPublic(InetAddress.getByName(address));
    }

    @Test
    public void acceptsRepresentativeGlobalAddressesAndPublicNat64() throws Exception {
        assertTrue(allowed("8.8.8.8"));
        assertTrue(allowed("93.184.216.34"));
        assertTrue(allowed("2606:4700:4700::1111"));
        assertTrue(allowed("64:ff9b::0808:0808"));
    }

    @Test
    public void rejectsIpv4LocalPrivateSpecialAndMetadataRanges() throws Exception {
        for (String address : new String[] {
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.0.0.1",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "240.0.0.1",
            "255.255.255.255",
        }) {
            assertFalse(address, allowed(address));
        }
    }

    @Test
    public void rejectsIpv6LocalPrivateSpecialAndEmbeddedPrivateRanges() throws Exception {
        for (String address : new String[] {
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "::ffff:192.168.1.1",
            "64:ff9b::c0a8:0101",
            "64:ff9b:1::1",
            "100::1",
            "2001:db8::1",
            "2002:7f00:1::1",
            "3fff::1",
            "5f00::1",
            "fc00::1",
            "fe80::1",
            "ff00::1",
        }) {
            assertFalse(address, allowed(address));
        }
    }
}

