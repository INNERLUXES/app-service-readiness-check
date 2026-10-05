// The patterns of the rules, as a documented data file. Every pattern is fixed here: none is built from a file or from
// the configuration. They are heuristic: they look at the text of the source with its comments blanked, a line at a
// time for C#, VB and Global.asax, and tag by tag for web.config and the project files (src/scan.js). Each pattern is
// written so that its work grows with the length of the line, with no nested repeats. docs/method.md lists what each
// one finds and what it cannot see.

// Patterns of the code. Each finding says what the line does, then "through" and the text that matched.
export const CODE_PATTERNS = [
  {
    rule: 'registry-access',
    lead: 'the code uses the Windows registry',
    re: /\bMicrosoft\.Win32\.Registry(?:Key)?\b|\bRegistry\.(?:LocalMachine|CurrentUser|ClassesRoot|Users|CurrentConfig|GetValue|SetValue)\b|\bRegistryKey\.OpenBaseKey\b|\.(?:OpenSubKey|CreateSubKey|DeleteSubKey|DeleteSubKeyTree|DeleteValue)\s*\(|\bMy\.Computer\.Registry\b/
  },
  {
    rule: 'com-interop',
    lead: 'the code calls COM or native code',
    re: /\bDllImport\b|\bLibraryImport\b|\bComImport\b|\bCreateObject\s*\(|\bGetTypeFrom(?:ProgID|CLSID)\s*\(|\bMarshal\.(?:GetActiveObject|BindToMoniker|ReleaseComObject|FinalReleaseComObject)\b|\bDeclare\s+(?:Auto\s+|Ansi\s+|Unicode\s+)?(?:Function|Sub)\s+\w+\s+Lib\b/i
  },
  {
    rule: 'windows-authentication',
    lead: 'the code uses Windows sign-in or impersonation',
    re: /\bAddNegotiate\s*\(|\bNegotiateDefaults\b|\bWindowsIdentity\.(?:GetCurrent|RunImpersonated|RunImpersonatedAsync)\b|\bWindowsImpersonationContext\b|\bIISDefaults\.AuthenticationScheme\b|\.Impersonate\s*\(/
  },
  {
    rule: 'smtp-pickup-directory',
    lead: 'the code drops mail into a pickup folder',
    re: /\bSmtpDeliveryMethod\.(?:SpecifiedPickupDirectory|PickupDirectoryFromIis)\b|\bPickupDirectoryLocation\b/
  },
  {
    rule: 'msmq',
    lead: 'the code uses MSMQ',
    re: /\bSystem\.Messaging\b|\bnew\s+MessageQueue\b|\bMessageQueue\.(?:Exists|Create|Delete)\b|\bFormatName:/i
  },
  {
    rule: 'event-log',
    lead: 'the code uses the Windows event log',
    re: /\bEventLog\.(?:WriteEntry|WriteEvent|CreateEventSource|SourceExists|DeleteEventSource)\b|\bnew\s+EventLog\b|\bAddEventLog\s*\(|\bEventLogTraceListener\b/
  },
  {
    rule: 'background-work',
    lead: 'the code runs work in the background',
    re: /\bSystem\.ServiceProcess\b|(?:\bInherits\s+|:\s*)(?:System\.ServiceProcess\.)?ServiceBase\b|\bServiceBase\.Run\b|\bUseWindowsService\s*\(|\bAddWindowsService\s*\(|\bQueueBackgroundWorkItem\s*\(|(?:\bInherits\s+|:\s*)BackgroundService\b|\bAddHostedService\b|\bschtasks\b|\bMicrosoft\.Win32\.TaskScheduler\b/i
  },
  {
    rule: 'inproc-session-state',
    lead: 'the code keeps its cache and state in the memory of one instance',
    re: /\bAddDistributedMemoryCache\s*\(/
  },
  {
    rule: 'raw-socket',
    lead: 'the code listens on a socket of its own',
    re: /\bnew\s+(?:TcpListener|HttpListener)\b|\bTcpListener\.Create\s*\(|\bnew\s+UdpClient\s*\(\s*\d/
  }
];

// A call that writes, moves or deletes a file or folder.
export const WRITE = /\bFile\.(?:WriteAllText|WriteAllBytes|WriteAllLines|AppendAllText|AppendAllLines|AppendText|CreateText|Create|OpenWrite|Copy|Move|Replace|Delete)(?:Async)?\s*\(|\bDirectory\.(?:CreateDirectory|Delete|Move)\s*\(|\bFileSystem\.(?:WriteAllText|WriteAllBytes|CopyFile|MoveFile|DeleteFile|CreateDirectory|OpenTextFileWriter)\s*\(|\bnew\s+(?:StreamWriter|FileStream)\s*\(|\.SaveAs\s*\(|\.Save\s*\(/;

// A path into the folder of the app on the server.
export const APP_PATH = /\b(?:Server\.MapPath|HostingEnvironment\.MapPath|HttpRuntime\.AppDomainAppPath|AppDomain\.CurrentDomain\.BaseDirectory|ContentRootPath|WebRootPath)\b/;

// A temporary path, which is fine to write to.
export const TEMP_PATH = /\b(?:GetTempPath|GetTempFileName)\b|%TEMP%|%TMP%|"\/tmp\//i;

// The lines before a write that are searched for the path it writes to.
export const LOOK_BACK = 3;

// The strings of a line of C#: a verbatim string @"..." with "" for a quote (group 1), or "..." with backslash escapes
// (group 2). VB strings have no escapes and write "" for a quote (group 1 of STRING_VB).
export const STRING_CS = /@"((?:[^"]|""){0,400})"|"((?:[^"\\\r\n]|\\.){0,400})"/g;
export const STRING_VB = /"((?:[^"\r\n]|""){0,400})"/g;

// The start of an absolute local path: a drive (C:\, D:/), a share (\\server) and a few Unix folders that hold data.
export const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\{2}[A-Za-z0-9$._-]|\\{4}[A-Za-z0-9$._-]|\/(?:var|opt|srv|mnt|home|data)\/)/;

// A line that binds a port, and the ways a port is written on it.
export const BIND = /\b(?:UseUrls|Listen|ListenAnyIP|ListenLocalhost|IPEndPoint|TcpListener|UdpClient|HttpListener|ASPNETCORE_URLS|Urls)\b|\bPrefixes\.Add\b/;
export const URL_PORT = /\b(?:https?|net\.tcp|tcp):\/\/[^/\s"';:]{1,200}:(\d{1,5})\b/g;
export const FIRST_ARG_PORT = /\b(?:ListenAnyIP|ListenLocalhost)\s*\(\s*(\d{1,5})\b/g;
export const SECOND_ARG_PORT = /\b(?:Listen|IPEndPoint|TcpListener|UdpClient)\s*\([^,;]{1,120},\s*(\d{1,5})\s*[,)]/g;

// The ports that App Service sends requests to.
export const WEB_PORTS = [80, 443];

// Types of HTTP modules and handlers that come with ASP.NET or IIS, not with the app.
export const PLATFORM_TYPE = /^\s*(?:System\.|Microsoft\.)/;
