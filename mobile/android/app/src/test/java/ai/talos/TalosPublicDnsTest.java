package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.Dns;
import org.junit.Test;

public class TalosPublicDnsTest {

    @Test
    public void returnsTheExactValidatedPublicAnswerSet() throws Exception {
        List<InetAddress> expected = Arrays.asList(
            InetAddress.getByName("93.184.216.34"),
            InetAddress.getByName("2606:4700:4700::1111")
        );
        TalosPublicDns dns = new TalosPublicDns(hostname -> expected);

        assertEquals(expected, dns.lookup("example.org"));
    }

    @Test
    public void rejectsPrivateAndMixedAnswersAsAWhole() throws Exception {
        for (List<InetAddress> answer : Arrays.asList(
            Collections.singletonList(InetAddress.getByName("127.0.0.1")),
            Arrays.asList(InetAddress.getByName("93.184.216.34"), InetAddress.getByName("192.168.1.1"))
        )) {
            TalosPublicDns dns = new TalosPublicDns(hostname -> answer);
            try {
                dns.lookup("example.org");
                fail("private DNS answer must fail closed");
            } catch (UnknownHostException expected) {
                assertEquals("TALOS_WEB_ADDRESS_NOT_PUBLIC", expected.getMessage());
            }
        }
    }

    @Test
    public void rejectsARebindingAnswerOnTheLookupThatChanged() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        Dns changing = hostname -> Collections.singletonList(
            InetAddress.getByName(calls.getAndIncrement() == 0 ? "93.184.216.34" : "127.0.0.1")
        );
        TalosPublicDns dns = new TalosPublicDns(changing);

        assertEquals("93.184.216.34", dns.lookup("rebind.example").get(0).getHostAddress());
        try {
            dns.lookup("rebind.example");
            fail("second private resolution must not reuse the first decision");
        } catch (UnknownHostException expected) {
            assertEquals("TALOS_WEB_ADDRESS_NOT_PUBLIC", expected.getMessage());
        }
    }
}

