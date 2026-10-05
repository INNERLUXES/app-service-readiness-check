// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change on App Service. docs/method.md says exactly what each rule looks at and
// what it cannot see. The patterns are in src/patterns.js, the checks in src/scan.js and src/apps.js.

import { LEVELS } from './data.js';
import { grouped, listText, plural } from './size.js';

export const RULES = [
  {
    id: 'hard-coded-secret',
    key: 'hardCodedSecret',
    title: 'a secret is written in web.config or appsettings.json',
    basis: ['keyVaultRefs', 'appSettingsOverride'],
    own: 'a secret is a part Password=, Pwd=, AccountKey= or SharedAccessKey= of a connection string, or a setting or attribute whose name ends in one of those words; a value that is empty, true or false, a Key Vault reference or a placeholder such as $(Name), #{Name}# or __Name__ is not one; the value is never shown, in any format',
    rule: () => 'a password, account key or shared access key written as a value in web.config or appsettings.json',
    fix: 'move the value into an App Service app setting or connection string, best as a Key Vault reference read with a managed identity, and change the secret, since it was in the repository'
  },
  {
    id: 'registry-access',
    key: 'registryAccess',
    title: 'the code uses the Windows registry',
    basis: ['registryReadOnly', 'managedInstance'],
    own: 'any use of the registry types or calls is reported, reads too, because the tool cannot tell which keys App Service lets an app read; a using directive alone is not reported',
    rule: () => 'a line of code that uses Microsoft.Win32.Registry, a RegistryKey call or My.Computer.Registry',
    fix: 'move the values into app settings or Azure App Configuration; if the app must keep the registry, consider Managed Instance on App Service or a Windows container'
  },
  {
    id: 'com-interop',
    key: 'comInterop',
    title: 'the code calls COM components or native libraries',
    basis: ['comInProcess', 'managedInstance'],
    own: 'DllImport, LibraryImport, ComImport, CreateObject, a type from a ProgID or CLSID, a Marshal call on a COM object, a VB Declare and a COMReference of a project file are reported; the tool cannot tell whether the component is one that Windows registers by default',
    rule: () => 'a line of code or a project reference that reaches COM or a native library',
    fix: 'replace the component with a managed library, or check that it is an in-process component Windows has by default; otherwise consider Managed Instance on App Service or a Windows container'
  },
  {
    id: 'unsupported-framework',
    key: 'unsupportedFramework',
    title: 'the target framework is not on the list of frameworks offered',
    basis: ['frameworkVersions', 'outdatedRuntimes'],
    own: 'the frameworks offered are the tool\'s own list in src/defaults.js plus allowedFrameworks of the configuration; a project file is read first, web.config only when the projects of the app name no framework; a .NET Standard library is not compared; a form the tool does not read is reported',
    rule: (config) => `a target framework that is not one of ${plural(config.frameworks.length, 'framework')} on the list (${listText(config.frameworks, 4)})`,
    fix: 'retarget the app to a framework App Service offers, run it in a custom container, or, once you have checked that App Service runs it, add it to allowedFrameworks'
  },
  {
    id: 'local-disk-write',
    key: 'localDiskWrite',
    title: 'the code writes files to a local path',
    basis: ['localStorage', 'homeShare'],
    own: 'a call that writes, moves or deletes a file, on a line that holds an absolute path (a drive, a share or /var, /opt, /srv, /mnt, /home or /data) or a path in the folder of the app such as Server.MapPath, or with such a path in the three lines above; a temporary path is fine; a path held in a variable set further away is not seen',
    rule: () => 'a write, move or delete of a file at a drive, share or app folder path',
    fix: 'keep files that must last or be shared in Azure Blob Storage or Azure Files; use the HOME folder only for small shared files and the temporary folder only for scratch files'
  },
  {
    id: 'gac-assembly',
    key: 'gacAssembly',
    title: 'web.config compiles against an assembly with no package',
    basis: ['gacDependencies'],
    own: 'an assembly of <compilation><assemblies> whose name is not a framework assembly (a name starting with System. or one of the list in src/defaults.js), not in knownAssemblies of the configuration, and not the id of a package or a reference with a HintPath of the same app; names are compared without regard to case',
    rule: () => 'an assembly in web.config that comes from no package or local reference of the app',
    fix: 'add the assembly as a NuGet package or a file deployed with the app, or, if it can only come from the Global Assembly Cache, consider a Windows container or Managed Instance on App Service'
  },
  {
    id: 'windows-authentication',
    key: 'windowsAuthentication',
    title: 'the app signs users in with Windows authentication',
    basis: ['builtInAuth'],
    own: '<authentication mode="Windows">, <windowsAuthentication enabled="true">, <identity impersonate="true"> in web.config, and Negotiate or impersonation calls in the code',
    rule: () => 'Windows authentication or impersonation in web.config or the code',
    fix: 'sign users in with Microsoft Entra ID, through App Service authentication or the Microsoft identity libraries, and stop relying on the Windows account of the request'
  },
  {
    id: 'smtp-pickup-directory',
    key: 'smtpPickupDirectory',
    title: 'mail is dropped into a pickup folder',
    basis: ['localStorage'],
    own: 'deliveryMethod="SpecifiedPickupDirectory" or "PickupDirectoryFromIis" in web.config, and the same delivery methods or PickupDirectoryLocation in the code; App Service runs no SMTP service to pick the files up',
    rule: () => 'mail sent to a pickup folder instead of an SMTP server',
    fix: 'send mail through an SMTP relay or a mail service such as Azure Communication Services, with its credentials in app settings'
  },
  {
    id: 'msmq',
    key: 'msmq',
    title: 'the app uses MSMQ',
    basis: ['managedInstance'],
    own: 'System.Messaging, MessageQueue, FormatName: addresses, net.msmq bindings and addresses, and a reference to System.Messaging',
    rule: () => 'a use of MSMQ in the code, web.config or a project file',
    fix: 'move the queues to Azure Service Bus or Azure Storage queues; an app that must keep an MSMQ client can look at Managed Instance on App Service'
  },
  {
    id: 'event-log',
    key: 'eventLog',
    title: 'the code writes to the Windows event log',
    basis: ['eventLogs'],
    own: 'EventLog calls, a new EventLog, an EventLogTraceListener and AddEventLog of ASP.NET Core logging',
    rule: () => 'a line of code that uses the Windows event log',
    fix: 'log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights'
  },
  {
    id: 'inproc-session-state',
    key: 'inprocSessionState',
    title: 'state is kept in the memory of one instance',
    basis: ['inProcessDefault', 'stickyRequests', 'sharedCache'],
    own: '<sessionState mode="InProc"> or <sessionState> with no mode in web.config, and AddDistributedMemoryCache in the code; App Service keeps a user on one instance by default, so it works on one instance and loses state on a restart, a swap or a scale in',
    rule: () => 'state or a cache kept in memory, which is not shared when the app scales out',
    fix: 'keep the state in Azure Cache for Redis or SQL, with the ASP.NET Redis state provider or a Redis distributed cache, before scaling out'
  },
  {
    id: 'non-standard-port',
    key: 'nonStandardPort',
    title: 'the app binds a port other than 80 or 443',
    basis: ['networkAccess'],
    own: 'a port in a URL, or as the port argument of Listen, ListenAnyIP, ListenLocalhost, IPEndPoint, TcpListener or UdpClient, on a line that binds, and the ports of Urls in appsettings.json; outbound URLs on other lines are not read',
    rule: () => 'a port other than 80 and 443 bound in the code or in appsettings.json',
    fix: 'let App Service give the port: on Windows the app runs behind IIS, and in a Linux container read the PORT setting; serve other traffic through HTTP on the usual ports'
  },
  {
    id: 'raw-socket',
    key: 'rawSocket',
    title: 'the code listens on a socket of its own',
    basis: ['networkAccess'],
    own: 'a new TcpListener or HttpListener, TcpListener.Create and a UdpClient bound to a port; outbound sockets are not reported',
    rule: () => 'a listener that takes connections outside the web server',
    fix: 'serve the traffic through the web app over HTTP or WebSockets, or move the listener to a service that allows it, such as a container or a virtual machine'
  },
  {
    id: 'background-work',
    key: 'backgroundWork',
    title: 'the app runs Windows services or scheduled work',
    basis: ['backgroundJobs'],
    own: 'ServiceBase, System.ServiceProcess, UseWindowsService, AddWindowsService, QueueBackgroundWorkItem, BackgroundService, AddHostedService, schtasks and the TaskScheduler library; work in the web process stops when the app is idle unless Always On is set',
    rule: () => 'a Windows service, a scheduled task or long background work in the app',
    fix: 'run the work as a WebJob or in Azure Functions, and turn Always On on for work that must keep running in the web app'
  },
  {
    id: 'custom-module-handler',
    key: 'customModuleHandler',
    title: 'web.config adds HTTP modules or handlers of the app',
    basis: ['readinessStates'],
    own: 'an <add> under <modules>, <httpModules>, <handlers> or <httpHandlers> whose type does not start with System. or Microsoft.; most run on App Service, so this is a note to check them',
    rule: () => 'a custom HTTP module or handler in web.config',
    fix: 'check that each module and handler runs under App Service, with no registry, COM or local disk use of its own, and test it there'
  },
  {
    id: 'isapi-extension',
    key: 'isapiExtension',
    title: 'web.config uses ISAPI filters or extensions',
    basis: ['readinessStates', 'managedInstance'],
    own: 'a handler on IsapiModule or with a .dll scriptProcessor, an <isapiFilters> filter and an <isapiCgiRestriction> entry',
    rule: () => 'an ISAPI filter or extension in web.config',
    fix: 'check that the ISAPI component can be deployed with the app and runs in the App Service sandbox, or replace it with a managed module'
  },
  {
    id: 'url-rewrite',
    key: 'urlRewrite',
    title: 'web.config holds URL Rewrite rules',
    basis: ['readinessStates'],
    own: 'one finding per <rule> under <rewrite>; App Service on Windows has the URL Rewrite module, so this is a note to check rules that read server variables or rewrite to other hosts',
    rule: () => 'a URL Rewrite rule in web.config',
    fix: 'check each rule on App Service, above all rules that use server variables, rewrite to another host through ARR, or depend on the old host name'
  },
  {
    id: 'state-server-session',
    key: 'stateServerSession',
    title: 'state is kept in the ASP.NET state service or SQL Server',
    basis: ['inProcessDefault'],
    own: '<sessionState mode="StateServer"> or mode="SQLServer"; the state service does not run on App Service, and the SQL database must be reachable from it',
    rule: () => 'state kept outside the process by the ASP.NET state service or SQL Server',
    fix: 'for StateServer, move the state to Azure Cache for Redis; for SQLServer, point the connection at Azure SQL and keep its secret in app settings'
  },
  {
    id: 'local-path-setting',
    key: 'localPathSetting',
    title: 'a setting holds a local path',
    basis: ['homeShare'],
    own: 'a web.config attribute or an appsettings.json value that starts with a drive, a share or /var, /opt, /srv, /mnt, /home or /data; the tool cannot tell whether the app writes there',
    rule: () => 'a local path in web.config or appsettings.json',
    fix: 'set the path in an App Service app setting, built from the HOME or temporary folder, or move the files to Azure Storage'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a file or folder that cannot be read',
    basis: ['readinessStates'],
    own: 'a file over its size limit, a binary file, a UTF-16 file that is not valid, and a file or folder that cannot be opened are errors and nothing in them is checked; this rule cannot be set lower or off',
    rule: () => 'a file of a kind the tool reads, or a folder, that the tool could not read as text',
    fix: 'make the file readable and save it as UTF-8, or leave it out with --exclude when it is not part of the app'
  },
  {
    id: 'scan-limit',
    key: null,
    title: 'the folder is larger than the limits of a run',
    basis: ['readinessStates'],
    own: 'more files of the kinds read, more files and folders in all, folders nested deeper, or more bytes than the limits of docs/limits.md; the rest of the folder is not read, so the run fails; this rule cannot be set lower or off',
    rule: () => 'a folder whose files go past a limit of the run',
    fix: 'scan each app folder in its own run, or leave out vendored folders and code made by tools with --exclude'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
