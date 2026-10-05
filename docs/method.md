# Method

This document says exactly what the tool reads, how it reads each file, what each rule looks at and cannot see, how
the files are grouped into apps, and how a verdict and the report are built. The names used here are the defaults;
docs/inputs.md says how the configuration changes them. The tool reads the source of an app as text and runs none of
it. It is a check before a move to Azure App Service, not a migration assessment and not a certification: every rule
is heuristic, a pattern in text that points at a line worth a look.

## What is read

The input is one folder. It is walked with a list of its own, in the order of the names, with no recursion
(src/walk.js). The folders `bin`, `obj`, `node_modules`, `.git` and `.vs` are never walked, a file or folder that
matches an `--exclude` glob or a glob of `exclude` in the configuration is passed over, and a symbolic link (or a
junction on Windows) is counted and never followed, so the walk cannot leave the folder or go round a loop. Of the
files, only seven kinds are read (src/kinds.js): web.config and its variants, appsettings.json and its variants,
.csproj and .vbproj files, packages.config, Global.asax, .cs files and .vb files. Every other file is counted and
passed over.

Each file is read once, as UTF-8 with or without a byte order mark, or as UTF-16 little or big endian after its byte
order mark. A file whose bytes are not valid UTF-8 is read as Latin-1, one character per byte, because old source files
are often saved in a Windows code page and every pattern looks only at ASCII; the report counts such files in a note. A
file that holds a null byte without a UTF-16 byte order mark is binary, and a file over 8 MB is too large: both are an
`unreadable-file` finding and nothing in them is checked.

## How a file is read

1. **Comments.** Comments are blanked first (src/lexer.js): every character of a comment but CR and LF becomes a
   space, so a line and a column after it keep their place. C# loses `//` and `/* */` outside its strings (regular,
   verbatim `@"..."`, interpolated and raw `"""..."""` strings and character literals are kept); VB loses `'` and
   `REM`; appsettings.json loses `//` and `/* */`, as .NET reads it; XML loses `<!-- -->`; Global.asax loses `<%-- --%>`
   and `<!-- -->` and then the comments of C#. A line that was commented out is never reported.
2. **Code.** C#, VB and Global.asax are read a line at a time against the fixed patterns of src/patterns.js. A rule
   gives at most one finding per line, at the first place it matches.
3. **XML.** web.config, the project files and packages.config are read tag by tag (src/xml.js): each start tag with
   its name, its attributes, the place of each value, the elements it sits inside and the text that follows it. The
   five predefined entities are decoded. A file that is not well formed is read as far as it goes.
4. **appsettings.json.** Each name with a string value is read with its place, in any nesting; the value is checked as
   written, with its escapes.

## The apps

An app is a folder that holds a .csproj or .vbproj file, and its name is the name of the first project file in it.
Every file belongs to the app of the **deepest** project folder above it. Files that sit under no project folder, or a
folder with no project file at all, such as an ASP.NET web site, make one app at the folder scanned, named after it.
The rules across an app read the facts of all its files: the target frameworks, the packages and the assemblies of
web.config.

## The verdict

Each app gets a verdict from the levels of its findings, after the configuration has set the level of every rule:

- **Blockers**: at least one finding at the level `error`;
- **Ready with changes**: no error and at least one `warning`;
- **Ready**: no error and no warning; findings at `info` are notes to check and do not change the verdict.

A rule set to `off` gives no finding and counts for nothing. The verdicts count every finding of the app, also the ones
that `--min-severity` hides from the list, so the same folder gets the same verdict whatever is shown. The verdict is the
tool's own reading of the patterns it found, not the readiness of an Azure Migrate assessment
([decision 3](decisions/0003-give-each-app-a-verdict-from-the-levels-of-its-findings.md)). The result of the run, and
the exit code, come from `failOn` alone.

## Rules

Each finding has a rule, a level, the app, the file, the line and column where the match starts, what was found and
what to change. `--explain` adds the rule, the points of the public pages it rests on, and the tool's own choice. The
levels below are the defaults.

### `hard-coded-secret`

Error. In web.config: an attribute named like a secret (`password`, a name that ends in `Password`, `Pwd`,
`AccountKey` or `SharedAccessKey`), the `value` of an `<add>` whose `key` is named like one, and a part `Password=`,
`Pwd=`, `AccountKey=` or `SharedAccessKey=` (spaces allowed in the key) of any attribute value, such as a connection
string. In appsettings.json: a name like a secret with a string value, and the same parts of a connection string in any
value. A value that is empty, `true` or `false`, a Key Vault reference (`@Microsoft.KeyVault(...)`) or a placeholder
(`$(Name)`, `${Name}`, `#{Name}#`, `%Name%`, `__Name__`, `{Name}`, `<Name>` or only asterisks) is not reported. The
value is masked: a finding names the key and never shows the value, and every text a report takes from the input goes
through a mask of these keys too. It cannot see a secret in a code file, in another kind of file, or under a name it
does not know.

### `registry-access`

Error. A line that uses `Microsoft.Win32.Registry` or `RegistryKey`, `Registry.LocalMachine` and the other roots,
`Registry.GetValue` or `SetValue`, `OpenBaseKey`, `OpenSubKey`, `CreateSubKey`, `DeleteSubKey`, `DeleteValue` or
`My.Computer.Registry`. A `using Microsoft.Win32;` alone is not reported. Reads are reported too, because the tool cannot
tell which keys App Service lets an app read.

### `com-interop`

Error. A line with `DllImport`, `LibraryImport`, `ComImport`, `CreateObject(`, `GetTypeFromProgID(`,
`GetTypeFromCLSID(`, a `Marshal` call on a COM object, or a VB `Declare ... Lib`; and a `<COMReference>` of a project
file. It cannot tell an in-process component that Windows registers by default, which App Service allows, from one it
does not have.

### `unsupported-framework`

Error. Each target framework of an app, from `<TargetFramework>`, `<TargetFrameworks>` or `<TargetFrameworkVersion>`
of its project files, or, when they name none, from the `targetFramework` of `<compilation>` or `<httpRuntime>` in its
web.config, brought to its short form (src/frameworks.js). A framework that is not on the list the tool takes as
offered by App Service, the defaults of src/defaults.js and `allowedFrameworks` of the configuration, is reported with
the value as written; so is a value in a form the tool does not read. A .NET Standard library is not compared. Each
value is reported once per app. The list is the tool's own and goes out of date (docs/inputs.md).

### `local-disk-write`

Warning. A line that writes, moves or deletes a file or folder (`File.WriteAllText` and the other writes of `File`,
`Directory.CreateDirectory`, `new StreamWriter(`, `new FileStream(`, `.SaveAs(`, `.Save(` and the writes of the VB
`FileSystem`), when a string on that line, or on one of the three lines above it (the look back), starts with an
absolute path (a drive such as `C:\` or `D:/`, a share such as `\\server`, or `/var/`, `/opt/`, `/srv/`, `/mnt/`,
`/home/` or `/data/`), or when the line itself names the folder of the app (`Server.MapPath`,
`HostingEnvironment.MapPath`, `AppDomain.CurrentDomain.BaseDirectory`, `ContentRootPath`, `WebRootPath`). A line with a
temporary path (`GetTempPath`, `GetTempFileName`, `%TEMP%`, `/tmp/`) is not reported. A path held in a variable set more
than three lines above, a field or another file is not seen.

### `gac-assembly`

Warning. An `<add assembly>` of `<compilation><assemblies>` in web.config whose name (the part before the first comma)
is not a framework assembly (a name that starts with `System.`, or one of the list of src/defaults.js), not in
`knownAssemblies`, and not the id of a package of the app (`<PackageReference>` or packages.config) or a `<Reference>`
of its project files that has a `<HintPath>`. Names are compared without regard to case. It cannot tell whether the
assembly is deployed in `bin` by some other step.

### `windows-authentication`

Warning. `<authentication mode="Windows">`, `<windowsAuthentication enabled="true">` and `<identity
impersonate="true">` in web.config, and `AddNegotiate(`, `NegotiateDefaults`, `WindowsIdentity.GetCurrent`,
`RunImpersonated`, `WindowsImpersonationContext`, `IISDefaults.AuthenticationScheme` and `.Impersonate(` in the code.

### `smtp-pickup-directory`

Warning. `<smtp deliveryMethod="SpecifiedPickupDirectory">` or `"PickupDirectoryFromIis"` in web.config, and the same
delivery methods or `PickupDirectoryLocation` in the code.

### `msmq`

Warning. `System.Messaging`, `new MessageQueue`, `MessageQueue.Exists`, `Create` or `Delete` and a `FormatName:` address
in the code; a `<netMsmqBinding>` or `<msmqIntegrationBinding>` and an attribute value that starts with `net.msmq://`
or `msmq.formatname:` in web.config; and a `<Reference Include="System.Messaging">` of a project file.

### `event-log`

Warning. `EventLog.WriteEntry`, `WriteEvent`, `CreateEventSource`, `SourceExists` or `DeleteEventSource`, `new
EventLog`, `AddEventLog(` and `EventLogTraceListener`.

### `inproc-session-state`

Warning. `<sessionState mode="InProc">`, or `<sessionState>` with no `mode`, which is InProc, in web.config; and
`AddDistributedMemoryCache(` in the code. An app with no `<sessionState>` element at all is not reported, though ASP.NET
uses InProc then too.

### `non-standard-port`

Warning. On a line that binds (`UseUrls`, `Listen`, `ListenAnyIP`, `ListenLocalhost`, `IPEndPoint`, `TcpListener`,
`UdpClient`, `HttpListener`, `Prefixes.Add`, `ASPNETCORE_URLS` or `Urls`): a port in a URL, the first argument of
`ListenAnyIP` or `ListenLocalhost`, and the port argument of `Listen`, `IPEndPoint`, `TcpListener` or `UdpClient`. In
appsettings.json: the ports of the URLs of a value named `Urls`, `Url` or `ASPNETCORE_URLS`, and the list of
`HTTP_PORTS` or `ASPNETCORE_HTTP_PORTS`. Ports 80 and 443 are fine. A URL on a line that does not bind, such as the
address of another service, is not read.

### `raw-socket`

Warning. `new TcpListener`, `new HttpListener`, `TcpListener.Create(` and a `new UdpClient(` bound to a port. Outbound
sockets are not reported.

### `background-work`

Info. `System.ServiceProcess`, a class that inherits `ServiceBase` or `BackgroundService`, `ServiceBase.Run`,
`UseWindowsService(`, `AddWindowsService(`, `QueueBackgroundWorkItem(`, `AddHostedService`, `schtasks` and the
`Microsoft.Win32.TaskScheduler` library; and a `<Reference Include="System.ServiceProcess">`.

### `custom-module-handler`

Info. An `<add>` under `<modules>`, `<httpModules>`, `<handlers>` or `<httpHandlers>` in web.config whose `type` does
not start with `System.` or `Microsoft.`. A module listed in both the classic and the integrated section is reported
twice, once for each.

### `isapi-extension`

Info. A handler with `modules="IsapiModule"` or a `scriptProcessor` that ends in `.dll`, a `<filter>` of
`<isapiFilters>`, and an `<add>` of `<isapiCgiRestriction>`.

### `url-rewrite`

Info. Each `<rule>` inside `<rewrite>`, inbound or outbound, with its name.

### `state-server-session`

Info. `<sessionState mode="StateServer">` or `mode="SQLServer"` in web.config.

### `local-path-setting`

Info. An attribute value of web.config, or a string value of appsettings.json, that starts with an absolute path, as
`local-disk-write` reads one. The `assembly`, `type` and `scriptProcessor` attributes, and a value that another rule
already reported, are left out. The tool cannot tell whether the app writes there.

### `unreadable-file`

Error, always. A file of a kind read that is over 8 MB, binary, not valid UTF-16, or that cannot be opened, and a
folder that cannot be listed. Nothing in it is checked, so the run fails at the default level.

### `scan-limit`

Error, always. The walk stopped at a limit of docs/limits.md: more than 20,000 files of the kinds read, more than
500,000 files and folders in all, folders nested more than 64 deep, or more than 256 MB in the files read. The rest of
the folder is not read, so the run fails.

## The report

The findings are sorted by level, errors first, then by file, line, column and the order of the rules. At most 500
findings of one rule are listed; the rest are counted in a note and still count for the result and the verdicts. The
text report lists what was read, the configuration, the rules with their levels, the apps with their frameworks, counts
by level and verdict, the count of findings of every rule, the findings with what to change, the notes, the notice and
the result.
