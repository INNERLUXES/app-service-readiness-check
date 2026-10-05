// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const APP = 'https://learn.microsoft.com/en-us/azure/app-service';
const CORE = 'https://learn.microsoft.com/en-us/aspnet/core';

export const SOURCES = [
  { id: 'appServiceOverview', title: 'Overview of Azure App Service (Microsoft Learn)', url: `${APP}/overview` },
  { id: 'osFunctionality', title: 'Operating system functionality in Azure App Service (Microsoft Learn)', url: `${APP}/operating-system-functionality` },
  { id: 'appServiceAuth', title: 'Authentication and authorization in Azure App Service (Microsoft Learn)', url: `${APP}/overview-authentication-authorization` },
  { id: 'keyVaultReferences', title: 'Use Key Vault references as app settings in Azure App Service (Microsoft Learn)', url: `${APP}/app-service-key-vault-references` },
  { id: 'aspnetMigration', title: 'Migrate .NET apps to Azure App Service (Microsoft Learn)', url: `${APP}/app-service-asp-net-migration` },
  { id: 'webAppAssessment', title: 'Review web apps for migration (Azure Migrate, Microsoft Learn)', url: 'https://learn.microsoft.com/en-us/azure/migrate/review-web-app-assessment' },
  { id: 'configureAspnet', title: 'Configure ASP.NET apps for Azure App Service (Microsoft Learn)', url: `${APP}/configure-language-dotnet-framework` },
  { id: 'configureAspnetCore', title: 'Configure ASP.NET Core apps for Azure App Service (Microsoft Learn)', url: `${APP}/configure-language-dotnetcore` },
  { id: 'webJobs', title: 'Run background tasks with WebJobs in Azure App Service (Microsoft Learn)', url: `${APP}/webjobs-create` },
  { id: 'stateModes', title: 'Session-State Modes (ASP.NET, Microsoft Learn archive)', url: 'https://learn.microsoft.com/en-us/previous-versions/aspnet/ms178586(v=vs.100)' },
  { id: 'coreState', title: 'Session in ASP.NET Core (Microsoft Learn)', url: `${CORE}/fundamentals/app-state` },
  { id: 'coreCaching', title: 'Overview of caching in ASP.NET Core (Microsoft Learn)', url: `${CORE}/performance/caching/overview` },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  stacks: { source: 'appServiceOverview', text: 'App Service hosts web apps and APIs on Windows or Linux for .NET and other stacks with no servers to manage, and scales them up or out' },
  managedInstance: { source: 'appServiceOverview', text: 'Managed Instance on App Service is meant for Windows apps that need COM, registry access, installers, drive mapping or an MSMQ client' },
  localStorage: { source: 'osFunctionality', text: 'the local storage of an instance is temporary: it does not survive a restart and is not shared with the other instances of the app' },
  homeShare: { source: 'osFunctionality', text: 'the HOME folder is a content share in Azure Storage that survives restarts and is shared by every instance, and paths should come from environment variables, not a hard-coded drive' },
  registryReadOnly: { source: 'osFunctionality', text: 'an app can read much of the registry but not HKEY_CURRENT_USER, and every write to the registry is blocked' },
  comInProcess: { source: 'osFunctionality', text: 'web frameworks can call in-process COM components that Windows registers by default, but not out-of-process COM components' },
  eventLogs: { source: 'osFunctionality', text: 'calls that read or write the Windows event logs or ETW may seem to work, but the app has no access to that data; logs go to the app folder or to blob storage' },
  networkAccess: { source: 'osFunctionality', text: 'an app makes outbound TCP and UDP connections and may listen only on one local loopback socket of its own' },
  builtInAuth: { source: 'appServiceAuth', text: 'App Service authentication signs users in with Microsoft Entra and other providers through a platform module that runs before the app code, with no code changes' },
  keyVaultRefs: { source: 'keyVaultReferences', text: 'an app setting or connection string can be a Key Vault reference that the app reads with its managed identity, so the secret stays out of the configuration' },
  appSettingsOverride: { source: 'configureAspnet', text: 'an app setting or connection string set in App Service takes the place of the one with the same name in web.config, so secrets can stay out of the repository' },
  frameworkVersions: { source: 'configureAspnet', text: 'Windows instances have the supported .NET Framework versions installed, CLR 4 for .NET Framework 4 and CLR 2 for 3.5, and an app whose runtime is not supported can run in a custom container' },
  outdatedRuntimes: { source: 'configureAspnetCore', text: 'an ASP.NET Core app sets its version in the project file, and outdated runtimes are hidden from the portal and may later be removed from the platform after notice' },
  gacDependencies: { source: 'aspnetMigration', text: 'some .NET Framework apps depend on components in the Global Assembly Cache that App Service does not have; Windows containers and Managed Instance are the ways to run them' },
  readinessStates: { source: 'webAppAssessment', text: 'a web app assessment rates each app Ready, Ready with conditions, Not ready or Unknown, and lists the issues and warnings with how to fix them' },
  backgroundJobs: { source: 'webJobs', text: 'WebJobs run a program or script beside the web app, continuously or on a schedule, and Azure Functions is another way to run such work' },
  inProcessDefault: { source: 'stateModes', text: 'InProc keeps state in the memory of one web server and is the default; StateServer and SQLServer keep it outside the worker process for a web farm, with the ASP.NET state service or a SQL database' },
  stickyRequests: { source: 'coreState', text: 'App Service uses ARR affinity to keep a user on one instance, but that hurts scaling and updates; a Redis or SQL Server distributed cache needs no affinity' },
  sharedCache: { source: 'coreCaching', text: 'in the cloud or a server farm a distributed cache such as Redis or SQL Server is shared by all servers, while a cache in memory suits one server or requests kept on one server' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the configuration reader of this tool refuses a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The verdicts of an app, from the best.
export const VERDICTS = ['Ready', 'Ready with changes', 'Blockers'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads the source as text and runs none of it. A finding is a lead found by a pattern, and a clean result is not a migration assessment and not a certification (docs/limits.md).';
