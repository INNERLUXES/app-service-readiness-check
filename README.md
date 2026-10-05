# app-service-readiness-check

Azure App Service readiness check for the source of ASP.NET and ASP.NET Core web apps. Give it the source folder of
one app or of a whole solution, and it lists what may block or complicate a move to App Service, the way a migration
team checks an app before a rehost: secrets written in web.config or appsettings.json, registry use, COM and native
calls, target frameworks that are not on the list App Service offers, writes to `C:\` and other local paths, assemblies
that only the Global Assembly Cache provides, Windows authentication, mail dropped into a pickup folder, MSMQ, the
Windows event log, state kept in the memory of one instance, ports other than 80 and 443, listening sockets, Windows
services and background work, custom HTTP modules, ISAPI and URL Rewrite rules. Every finding has its file and line and
what to change, every app gets a verdict (Ready, Ready with changes or Blockers), and the run exits with a code a
pipeline can act on.

**It is a heuristic check before the move, not a migration assessment and not a certification.** It reads the files as
text, with fixed patterns, and runs, builds and evaluates none of it; a finding is a lead to look at, and a clean run
means only that none of the patterns matched.

Microsoft Learn describes what an app may do on App Service: local storage that does not survive a restart and is not
shared between instances, a registry it can read but never write, in-process COM only, no access to the Windows event
logs, and one loopback socket at most
(https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality). Secrets belong in app settings
or Key Vault references (https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references), and an
Azure Migrate assessment rates each web app Ready, Ready with conditions, Not ready or Unknown
(https://learn.microsoft.com/en-us/azure/migrate/review-web-app-assessment). This tool reads the source for the
patterns behind those limits, on every change, before anyone runs an assessment.

- **One check per pattern.** Nineteen rules, each with what it looks at, what it cannot see, the public pages it rests
  on and what to change on App Service, and two rules of input problems that are always errors.
- **Apps and verdicts.** Every folder with a project file is an app, with its target frameworks, its counts by level
  and a verdict from the levels of its findings.
- **Secrets stay masked.** A password, account key or shared access key is named by its key; its value never reaches a
  report, in any format.
- **Comments are not code.** Each language is read by a small reader that knows its strings, so a line commented out is
  never reported and a `//` inside a string is never taken for a comment.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network; the same folder always gives the same report.

```
npm test
```

```
tests 124
pass 120
fail 0
skipped 4
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (links inside the folder to a file, out of the folder and back to it, a
folder and a configuration named through a link, `/dev/zero` named as an input, and a file and a folder with no read
access); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line.
`npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/app-service-readiness-check.git
cd app-service-readiness-check
node bin/app-service-readiness-check.js examples/messy --config examples/config.json
```

Or without a clone, on your own source:

```
npx --yes github:INNERLUXES/app-service-readiness-check src --exclude "**/Migrations/**"
```

`examples/` holds two made-up source folders. `examples/messy/` is a freight company with two apps. Its tracking site,
an ASP.NET app on .NET Framework 4.0, signs users in with Windows authentication and impersonation, holds a database
password and a storage key in web.config, keeps state InProc, drops mail into a pickup folder, compiles against an
assembly from the Global Assembly Cache, adds a module of its own, maps a handler to an ISAPI extension, has a URL
Rewrite rule, writes exports to `C:\` and a share, reads the registry, calls a native driver and COM, sends to MSMQ,
writes to the event log and queues background work. Its rates API, an ASP.NET Core app on .NET 7 that
`examples/config.json` allows, binds port 5080, keeps state in a memory cache and runs a hosted service. It also holds
what must not be reported: placeholders for passwords, lines that were commented out, a temporary file, a platform
handler, framework assemblies, a proxy folder the configuration leaves out and build output in `obj`.
`examples/clean/` is the loans app of a library service on .NET 8, in good order.

## Usage

```
app-service-readiness-check <folder> [--config <file>] [--exclude <glob>]... [options]
```

```
--config <file>           settings in strict JSON: rules, allowedFrameworks, knownAssemblies, exclude, minSeverity
                          and failOn (--print-defaults shows them)
--exclude <glob>          leave out the files and folders that match; may be given more than once; * and ? within
                          a name, ** across folders, a glob with no slash matches a name at any depth
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

One folder per run. The paths in the report are relative to the folder you run the command in, with forward slashes
on every system, followed by the line.

The report of the messy example starts with what was read, the configuration, the rules, the apps and the findings in
one line each; then every app with its framework, counts and verdict; then the count of findings of every rule; then
the findings, errors first, each with what to change:

```
app-service-readiness-check: examples/messy
input: folder examples/messy; 12 files of the kinds read: 1 web.config, 1 appsettings, 2 project, 1 packages.config, 1 Global.asax, 5 C#, 1 VB; read as UTF-8 12; 1 folder skipped (obj); 1 excluded; 0 links not followed; 1 other file passed over
config: examples/config.json (Pellworth readiness review): frameworks offered net20, net30, net35, net462, net47, net471, net472, net48, net481, net8.0, net9.0, net10.0 and net7.0 (1 from allowedFrameworks); exclude Proxies; minimum severity info; fail on error
rules: hard-coded-secret (error); registry-access (error); com-interop (error); unsupported-framework (error); local-disk-write (warning); gac-assembly (warning); windows-authentication (warning); smtp-pickup-directory (warning); msmq (warning); event-log (warning); inproc-session-state (warning); non-standard-port (warning); raw-socket (warning); background-work (info); custom-module-handler (info); isapi-extension (info); url-rewrite (info); state-server-session (info); local-path-setting (warning); unreadable-file (error); scan-limit (error)
apps: 2 (0 Ready, 1 Ready with changes, 1 Blockers)
findings: 34 (7 error, 20 warning, 7 info)

Apps (2)

  app                  folder                              framework     error  warning  info  verdict
  Pellworth.Rates.Api  examples/messy/Pellworth.Rates.Api  net7.0        0      3        2     Ready with changes
  Pellworth.Tracking   examples/messy/Pellworth.Tracking   v4.0 (net40)  7      17       5     Blockers

Rules (21)

  rule                    level    findings
  hard-coded-secret       error    2
  registry-access         error    1
  com-interop             error    3
  unsupported-framework   error    1
  local-disk-write        warning  3
  gac-assembly            warning  1
  windows-authentication  warning  2
  smtp-pickup-directory   warning  1
  msmq                    warning  4
  event-log               warning  3
  inproc-session-state    warning  2
  non-standard-port       warning  2
  raw-socket              warning  0
  background-work         info     3
  custom-module-handler   info     2
  isapi-extension         info     1
  url-rewrite             info     1
  state-server-session    info     0
  local-path-setting      warning  2
  unreadable-file         error    0
  scan-limit              error    0

Findings (34)

  ERROR    unsupported-framework   examples/messy/Pellworth.Tracking/Pellworth.Tracking.csproj:8
           the app targets v4.0 (net40), .NET Framework, which is not on the list of frameworks the tool takes as offered by App Service (net20, net30, net35, net462 and 9 more)
           fix: retarget the app to a framework App Service offers, run it in a custom container, or, once you have checked that App Service runs it, add it to allowedFrameworks

  ERROR    com-interop             examples/messy/Pellworth.Tracking/Pellworth.Tracking.csproj:19
           the project references the COM component "PellworthLabelPrint"
           fix: replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container

  ERROR    com-interop             examples/messy/Pellworth.Tracking/Services/CarrierSettings.cs:9
           the code calls COM or native code through "DllImport"
           fix: replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container

  ERROR    registry-access         examples/messy/Pellworth.Tracking/Services/CarrierSettings.cs:14
           the code uses the Windows registry through "Registry.LocalMachine"
           fix: move the values into app settings or Azure App Configuration; if the app must keep the registry, consider Managed Instance on App Service or a Windows container

  ERROR    com-interop             examples/messy/Pellworth.Tracking/Services/LabelPrinter.vb:9
           the code calls COM or native code through "CreateObject("
           fix: replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container

  ERROR    hard-coded-secret       examples/messy/Pellworth.Tracking/Web.config:4
           the connection string "TrackingDb" holds Password= with a secret written in the file; the value is masked
           fix: move the value into an App Service app setting or connection string, best as a Key Vault reference read with a managed identity, and change the secret, since it was in the repository

  ERROR    hard-coded-secret       examples/messy/Pellworth.Tracking/Web.config:9
           the setting "ProofOfDeliveryStorage" holds AccountKey= with a secret written in the file; the value is masked
           fix: move the value into an App Service app setting or connection string, best as a Key Vault reference read with a managed identity, and change the secret, since it was in the repository

  WARNING  non-standard-port       examples/messy/Pellworth.Rates.Api/Program.cs:5
           the code binds the port 5080
           fix: let App Service give the port: on Windows the app runs behind IIS, and in a Linux container read the PORT setting; serve other traffic through HTTP on the usual ports

  WARNING  inproc-session-state    examples/messy/Pellworth.Rates.Api/Program.cs:6
           the code keeps its cache and state in the memory of one instance through "AddDistributedMemoryCache("
           fix: keep the state in Azure Cache for Redis or SQL, with the ASP.NET Redis state provider or a Redis distributed cache, before scaling out

  WARNING  non-standard-port       examples/messy/Pellworth.Rates.Api/appsettings.json:6
           the setting "Urls" binds the ports 5080 and 5443
           fix: let App Service give the port: on Windows the app runs behind IIS, and in a Linux container read the PORT setting; serve other traffic through HTTP on the usual ports

  WARNING  event-log               examples/messy/Pellworth.Tracking/Global.asax.cs:12
           the code uses the Windows event log through "EventLog.SourceExists"
           fix: log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights

  WARNING  event-log               examples/messy/Pellworth.Tracking/Global.asax.cs:14
           the code uses the Windows event log through "EventLog.CreateEventSource"
           fix: log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights

  WARNING  event-log               examples/messy/Pellworth.Tracking/Global.asax.cs:21
           the code uses the Windows event log through "EventLog.WriteEntry"
           fix: log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights

  WARNING  msmq                    examples/messy/Pellworth.Tracking/Pellworth.Tracking.csproj:13
           the project references System.Messaging, the MSMQ library
           fix: move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service

  WARNING  msmq                    examples/messy/Pellworth.Tracking/Services/LabelPrinter.vb:1
           the code uses MSMQ through "System.Messaging"
           fix: move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service

  WARNING  msmq                    examples/messy/Pellworth.Tracking/Services/LabelPrinter.vb:6
           the code uses MSMQ through "FormatName:"
           fix: move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service

  WARNING  msmq                    examples/messy/Pellworth.Tracking/Services/LabelPrinter.vb:12
           the code uses MSMQ through "New MessageQueue"
           fix: move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service

  WARNING  local-disk-write        examples/messy/Pellworth.Tracking/Services/ManifestExporter.cs:14
           the code writes a file through "File.WriteAllText(" to the local path "C:\Pellworth\Exports\" (named 2 lines above)
           fix: keep files that must last or be shared in Azure Blob Storage or Azure Files; use the HOME folder only for small shared files and the temporary folder only for scratch files

  WARNING  local-disk-write        examples/messy/Pellworth.Tracking/Services/ManifestExporter.cs:17
           the code writes a file through "File.Copy(" to the local path "\\fs01\manifests\archive\"
           fix: keep files that must last or be shared in Azure Blob Storage or Azure Files; use the HOME folder only for small shared files and the temporary folder only for scratch files

  WARNING  local-disk-write        examples/messy/Pellworth.Tracking/Services/ManifestExporter.cs:22
           the code writes a file through ".SaveAs(" to a path in the folder of the app ("Server.MapPath")
           fix: keep files that must last or be shared in Azure Blob Storage or Azure Files; use the HOME folder only for small shared files and the temporary folder only for scratch files

  WARNING  local-path-setting      examples/messy/Pellworth.Tracking/Web.config:8
           web.config sets the setting "ManifestExportFolder" to "D:\Pellworth\Manifests", a local path
           fix: set the path in an App Service app setting, built from the HOME or temporary folder, or move the files to Azure Storage

  WARNING  gac-assembly            examples/messy/Pellworth.Tracking/Web.config:17
           web.config compiles against the assembly "Pellworth.Legacy.Barcode", which no package or reference with a HintPath of the app provides, so it may come from the Global Assembly Cache
           fix: add the assembly as a NuGet package or a file deployed with the app, or, if it can only come from the Global Assembly Cache, consider a Windows container or Managed Instance on App Service

  WARNING  windows-authentication  examples/messy/Pellworth.Tracking/Web.config:21
           web.config sets <authentication mode="Windows">, which signs users in with their Windows account
           fix: sign users in with Microsoft Entra ID, through App Service authentication or the Microsoft identity libraries, and stop relying on the Windows account of the request

  WARNING  windows-authentication  examples/messy/Pellworth.Tracking/Web.config:22
           web.config sets <identity impersonate="true">, which runs requests as the Windows user
           fix: sign users in with Microsoft Entra ID, through App Service authentication or the Microsoft identity libraries, and stop relying on the Windows account of the request

  WARNING  inproc-session-state    examples/messy/Pellworth.Tracking/Web.config:23
           web.config sets <sessionState mode="InProc">, which keeps state in the memory of one instance
           fix: keep the state in Azure Cache for Redis or SQL, with the ASP.NET Redis state provider or a Redis distributed cache, before scaling out

  WARNING  smtp-pickup-directory   examples/messy/Pellworth.Tracking/Web.config:30
           web.config sends mail with deliveryMethod="SpecifiedPickupDirectory", which drops each message into a folder
           fix: send mail through an SMTP relay or a mail service such as Azure Communication Services, with its credentials in app settings

  WARNING  local-path-setting      examples/messy/Pellworth.Tracking/Web.config:31
           web.config sets pickupDirectoryLocation of <specifiedPickupDirectory> to "C:\inetpub\mailroot\Pickup", a local path
           fix: set the path in an App Service app setting, built from the HOME or temporary folder, or move the files to Azure Storage

  INFO     background-work         examples/messy/Pellworth.Rates.Api/Program.cs:8
           the code runs work in the background through "AddHostedService"
           fix: run the work as a WebJob or in Azure Functions, and turn Always On on for work that must keep running in the web app

  INFO     background-work         examples/messy/Pellworth.Rates.Api/RateRefresher.cs:3
           the code runs work in the background through ": BackgroundService"
           fix: run the work as a WebJob or in Azure Functions, and turn Always On on for work that must keep running in the web app

  INFO     background-work         examples/messy/Pellworth.Tracking/Global.asax.cs:16
           the code runs work in the background through "QueueBackgroundWorkItem("
           fix: run the work as a WebJob or in Azure Functions, and turn Always On on for work that must keep running in the web app

  INFO     custom-module-handler   examples/messy/Pellworth.Tracking/Web.config:25
           web.config adds the HTTP module "YardAudit" of type "Pellworth.Tracking.Modules.YardAuditModule"
           fix: check that each module and handler runs under App Service, with no registry, COM or local disk use of its own, and test it there

  INFO     custom-module-handler   examples/messy/Pellworth.Tracking/Web.config:37
           web.config adds the HTTP module "YardAudit" of type "Pellworth.Tracking.Modules.YardAuditModule"
           fix: check that each module and handler runs under App Service, with no registry, COM or local disk use of its own, and test it there

  INFO     isapi-extension         examples/messy/Pellworth.Tracking/Web.config:40
           web.config maps the handler "ManifestImage" to an ISAPI extension
           fix: check that the ISAPI component can be deployed with the app and runs in the App Service sandbox, or replace it with a managed module

  INFO     url-rewrite             examples/messy/Pellworth.Tracking/Web.config:45
           web.config has the URL Rewrite rule "Old tracking links"
           fix: check each rule on App Service, above all rules that use server variables, rewrite to another host through ARR, or depend on the old host name

This check reads the source as text and runs none of it. A finding is a lead found by a pattern, and a clean result is not a migration assessment and not a certification (docs/limits.md).

RESULT: FAIL - 7 findings at or above error (7 error, 20 warning, 7 info)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    hard-coded-secret       examples/messy/Pellworth.Tracking/Web.config:4
           the connection string "TrackingDb" holds Password= with a secret written in the file; the value is masked
           fix: move the value into an App Service app setting or connection string, best as a Key Vault reference read with a managed identity, and change the secret, since it was in the repository
           rule: a password, account key or shared access key written as a value in web.config or appsettings.json
           basis: an app setting or connection string can be a Key Vault reference that the app reads with its managed identity, so the secret stays out of the configuration (Use Key Vault references as app settings in Azure App Service (Microsoft Learn), https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references)
           basis: an app setting or connection string set in App Service takes the place of the one with the same name in web.config, so secrets can stay out of the repository (Configure ASP.NET apps for Azure App Service (Microsoft Learn), https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnet-framework)
           the tool's own choice: a secret is a part Password=, Pwd=, AccountKey= or SharedAccessKey= of a connection string, or a setting or attribute whose name ends in one of those words; a value that is empty, true or false, a Key Vault reference or a placeholder such as $(Name), #{Name}# or __Name__ is not one; the value is never shown, in any format

```

The clean example passes:

```
app-service-readiness-check: examples/clean
input: folder examples/clean; 5 files of the kinds read: 1 web.config, 1 appsettings, 1 project, 2 C#; read as UTF-8 5; 0 folders skipped; 0 excluded; 0 links not followed; 1 other file passed over
config: built-in defaults: frameworks offered net20, net30, net35, net462, net47, net471, net472, net48, net481, net8.0, net9.0 and net10.0; minimum severity info; fail on error
rules: hard-coded-secret (error); registry-access (error); com-interop (error); unsupported-framework (error); local-disk-write (warning); gac-assembly (warning); windows-authentication (warning); smtp-pickup-directory (warning); msmq (warning); event-log (warning); inproc-session-state (warning); non-standard-port (warning); raw-socket (warning); background-work (info); custom-module-handler (info); isapi-extension (info); url-rewrite (info); state-server-session (info); local-path-setting (info); unreadable-file (error); scan-limit (error)
apps: 1 (1 Ready, 0 Ready with changes, 0 Blockers)
findings: 0

Apps (1)

  app               folder                           framework  error  warning  info  verdict
  Harrowgate.Loans  examples/clean/Harrowgate.Loans  net8.0     0      0        0     Ready

Rules (21)

  rule                    level    findings
  hard-coded-secret       error    0
  registry-access         error    0
  com-interop             error    0
  unsupported-framework   error    0
  local-disk-write        warning  0
  gac-assembly            warning  0
  windows-authentication  warning  0
  smtp-pickup-directory   warning  0
  msmq                    warning  0
  event-log               warning  0
  inproc-session-state    warning  0
  non-standard-port       warning  0
  raw-socket              warning  0
  background-work         info     0
  custom-module-handler   info     0
  isapi-extension         info     0
  url-rewrite             info     0
  state-server-session    info     0
  local-path-setting      info     0
  unreadable-file         error    0
  scan-limit              error    0

Findings (0)

  none

This check reads the source as text and runs none of it. A finding is a lead found by a pattern, and a clean result is not a migration assessment and not a certification (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How a folder is read

1. The folder is walked with a list of its own, in the order of the names. `bin`, `obj`, `node_modules`, `.git` and
   `.vs` are never walked, `--exclude` globs are left out, and a symbolic link is counted and never followed.
2. web.config, appsettings.json, .csproj and .vbproj files, packages.config, Global.asax and .cs and .vb files are read
   as UTF-8, as UTF-16 after a byte order mark, or as Latin-1, and their comments are blanked with the places kept.
3. Code is read a line at a time against fixed patterns; XML is read tag by tag; appsettings.json name by name.
4. The files are grouped into apps by their project folders, and the rules across an app look at its target
   frameworks and at the assemblies its web.config compiles against.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-scan-the-source-as-text-with-fixed-patterns.md) says why the source is read as text.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `hard-coded-secret` | `rules.hardCodedSecret` | error | a password, pwd, account key or shared access key written in web.config or appsettings.json, value masked |
| `registry-access` | `rules.registryAccess` | error | code that uses the Windows registry |
| `com-interop` | `rules.comInterop` | error | DllImport, ComImport, CreateObject and other COM or native calls, and COM references |
| `unsupported-framework` | `rules.unsupportedFramework` | error | a target framework not on the list taken as offered, with the value found |
| `local-disk-write` | `rules.localDiskWrite` | warning | a write to a drive, a share or the folder of the app |
| `gac-assembly` | `rules.gacAssembly` | warning | an assembly of web.config that no package or local reference provides |
| `windows-authentication` | `rules.windowsAuthentication` | warning | Windows authentication or impersonation in web.config or the code |
| `smtp-pickup-directory` | `rules.smtpPickupDirectory` | warning | mail dropped into a pickup folder |
| `msmq` | `rules.msmq` | warning | System.Messaging, queues, MSMQ bindings and addresses |
| `event-log` | `rules.eventLog` | warning | writes to the Windows event log |
| `inproc-session-state` | `rules.inprocSessionState` | warning | InProc state or a memory cache, not shared when the app scales out |
| `non-standard-port` | `rules.nonStandardPort` | warning | a port other than 80 or 443 bound in the code or appsettings.json |
| `raw-socket` | `rules.rawSocket` | warning | a TcpListener, HttpListener or bound UdpClient |
| `background-work` | `rules.backgroundWork` | info | Windows services, hosted services, queued work and scheduled tasks |
| `custom-module-handler` | `rules.customModuleHandler` | info | an HTTP module or handler of the app in web.config |
| `isapi-extension` | `rules.isapiExtension` | info | an ISAPI filter or extension |
| `url-rewrite` | `rules.urlRewrite` | info | a URL Rewrite rule |
| `state-server-session` | `rules.stateServerSession` | info | state kept in the ASP.NET state service or SQL Server |
| `local-path-setting` | `rules.localPathSetting` | info | a local path in a setting |
| `unreadable-file` | none | error | a file or folder that cannot be read as text |
| `scan-limit` | none | error | a folder past the limits of a run |

The two rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## Verdicts

| Verdict | When |
| --- | --- |
| Blockers | the app has at least one finding at the level `error` |
| Ready with changes | no error and at least one `warning` |
| Ready | no error and no warning; findings at `info` are notes to check |

An app is a folder with a .csproj or .vbproj file, and every file belongs to the deepest one above it; files under no
project make one app at the folder scanned. The verdicts use the levels after the configuration and count every finding,
also the ones `--min-severity` hides. The names differ from those of Azure Migrate on purpose
([decision 3](docs/decisions/0003-give-each-app-a-verdict-from-the-levels-of-its-findings.md)).

## Frameworks

The target framework is read from the project files, or from `<compilation>` and `<httpRuntime>` in web.config when no
project names one, and brought to a short form: `v4.7.2` is `net472`, `net8.0-windows` is `net8.0`. The frameworks taken
as offered by default:

| Family | Short forms |
| --- | --- |
| .NET Framework on CLR 2 | `net20`, `net30`, `net35` |
| .NET Framework on CLR 4 | `net462`, `net47`, `net471`, `net472`, `net48`, `net481` |
| .NET | `net8.0`, `net9.0`, `net10.0` |

This list is the tool's own and goes out of date: check it against the App Service pages before you rely on it, and add
a framework with `allowedFrameworks`. A .NET Standard library is not compared. [docs/inputs.md](docs/inputs.md) lists
every form.

## What is not checked

The tool reads the text of the source and never guesses. It does not:

- run, build or restore the app, open its compiled assemblies, or read `bin` and `obj`;
- follow a path held in a variable set far from the write, a call made through a wrapper or reflection, or code in a
  library;
- see what is installed on the server the app runs on today: the Global Assembly Cache, COM registrations, IIS settings
  outside web.config, scheduled tasks and Windows services;
- read Razor views, Web Forms pages, `app.config` or files of other kinds;
- find secrets under names other than password, pwd, account key and shared access key, or secrets in code;
- decide whether the app can move: it is not a migration assessment and not a certification.

So a clean run means the folder holds none of the patterns the rules look for, and every report says so.

## The configuration file

```json
{
  "name": "Pellworth readiness review",
  "allowedFrameworks": ["net7.0"],
  "exclude": ["Proxies"],
  "rules": { "localPathSetting": "warning" }
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`), `allowedFrameworks` adds target frameworks to the list taken as offered, `knownAssemblies`
names assemblies of web.config that need no package, `exclude` adds globs to leave out, `minSeverity` sets the lowest
level shown and `failOn` the lowest level that fails the run. A key the tool does not know is an error with its line and
a suggestion, and a key named twice is refused. [docs/inputs.md](docs/inputs.md) describes every key, and
`--print-defaults` writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the configuration, the rules, the apps with their frameworks and verdicts,
  the count of every rule, the findings with the file and line and what to change, the notes, the notice and the
  result. With `--explain` also the rule, the points of the public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the apps, the counts per rule, every finding
  with its app, file, line and column, the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the app, the file, the line, the column, what
  was found and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could read as a
  formula gets a single quote in front. The start of the messy example:

```
level,rule,app,file,line,column,found,fix
error,unsupported-framework,Pellworth.Tracking,examples/messy/Pellworth.Tracking/Pellworth.Tracking.csproj,8,29,"the app targets v4.0 (net40), .NET Framework, which is not on the list of frameworks the tool takes as offered by App Service (net20, net30, net35, net462 and 9 more)","retarget the app to a framework App Service offers, run it in a custom container, or, once you have checked that App Service runs it, add it to allowedFrameworks"
error,com-interop,Pellworth.Tracking,examples/messy/Pellworth.Tracking/Pellworth.Tracking.csproj,19,28,"the project references the COM component ""PellworthLabelPrint""","replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container"
error,com-interop,Pellworth.Tracking,examples/messy/Pellworth.Tracking/Services/CarrierSettings.cs,9,10,"the code calls COM or native code through ""DllImport""","replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container"
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/Pellworth.Tracking/Services/CarrierSettings.cs,line=14,col=30,title=app-service-readiness-check registry-access::the code uses the Windows registry through "Registry.LocalMachine"; fix: move the values into app settings or Azure App Configuration; if the app must keep the registry, consider Managed Instance on App Service or a Windows container
::warning file=examples/messy/Pellworth.Tracking/Web.config,line=23,col=25,title=app-service-readiness-check inproc-session-state::web.config sets <sessionState mode="InProc">, which keeps state in the memory of one instance; fix: keep the state in Azure Cache for Redis or SQL, with the ASP.NET Redis state provider or a Redis distributed cache, before scaling out
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, a secret, registry use, a COM or native call, a framework not on the list, or a file or folder the tool could
not read; with `--fail-on warning`, every finding that makes an app Ready with changes too. `2`: a usage or input error:
no folder named, two folders named, an unknown option, an option given twice, `--explain` with the csv or github format,
a URL in place of a path, a path that cannot be read, a symbolic link, a file in place of the folder, a glob that is
refused, or a configuration with an unknown key, a key named twice or a value of the wrong kind. With exit code `2` the
tool gives no result and prints the problems on standard error.

## Limits

The tool reads files; it runs nothing and connects to nothing. A run reports the patterns of docs/method.md that the
folder holds. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 8 MB for a file, 20,000
files of the kinds read, 256 MB in all, folders 64 deep, 500 findings listed per rule.
[docs/threat-model.md](docs/threat-model.md) lists the risks of scanning a folder from a pull request and their
controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, walks the folder, reads and scans the files, and builds the report of the run |
| `src/walk.js`, `src/glob.js` | the walk of the folder with no link followed, and the globs of `--exclude` |
| `src/files.js`, `src/kinds.js` | the bounded reading of files, UTF-8, UTF-16 and Latin-1, and the kind of each file |
| `src/lexer.js`, `src/xml.js`, `src/json.js` | comments blanked per language, the tags of XML, and the strict JSON reader of the configuration |
| `src/patterns.js` | the fixed patterns of the rules, as a documented data file |
| `src/scan.js`, `src/secrets.js` | the rules of one file, and the secrets with their mask |
| `src/frameworks.js`, `src/apps.js` | the forms of target frameworks, the apps, the rules across an app and the verdicts |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| What App Service hosts, and Managed Instance for apps that need COM, the registry or MSMQ | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/overview |
| Local and shared storage, the registry, COM, event logs and network access of an app | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality |
| Built-in sign-in with Microsoft Entra and other providers | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization |
| Key Vault references in app settings and connection strings | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references |
| Assemblies of the Global Assembly Cache, and the tools to move .NET apps | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/app-service-asp-net-migration |
| The readiness states of a web app assessment | Microsoft Learn, https://learn.microsoft.com/en-us/azure/migrate/review-web-app-assessment |
| .NET Framework versions on App Service, and settings over web.config | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnet-framework |
| ASP.NET Core versions and outdated runtimes | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnetcore |
| WebJobs and Azure Functions for background work | Microsoft Learn, https://learn.microsoft.com/en-us/azure/app-service/webjobs-create |
| The modes of ASP.NET session state | Microsoft Learn, https://learn.microsoft.com/en-us/previous-versions/aspnet/ms178586(v=vs.100) |
| Requests kept on one instance, and Redis for state | Microsoft Learn, https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state |
| Distributed caches in the cloud | Microsoft Learn, https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

Most moves of an old web app to App Service do not stall on the platform; they stall on a password found in web.config
the week before, a file share the app quietly writes to, a COM component nobody remembered, or state that vanished the
first time the app scaled out. Those are visible in the source long before the move, if someone reads it with them in
mind on every change. How such moves are planned and run is described on the page
[Application Migration to Azure](https://innerluxes.dev/application/migration/azure).

## License

MIT
