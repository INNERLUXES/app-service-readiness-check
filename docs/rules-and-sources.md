# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change on App Service. The same points are in src/data.js and are shown by
`--explain`; research/sources.md has a longer note on each page. The tool reads the source as text: a point says what a
page says, and a finding says what a file holds. A clean result is not a migration assessment and not a certification.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `hard-coded-secret` | error | `keyVaultRefs`, `appSettingsOverride` |
| `registry-access` | error | `registryReadOnly`, `managedInstance` |
| `com-interop` | error | `comInProcess`, `managedInstance` |
| `unsupported-framework` | error | `frameworkVersions`, `outdatedRuntimes` |
| `local-disk-write` | warning | `localStorage`, `homeShare` |
| `gac-assembly` | warning | `gacDependencies` |
| `windows-authentication` | warning | `builtInAuth` |
| `smtp-pickup-directory` | warning | `localStorage` |
| `msmq` | warning | `managedInstance` |
| `event-log` | warning | `eventLogs` |
| `inproc-session-state` | warning | `inProcessDefault`, `stickyRequests`, `sharedCache` |
| `non-standard-port` | warning | `networkAccess` |
| `raw-socket` | warning | `networkAccess` |
| `background-work` | info | `backgroundJobs` |
| `custom-module-handler` | info | `readinessStates` |
| `isapi-extension` | info | `readinessStates`, `managedInstance` |
| `url-rewrite` | info | `readinessStates` |
| `state-server-session` | info | `inProcessDefault` |
| `local-path-setting` | info | `homeShare` |
| `unreadable-file` | error, always | `readinessStates` |
| `scan-limit` | error, always | `readinessStates` |

### `hard-coded-secret`

A secret is written in web.config or appsettings.json.

- `keyVaultRefs` (Use Key Vault references as app settings in Azure App Service (Microsoft Learn)): an app setting or connection string can be a Key Vault reference that the app reads with its managed identity, so the secret stays out of the configuration.
- `appSettingsOverride` (Configure ASP.NET apps for Azure App Service (Microsoft Learn)): an app setting or connection string set in App Service takes the place of the one with the same name in web.config, so secrets can stay out of the repository.

The tool's own choice: a secret is a part Password=, Pwd=, AccountKey= or SharedAccessKey= of a connection string, or a setting or attribute whose name ends in one of those words; a value that is empty, true or false, a Key Vault reference or a placeholder such as $(Name), #{Name}# or __Name__ is not one; the value is never shown, in any format.

What to change: move the value into an App Service app setting or connection string, best as a Key Vault reference read with a managed identity, and change the secret, since it was in the repository.

### `registry-access`

The code uses the Windows registry.

- `registryReadOnly` (Operating system functionality in Azure App Service (Microsoft Learn)): an app can read much of the registry but not HKEY_CURRENT_USER, and every write to the registry is blocked.
- `managedInstance` (Overview of Azure App Service (Microsoft Learn)): Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client.

The tool's own choice: any use of the registry types or calls is reported, reads too, because the tool cannot tell which keys App Service lets an app read; a using directive alone is not reported.

What to change: move the values into app settings or Azure App Configuration; if the app must keep the registry, consider Managed Instance on App Service or a Windows container.

### `com-interop`

The code calls COM components or native libraries.

- `comInProcess` (Operating system functionality in Azure App Service (Microsoft Learn)): web frameworks can call in-process COM components that Windows registers by default, but not out-of-process COM components.
- `managedInstance` (Overview of Azure App Service (Microsoft Learn)): Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client.

The tool's own choice: DllImport, LibraryImport, ComImport, CreateObject, a type from a ProgID or CLSID, a Marshal call on a COM object, a VB Declare and a COMReference of a project file are reported; the tool cannot tell whether the component is one that Windows registers by default.

What to change: replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container.

### `unsupported-framework`

The target framework is not on the list of frameworks offered.

- `frameworkVersions` (Configure ASP.NET apps for Azure App Service (Microsoft Learn)): Windows instances have the supported .NET Framework versions installed, CLR 4 for .NET Framework 4 and CLR 2 for 3.5, and an app whose runtime is not supported can run in a custom container.
- `outdatedRuntimes` (Configure ASP.NET Core apps for Azure App Service (Microsoft Learn)): an ASP.NET Core app sets its version in the project file, and outdated runtimes are hidden from the portal and may later be removed from the platform after notice.

The tool's own choice: the frameworks offered are the tool's own list in src/defaults.js plus allowedFrameworks of the configuration; a project file is read first, web.config only when the projects of the app name no framework; a .NET Standard library is not compared; a form the tool does not read is reported.

What to change: retarget the app to a framework App Service offers, run it in a custom container, or, once you have checked that App Service runs it, add it to allowedFrameworks.

### `local-disk-write`

The code writes files to a local path.

- `localStorage` (Operating system functionality in Azure App Service (Microsoft Learn)): the local storage of an instance is temporary: it does not survive a restart and is not shared with the other instances of the app.
- `homeShare` (Operating system functionality in Azure App Service (Microsoft Learn)): the HOME folder is a content share in Azure Storage that survives restarts and is shared by every instance, and paths should come from environment variables, not a hard-coded drive.

The tool's own choice: a call that writes, moves or deletes a file, on a line that holds an absolute path (a drive, a share or /var, /opt, /srv, /mnt, /home or /data) or a path in the folder of the app such as Server.MapPath, or with such a path in the three lines above; a temporary path is fine; a path held in a variable set further away is not seen.

What to change: keep files that must last or be shared in Azure Blob Storage or Azure Files; use the HOME folder only for small shared files and the temporary folder only for scratch files.

### `gac-assembly`

Web.config compiles against an assembly with no package.

- `gacDependencies` (Migrate .NET apps to Azure App Service (Microsoft Learn)): some .NET Framework apps depend on components in the Global Assembly Cache that App Service does not have; Windows containers and Managed Instance are the ways to run them.

The tool's own choice: an assembly of <compilation><assemblies> whose name is not a framework assembly (a name starting with System. or one of the list in src/defaults.js), not in knownAssemblies of the configuration, and not the id of a package or a reference with a HintPath of the same app; names are compared without regard to case.

What to change: add the assembly as a NuGet package or a file deployed with the app, or, if it can only come from the Global Assembly Cache, consider a Windows container or Managed Instance on App Service.

### `windows-authentication`

The app signs users in with Windows authentication.

- `builtInAuth` (Authentication and authorization in Azure App Service (Microsoft Learn)): App Service authentication signs users in with Microsoft Entra and other providers through a platform module that runs before the app code, with no code changes.

The tool's own choice: <authentication mode="Windows">, <windowsAuthentication enabled="true">, <identity impersonate="true"> in web.config, and Negotiate or impersonation calls in the code.

What to change: sign users in with Microsoft Entra ID, through App Service authentication or the Microsoft identity libraries, and stop relying on the Windows account of the request.

### `smtp-pickup-directory`

Mail is dropped into a pickup folder.

- `localStorage` (Operating system functionality in Azure App Service (Microsoft Learn)): the local storage of an instance is temporary: it does not survive a restart and is not shared with the other instances of the app.

The tool's own choice: deliveryMethod="SpecifiedPickupDirectory" or "PickupDirectoryFromIis" in web.config, and the same delivery methods or PickupDirectoryLocation in the code; App Service runs no SMTP service to pick the files up.

What to change: send mail through an SMTP relay or a mail service such as Azure Communication Services, with its credentials in app settings.

### `msmq`

The app uses MSMQ.

- `managedInstance` (Overview of Azure App Service (Microsoft Learn)): Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client.

The tool's own choice: System.Messaging, MessageQueue, FormatName: addresses, net.msmq bindings and addresses, and a reference to System.Messaging.

What to change: move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service.

### `event-log`

The code writes to the Windows event log.

- `eventLogs` (Operating system functionality in Azure App Service (Microsoft Learn)): calls that read or write the Windows event logs or ETW may seem to work, but the app has no access to that data; logs go to the app folder or to blob storage.

The tool's own choice: EventLog calls, a new EventLog, an EventLogTraceListener and AddEventLog of ASP.NET Core logging.

What to change: log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights.

### `inproc-session-state`

State is kept in the memory of one instance.

- `inProcessDefault` (Session-State Modes (ASP.NET, Microsoft Learn archive)): InProc keeps state in the memory of one web server and is the default; StateServer and SQLServer keep it outside the worker process for a web farm, with the ASP.NET state service or a SQL database.
- `stickyRequests` (Session in ASP.NET Core (Microsoft Learn)): App Service uses ARR affinity to keep a user on one instance, but that hurts scaling and updates; a Redis or SQL Server distributed cache needs no affinity.
- `sharedCache` (Overview of caching in ASP.NET Core (Microsoft Learn)): in the cloud or a server farm a distributed cache such as Redis or SQL Server is shared by all servers, while a cache in memory suits one server or requests kept on one server.

The tool's own choice: <sessionState mode="InProc"> or <sessionState> with no mode in web.config, and AddDistributedMemoryCache in the code; App Service keeps a user on one instance by default, so it works on one instance and loses state on a restart, a swap or a scale in.

What to change: keep the state in Azure Cache for Redis or SQL, with the ASP.NET Redis state provider or a Redis distributed cache, before scaling out.

### `non-standard-port`

The app binds a port other than 80 or 443.

- `networkAccess` (Operating system functionality in Azure App Service (Microsoft Learn)): an app makes outbound TCP and UDP connections and may listen only on one local loopback socket of its own.

The tool's own choice: a port in a URL, or as the port argument of Listen, ListenAnyIP, ListenLocalhost, IPEndPoint, TcpListener or UdpClient, on a line that binds, and the ports of Urls in appsettings.json; outbound URLs on other lines are not read.

What to change: let App Service give the port: on Windows the app runs behind IIS, and in a Linux container read the PORT setting; serve other traffic through HTTP on the usual ports.

### `raw-socket`

The code listens on a socket of its own.

- `networkAccess` (Operating system functionality in Azure App Service (Microsoft Learn)): an app makes outbound TCP and UDP connections and may listen only on one local loopback socket of its own.

The tool's own choice: a new TcpListener or HttpListener, TcpListener.Create and a UdpClient bound to a port; outbound sockets are not reported.

What to change: serve the traffic through the web app over HTTP or WebSockets, or move the listener to a service that allows it, such as a container or a virtual machine.

### `background-work`

The app runs Windows services or scheduled work.

- `backgroundJobs` (Run background tasks with WebJobs in Azure App Service (Microsoft Learn)): WebJobs run a program or script beside the web app, continuously or on a schedule, and Azure Functions is another way to run such work.

The tool's own choice: ServiceBase, System.ServiceProcess, UseWindowsService, AddWindowsService, QueueBackgroundWorkItem, BackgroundService, AddHostedService, schtasks and the TaskScheduler library; work in the web process stops when the app is idle unless Always On is set.

What to change: run the work as a WebJob or in Azure Functions, and turn Always On on for work that must keep running in the web app.

### `custom-module-handler`

Web.config adds HTTP modules or handlers of the app.

- `readinessStates` (Review web apps for migration (Azure Migrate, Microsoft Learn)): a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them.

The tool's own choice: an <add> under <modules>, <httpModules>, <handlers> or <httpHandlers> whose type does not start with System. or Microsoft.; most run on App Service, so this is a note to check them.

What to change: check that each module and handler runs under App Service, with no registry, COM or local disk use of its own, and test it there.

### `isapi-extension`

Web.config uses ISAPI filters or extensions.

- `readinessStates` (Review web apps for migration (Azure Migrate, Microsoft Learn)): a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them.
- `managedInstance` (Overview of Azure App Service (Microsoft Learn)): Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client.

The tool's own choice: a handler on IsapiModule or with a .dll scriptProcessor, an <isapiFilters> filter and an <isapiCgiRestriction> entry.

What to change: check that the ISAPI component can be deployed with the app and runs in the App Service sandbox, or replace it with a managed module.

### `url-rewrite`

Web.config holds URL Rewrite rules.

- `readinessStates` (Review web apps for migration (Azure Migrate, Microsoft Learn)): a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them.

The tool's own choice: one finding per <rule> under <rewrite>; App Service on Windows has the URL Rewrite module, so this is a note to check rules that read server variables or rewrite to other hosts.

What to change: check each rule on App Service, above all rules that use server variables, rewrite to another host through ARR, or depend on the old host name.

### `state-server-session`

State is kept in the ASP.NET state service or SQL Server.

- `inProcessDefault` (Session-State Modes (ASP.NET, Microsoft Learn archive)): InProc keeps state in the memory of one web server and is the default; StateServer and SQLServer keep it outside the worker process for a web farm, with the ASP.NET state service or a SQL database.

The tool's own choice: <sessionState mode="StateServer"> or mode="SQLServer"; the state service does not run on App Service, and the SQL database must be reachable from it.

What to change: for StateServer, move the state to Azure Cache for Redis; for SQLServer, point the connection at Azure SQL and keep its secret in app settings.

### `local-path-setting`

A setting holds a local path.

- `homeShare` (Operating system functionality in Azure App Service (Microsoft Learn)): the HOME folder is a content share in Azure Storage that survives restarts and is shared by every instance, and paths should come from environment variables, not a hard-coded drive.

The tool's own choice: a web.config attribute or an appsettings.json value that starts with a drive, a share or /var, /opt, /srv, /mnt, /home or /data; the tool cannot tell whether the app writes there.

What to change: set the path in an App Service app setting, built from the HOME or temporary folder, or move the files to Azure Storage.

### `unreadable-file`

A file or folder that cannot be read.

- `readinessStates` (Review web apps for migration (Azure Migrate, Microsoft Learn)): a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them.

The tool's own choice: a file over its size limit, a binary file, a UTF-16 file that is not valid, and a file or folder that cannot be opened are errors and nothing in them is checked; this rule cannot be set lower or off.

What to change: make the file readable and save it as UTF-8, or leave it out with --exclude when it is not part of the app.

### `scan-limit`

The folder is larger than the limits of a run.

- `readinessStates` (Review web apps for migration (Azure Migrate, Microsoft Learn)): a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them.

The tool's own choice: more files of the kinds read, more files and folders in all, folders nested deeper, or more bytes than the limits of docs/limits.md; the rest of the folder is not read, so the run fails; this rule cannot be set lower or off.

What to change: scan each app folder in its own run, or leave out vendored folders and code made by tools with --exclude.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `stacks` | Overview of Azure App Service (Microsoft Learn) | App Service hosts web apps and APIs on Windows or Linux for .NET and other stacks with no servers to manage, and scales them up or out |
| `managedInstance` | Overview of Azure App Service (Microsoft Learn) | Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client |
| `localStorage` | Operating system functionality in Azure App Service (Microsoft Learn) | the local storage of an instance is temporary: it does not survive a restart and is not shared with the other instances of the app |
| `homeShare` | Operating system functionality in Azure App Service (Microsoft Learn) | the HOME folder is a content share in Azure Storage that survives restarts and is shared by every instance, and paths should come from environment variables, not a hard-coded drive |
| `registryReadOnly` | Operating system functionality in Azure App Service (Microsoft Learn) | an app can read much of the registry but not HKEY_CURRENT_USER, and every write to the registry is blocked |
| `comInProcess` | Operating system functionality in Azure App Service (Microsoft Learn) | web frameworks can call in-process COM components that Windows registers by default, but not out-of-process COM components |
| `eventLogs` | Operating system functionality in Azure App Service (Microsoft Learn) | calls that read or write the Windows event logs or ETW may seem to work, but the app has no access to that data; logs go to the app folder or to blob storage |
| `networkAccess` | Operating system functionality in Azure App Service (Microsoft Learn) | an app makes outbound TCP and UDP connections and may listen only on one local loopback socket of its own |
| `builtInAuth` | Authentication and authorization in Azure App Service (Microsoft Learn) | App Service authentication signs users in with Microsoft Entra and other providers through a platform module that runs before the app code, with no code changes |
| `keyVaultRefs` | Use Key Vault references as app settings in Azure App Service (Microsoft Learn) | an app setting or connection string can be a Key Vault reference that the app reads with its managed identity, so the secret stays out of the configuration |
| `appSettingsOverride` | Configure ASP.NET apps for Azure App Service (Microsoft Learn) | an app setting or connection string set in App Service takes the place of the one with the same name in web.config, so secrets can stay out of the repository |
| `frameworkVersions` | Configure ASP.NET apps for Azure App Service (Microsoft Learn) | Windows instances have the supported .NET Framework versions installed, CLR 4 for .NET Framework 4 and CLR 2 for 3.5, and an app whose runtime is not supported can run in a custom container |
| `outdatedRuntimes` | Configure ASP.NET Core apps for Azure App Service (Microsoft Learn) | an ASP.NET Core app sets its version in the project file, and outdated runtimes are hidden from the portal and may later be removed from the platform after notice |
| `gacDependencies` | Migrate .NET apps to Azure App Service (Microsoft Learn) | some .NET Framework apps depend on components in the Global Assembly Cache that App Service does not have; Windows containers and Managed Instance are the ways to run them |
| `readinessStates` | Review web apps for migration (Azure Migrate, Microsoft Learn) | a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them |
| `backgroundJobs` | Run background tasks with WebJobs in Azure App Service (Microsoft Learn) | WebJobs run a program or script beside the web app, continuously or on a schedule, and Azure Functions is another way to run such work |
| `inProcessDefault` | Session-State Modes (ASP.NET, Microsoft Learn archive) | InProc keeps state in the memory of one web server and is the default; StateServer and SQLServer keep it outside the worker process for a web farm, with the ASP.NET state service or a SQL database |
| `stickyRequests` | Session in ASP.NET Core (Microsoft Learn) | App Service uses ARR affinity to keep a user on one instance, but that hurts scaling and updates; a Redis or SQL Server distributed cache needs no affinity |
| `sharedCache` | Overview of caching in ASP.NET Core (Microsoft Learn) | in the cloud or a server farm a distributed cache such as Redis or SQL Server is shared by all servers, while a cache in memory suits one server or requests kept on one server |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the configuration reader of this tool refuses a repeated name |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

- Overview of Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/overview
- Operating system functionality in Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality
- Authentication and authorization in Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization
- Use Key Vault references as app settings in Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references
- Migrate .NET apps to Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/app-service-asp-net-migration
- Review web apps for migration (Azure Migrate, Microsoft Learn): https://learn.microsoft.com/en-us/azure/migrate/review-web-app-assessment
- Configure ASP.NET apps for Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnet-framework
- Configure ASP.NET Core apps for Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/configure-language-dotnetcore
- Run background tasks with WebJobs in Azure App Service (Microsoft Learn): https://learn.microsoft.com/en-us/azure/app-service/webjobs-create
- Session-State Modes (ASP.NET, Microsoft Learn archive): https://learn.microsoft.com/en-us/previous-versions/aspnet/ms178586(v=vs.100)
- Session in ASP.NET Core (Microsoft Learn): https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state
- Overview of caching in ASP.NET Core (Microsoft Learn): https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview
- RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files: https://www.rfc-editor.org/rfc/rfc4180
- RFC 8259, The JSON Data Interchange Format: https://www.rfc-editor.org/rfc/rfc8259
- CSV Injection (OWASP): https://community.owasp.org/attacks/CSV_Injection
- Workflow commands for GitHub Actions (GitHub Docs): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
