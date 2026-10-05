// The built-in configuration: the level of every rule, the folders that are never walked, the frameworks the tool
// takes as offered by App Service, the assemblies that come with .NET Framework, the lowest level shown and the level
// that fails the run. docs/inputs.md describes every key, and --print-defaults writes the configuration out. The forms
// of a target framework are in src/frameworks.js and the patterns of the rules in src/patterns.js.

// The level of every rule that the configuration can set. The two rules of input problems are always errors.
export const DEFAULT_RULES = {
  hardCodedSecret: 'error',
  registryAccess: 'error',
  comInterop: 'error',
  unsupportedFramework: 'error',
  localDiskWrite: 'warning',
  gacAssembly: 'warning',
  windowsAuthentication: 'warning',
  smtpPickupDirectory: 'warning',
  msmq: 'warning',
  eventLog: 'warning',
  inprocSessionState: 'warning',
  nonStandardPort: 'warning',
  rawSocket: 'warning',
  backgroundWork: 'info',
  customModuleHandler: 'info',
  isapiExtension: 'info',
  urlRewrite: 'info',
  stateServerSession: 'info',
  localPathSetting: 'info'
};

// The folders that are never walked, compared without regard to the case of the letters A to Z: build output, package
// folders and the folders of tools.
export const SKIPPED_FOLDERS = ['bin', 'obj', 'node_modules', '.git', '.vs'];

// The target frameworks that the tool takes as offered by App Service, in the form of src/frameworks.js: .NET
// Framework 2.0, 3.0 and 3.5 on CLR 2, .NET Framework 4.6.2 to 4.8.1 on CLR 4, and the .NET versions in support. This
// is the tool's own list and it goes out of date; check it against the App Service pages before you rely on it, and
// add a framework with allowedFrameworks in the configuration.
export const DEFAULT_FRAMEWORKS = ['net20', 'net30', 'net35', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481', 'net8.0', 'net9.0', 'net10.0'];

// Assembly names that come with .NET Framework itself, so a reference to them in web.config needs no package. A name
// that starts with "System." is also taken as one of them. knownAssemblies in the configuration adds names.
export const FRAMEWORK_ASSEMBLIES = ['mscorlib', 'netstandard', 'System', 'Microsoft.CSharp', 'Microsoft.VisualBasic', 'Microsoft.JScript', 'Accessibility', 'WindowsBase', 'PresentationCore', 'PresentationFramework'];

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
