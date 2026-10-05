# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads the source of an app as text; a clean result is not a migration assessment and not a certification.
These notes say what the pages say so a reader can follow a finding back to its source; they are not advice on how to
move any one app. The pages were chosen with web addresses that hold no number that reads like a year.

## Azure App Service

### Overview of Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/overview

The landing page of App Service. It describes a platform that hosts web apps, mobile back ends and APIs on Windows or
Linux, for .NET and several other stacks, or as a custom container, without servers to manage, and that scales up or
out. A section on Managed Instance on App Service says it is meant for legacy Windows apps that need COM components,
registry access, installers, drive mapping or tighter network bounds, with install scripts, registry adapters that keep
secret values in Key Vault, and an MSMQ client among what it supports. `registry-access`, `com-interop`, `msmq` and
`isapi-extension` name Managed Instance as the way to keep such a dependency.

### Operating system functionality in Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality

The page on what a Windows app may do on the machine it runs on. File access: the HOME folder of an app maps to a
content share in Azure Storage that survives restarts and that every instance of the app sees; the local storage under
the system drive is temporary, does not survive a restart and is not shared between instances; paths should come from
the environment variables, not from a drive written into the code. Network access: an app makes outbound TCP and UDP
connections, and may listen on one local loopback socket of its own. Code: ASP.NET runs in full trust, and a framework
can call in-process COM components that Windows registers by default but not out-of-process ones. Logs: calls to the
Windows event logs and ETW may look as if they work, but the app has no access to that data. Registry: an app can read
much of the registry, not HKEY_CURRENT_USER, and every write is blocked. `local-disk-write`, `local-path-setting`,
`smtp-pickup-directory`, `registry-access`, `com-interop`, `event-log`, `non-standard-port` and `raw-socket` lean on
it.

### Authentication and authorization in Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization

The page on the built-in sign-in of App Service. A platform module, an IIS module in the same sandbox on Windows or a
separate container on Linux, handles each request before the app does: it signs users in with Microsoft Entra,
other social providers or any OpenID Connect provider, keeps the tokens and passes the identity to the app in headers,
with no change to the code. The page names no Windows integrated sign-in among the providers. `windows-authentication`
leans on it for what to use instead.

### Use Key Vault references as app settings in Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references

The page on Key Vault references. An app setting or a connection string of App Service can hold a reference of the
form @Microsoft.KeyVault(...) in place of the secret; the app reads it like any other setting, and App Service fetches
the secret with the managed identity of the app, which needs read access to the vault. The secret then stays out of the
configuration of the app. `hard-coded-secret` leans on it, and a value that is such a reference is not reported.

### Migrate .NET apps to Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/app-service-asp-net-migration

The page that lists the ways to assess and move .NET web apps to App Service: Azure Migrate at scale for apps on IIS
servers, a migration tool of App Service for one app, PowerShell scripts for one server, and Managed Instance for
apps that depend on Windows features. Its last section says some .NET Framework apps depend on components in the
Global Assembly Cache that App Service does not have, and that such apps can run in Windows containers. `gac-assembly`
leans on it.

### Review web apps for migration (Azure Migrate, Microsoft Learn)

https://learn.microsoft.com/en-us/azure/migrate/review-web-app-assessment

The Azure Migrate page on reading the assessment of web apps. Each app gets one of four states: Ready; Ready with
conditions, when it needs minor changes; Not ready, when it needs major or breaking changes; and Unknown, when the data
found was not enough. Each state comes with the issues or warnings behind it and the remediation. The older Azure
Migrate pages on the App Service assessment that were looked for first now lead to the start page of the Azure Migrate
documentation, so this page stands for them. The three verdicts of the tool (Ready, Ready with changes, Blockers) follow
this idea, and are the tool's own (docs/decisions); `custom-module-handler`, `isapi-extension`, `url-rewrite`,
`unreadable-file` and `scan-limit` lean on it.

### Configure ASP.NET apps for Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnet-framework

The page on running ASP.NET on .NET Framework. Windows instances have the supported .NET Framework versions installed:
CLR 4 for .NET Framework 4 and later, and CLR 2 for 3.5 and earlier, chosen with the netFrameworkVersion setting; an app
whose runtime is not supported can run in a custom container, and outdated runtimes are hidden from the portal. It
also says that an app setting or a connection string set in App Service takes the place of the one with the same name
in web.config, which keeps secrets out of the repository. `unsupported-framework` and `hard-coded-secret` lean on it.

### Configure ASP.NET Core apps for Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnetcore

The page on running ASP.NET Core. The version is set by the target framework in the project file on Windows, and by the
runtime of the app on Linux; outdated runtimes are hidden from the portal and may be removed from the platform after
notice to the owner of the subscription. App settings take the place of values of appsettings.json, with a colon or a
double underscore for nested keys. `unsupported-framework` leans on it.

### Run background tasks with WebJobs in Azure App Service (Microsoft Learn)

https://learn.microsoft.com/en-us/azure/app-service/webjobs-create

The page on WebJobs: a program or script that runs beside the web app, continuously or triggered by hand or on a
schedule, with Always On needed for reliable scheduled or continuous jobs. It points to Azure Functions as another way to
run such work. `background-work` leans on it.

## State

### Session-State Modes (ASP.NET, Microsoft Learn archive)

https://learn.microsoft.com/en-us/previous-versions/aspnet/ms178586(v=vs.100)

The archived ASP.NET page on where session state is kept. InProc, the default, keeps it in the memory of the web
server; StateServer keeps it in the ASP.NET state service, a separate process, and SQLServer in a SQL Server database,
both so that the state survives a restart and is shared by the servers of a web farm; Custom names a provider of its
own, and Off turns state off. The page on the ASP.NET session state provider for Azure Cache for Redis that was looked
for first now leads to the caching overview of ASP.NET Core below. `inproc-session-state` and `state-server-session`
lean on it.

### Session in ASP.NET Core (Microsoft Learn)

https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state

The ASP.NET Core page on keeping state between requests. With the in-memory store, state lives on the server of the
app; in a server farm it needs requests of one user kept on one instance, which App Service does by default with ARR
affinity, but the page says that this hurts scaling and updates, and that a Redis, SQL Server or Postgres distributed
cache needs no such affinity. `inproc-session-state` leans on it.

### Overview of caching in ASP.NET Core (Microsoft Learn)

https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview

The ASP.NET Core page on caching. A cache in memory suits one server, or several servers with requests kept on one of
them; in the cloud or a server farm, a distributed cache such as Redis or SQL Server is shared by all servers. The
fix of `inproc-session-state` leans on it.

## Formats

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The memo that describes CSV: each record on its own line, ended by CRLF, an optional header line first, fields
separated by commas, and a field that holds a comma, a double quote or a line break put in double quotes, with a
double quote inside it written twice. `--format csv` writes the findings this way, with CRLF line ends.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects says the names in an object should be unique and that programs behave in
different ways when they are not; the reader of the configuration refuses a repeated name instead of keeping one of the
values. Its section on encoding asks for UTF-8 between systems and lets a reader ignore a byte order mark; the
configuration is read as UTF-8 and a byte order mark is skipped.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

The page on formulas hidden in CSV files. A spreadsheet may treat a cell that starts with `=`, `+`, `-`, `@`, a tab or
a line break as a formula, and the page warns that no single way of escaping is safe in every program and for every
later reader. The CSV report of the tool puts a single quote in front of such a field, and docs/threat-model.md says
why that is a help and not a guarantee.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::notice`, `::warning` and `::error` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such command
per finding, info as a notice, and escapes the characters a command gives a meaning to.
