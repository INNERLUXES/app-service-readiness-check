using System;
using System.IO;
using System.Threading;
using System.Web;

namespace Pellworth.Tracking.Services
{
    public static class ManifestExporter
    {
        public static void ExportOpenManifests(CancellationToken token)
        {
            var folder = "C:\\Pellworth\\Exports\\";
            var name = "open-" + Guid.NewGuid().ToString("N") + ".csv";
            File.WriteAllText(folder + name, BuildCsv());

            // File.WriteAllText(@"E:\old-exports\open.csv", BuildCsv());
            File.Copy(folder + name, @"\\fs01\manifests\archive\" + name, true);
        }

        public static void SaveProofOfDelivery(HttpPostedFile upload, string shipmentId)
        {
            upload.SaveAs(HttpContext.Current.Server.MapPath("~/App_Data/pod/" + shipmentId + ".jpg"));
        }

        public static string WriteScratchCopy(string csv)
        {
            var path = Path.Combine(Path.GetTempPath(), "manifest-scratch.csv");
            File.WriteAllText(path, csv);
            return path;
        }

        private static string BuildCsv()
        {
            return "shipment,carrier,status\n";
        }
    }
}
