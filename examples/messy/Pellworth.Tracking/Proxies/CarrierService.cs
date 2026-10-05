// A proxy class kept as it was produced from the carrier's service description. The exclude list of
// examples/config.json leaves this folder out of the scan.
using System.Net;
using System.Net.Sockets;

namespace Pellworth.Tracking.Proxies
{
    public class CarrierCallbackListener
    {
        private readonly TcpListener listener = new TcpListener(IPAddress.Any, 9100);
    }
}
