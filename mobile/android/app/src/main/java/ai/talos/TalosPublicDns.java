package ai.talos;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import okhttp3.Dns;

/**
 * The validation happens inside the DNS implementation used by OkHttp. The
 * exact validated addresses are returned to the connector, avoiding a
 * separate preflight lookup that could be rebound before connection.
 */
final class TalosPublicDns implements Dns {

    private final Dns delegate;

    TalosPublicDns(Dns delegate) {
        this.delegate = delegate;
    }

    @Override
    public List<InetAddress> lookup(String hostname) throws UnknownHostException {
        List<InetAddress> addresses = delegate.lookup(hostname);
        if (addresses == null || addresses.isEmpty()) {
            throw new UnknownHostException("TALOS_WEB_ADDRESS_NOT_FOUND");
        }
        for (InetAddress address : addresses) {
            if (!TalosPublicAddressPolicy.isPublic(address)) {
                throw new UnknownHostException("TALOS_WEB_ADDRESS_NOT_PUBLIC");
            }
        }
        return Collections.unmodifiableList(new ArrayList<>(addresses));
    }
}

