using System;
using System.Diagnostics;
using System.Web;
using System.Web.Hosting;

namespace Pellworth.Tracking
{
    public class Global : HttpApplication
    {
        protected void Application_Start(object sender, EventArgs e)
        {
            if (!EventLog.SourceExists("Pellworth Tracking"))
            {
                EventLog.CreateEventSource("Pellworth Tracking", "Application");
            }
            HostingEnvironment.QueueBackgroundWorkItem(token => Services.ManifestExporter.ExportOpenManifests(token));
        }

        protected void Application_Error(object sender, EventArgs e)
        {
            EventLog.WriteEntry("Pellworth Tracking", Server.GetLastError().ToString(), EventLogEntryType.Error);
        }
    }
}
