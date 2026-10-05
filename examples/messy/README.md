# Pellworth Freight: two apps before the move

A made-up freight company plans to rehost two web apps from its own IIS servers to Azure App Service. The source
folder holds both, the way the team keeps them, and each holds what a migration team looks for before a rehost.

`Pellworth.Tracking` is the shipment tracking site, an ASP.NET Web Forms app on .NET Framework 4.0:

- web.config signs users in with Windows authentication and impersonation, holds a database password and a storage
  account key, keeps state InProc, sends mail to a pickup folder, compiles against a barcode assembly that comes from
  the Global Assembly Cache, adds an HTTP module of its own, maps a handler to an ISAPI extension, has a URL Rewrite
  rule and points two settings at local drives;
- the project file targets v4.0, references System.Messaging and a COM component;
- the code writes exports to `C:\` and to a share, saves uploads under `Server.MapPath`, reads the registry, calls a
  native scale driver, prints labels through COM, sends to an MSMQ queue, writes to the event log and queues
  background work.

`Pellworth.Rates.Api` is a small ASP.NET Core API on .NET 7, which `../config.json` allows. It binds port 5080 in the
code and ports 5080 and 5443 in appsettings.json, keeps its state in a memory cache and runs a hosted service.

It also holds what must not be reported: a password set from a placeholder (`#{CarrierPortalPassword}#`,
`#{TariffsPassword}#`), a connection string with integrated security, a setting and a call that were commented out,
a VB `REM` line, a write to the temporary folder, framework assemblies and a package in web.config, a handler of type
`System.Web.Handlers.TransferRequestHandler`, a proxy class in `Proxies/` that `../config.json` leaves out, and build
output in `obj/`, which is never read.

```
node bin/app-service-readiness-check.js examples/messy --config examples/config.json
```
