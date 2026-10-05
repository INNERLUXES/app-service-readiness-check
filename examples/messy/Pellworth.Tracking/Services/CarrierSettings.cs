using System;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Pellworth.Tracking.Services
{
    public static class CarrierSettings
    {
        [DllImport("PellworthScale.dll", CharSet = CharSet.Unicode)]
        private static extern int ReadDockScale(int dock);

        public static string DefaultCarrier()
        {
            using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Pellworth\Tracking"))
            {
                return key == null ? "PWF-GROUND" : (string)key.GetValue("DefaultCarrier");
            }
        }

        public static int DockWeight(int dock)
        {
            return ReadDockScale(dock);
        }
    }
}
