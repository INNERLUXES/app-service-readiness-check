# Harrowgate Libraries: an app in good order

A made-up library service moves its loans app, an ASP.NET Core app on .NET 8, to Azure App Service. It signs users in
with Microsoft Entra ID, keeps its state in Azure Cache for Redis, reads its storage key through a Key Vault reference,
writes receipts to the temporary folder, and lets App Service give the port. web.config holds only the handler of the
ASP.NET Core Module, and a write to a drive that was commented out is not read. The run passes with no finding and
the app is Ready.

```
node bin/app-service-readiness-check.js examples/clean
```
