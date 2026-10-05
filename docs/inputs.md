# Inputs

## The folder

```
app-service-readiness-check <folder> [--config <file>] [--exclude <glob>]... [options]
```

One folder per run: the source folder of one app, or a folder that holds several, such as the root of a solution.
A file named in place of the folder stops the run. The folder is walked as docs/method.md describes, and these kinds
of files are read, by their names, compared without regard to the case of the letters A to Z (src/kinds.js):

| Kind | Names | Read as |
| --- | --- | --- |
| `web-config` | `web.config`, and `web.<name>.config` such as `Web.Release.config` | XML, tag by tag |
| `appsettings` | `appsettings.json`, and `appsettings.<name>.json` such as `appsettings.Production.json` | JSON with comments, name by name |
| `project` | any `.csproj` or `.vbproj` file | XML, tag by tag |
| `packages` | `packages.config` | XML, tag by tag |
| `asax` | `Global.asax` | code, a line at a time |
| `cs` | any `.cs` file, `Global.asax.cs` included | code, a line at a time |
| `vb` | any `.vb` file, `Global.asax.vb` included | code, a line at a time |

```
app-service-readiness-check src/Shop.Web
app-service-readiness-check . --exclude "**/Migrations/**" --exclude "*.Designer.cs"
app-service-readiness-check . --config readiness.json --format github
```

A file is read as UTF-8, with or without a byte order mark, as UTF-16 little or big endian after its byte order mark,
or as Latin-1 when its bytes are not valid UTF-8. LF, CR LF and CR line ends give the same report. The folders `bin`,
`obj`, `node_modules`, `.git` and `.vs` are never walked.

## Globs

`--exclude` and `exclude` in the configuration take simple globs (src/glob.js), matched against the path of a file or
folder relative to the folder scanned, with forward slashes, without regard to case:

| Glob | Matches |
| --- | --- |
| `*` | any characters in one name, not a slash |
| `?` | one character that is not a slash |
| `**` | any characters, slashes included; `a/**/b` also matches `a/b` |
| `Proxies` | a glob with no slash: a file or folder of that name at any depth |
| `legacy/**` | a glob with a slash: the whole path from the folder scanned |
| `Migrations/` | a trailing slash: folders only |

A folder that matches is not walked. A glob holds 1 to 200 characters; a backslash, a bracket, a brace, an empty part,
`.` or `..` is refused with exit code `2`.

## Target frameworks

A target framework is brought to one short form (src/frameworks.js):

| Written | Short form | Family |
| --- | --- | --- |
| `v4.7.2`, `4.7.2`, `net472` | `net472` | .NET Framework, 1.0 to 4.8.1 |
| `netcoreapp3.1` | `netcoreapp3.1` | .NET Core |
| `net8.0`, `net8.0-windows` | `net8.0` | .NET 5 and later; a platform after the hyphen is dropped |
| `netstandard2.0` | `netstandard2.0` | a library, never compared |

The frameworks the tool takes as offered by App Service by default are `net20`, `net30`, `net35`, `net462`, `net47`,
`net471`, `net472`, `net48`, `net481`, `net8.0`, `net9.0` and `net10.0`: .NET Framework 2.0 to 3.5 on CLR 2, .NET
Framework 4.6.2 to 4.8.1 on CLR 4, and the .NET versions in support. App Service runs a .NET Framework 4 app on its
newest CLR 4, so an app that targets 4.0 to 4.6.1 may run, but those versions are out of support and are not on the
list. This list is the tool's own and goes out of date: check it against the App Service pages before you rely on it,
and add a framework with `allowedFrameworks`.

## The configuration file

The configuration is one JSON object, read by a strict reader of RFC 8259 (no comments, no trailing comma, no name
given twice). Every key is optional; without `--config` the defaults apply, and `--print-defaults` writes them out. A key
the tool does not know is an error with its line and a suggestion, and stops the run with exit code `2`.

```json
{
  "name": "Pellworth readiness review",
  "allowedFrameworks": ["net7.0"],
  "knownAssemblies": ["Vendor.Pdf"],
  "exclude": ["Proxies"],
  "rules": { "localPathSetting": "warning", "urlRewrite": "off" },
  "minSeverity": "info",
  "failOn": "error"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | below |
| `allowedFrameworks` | up to 50 target frameworks to add to the list taken as offered, in any form above | none |
| `knownAssemblies` | up to 200 assembly names, without version, that need no package in web.config | none |
| `exclude` | up to 100 globs, as `--exclude` takes them | none |
| `minSeverity` | the lowest level shown: `info`, `warning` or `error` | `info` |
| `failOn` | the lowest level that fails the run | `error` |

`--min-severity` and `--fail-on` on the command line win over the configuration. The `exclude` globs of the
configuration and of the command line are both used.

## The keys of rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.hardCodedSecret` | `hard-coded-secret` | error |
| `rules.registryAccess` | `registry-access` | error |
| `rules.comInterop` | `com-interop` | error |
| `rules.unsupportedFramework` | `unsupported-framework` | error |
| `rules.localDiskWrite` | `local-disk-write` | warning |
| `rules.gacAssembly` | `gac-assembly` | warning |
| `rules.windowsAuthentication` | `windows-authentication` | warning |
| `rules.smtpPickupDirectory` | `smtp-pickup-directory` | warning |
| `rules.msmq` | `msmq` | warning |
| `rules.eventLog` | `event-log` | warning |
| `rules.inprocSessionState` | `inproc-session-state` | warning |
| `rules.nonStandardPort` | `non-standard-port` | warning |
| `rules.rawSocket` | `raw-socket` | warning |
| `rules.backgroundWork` | `background-work` | info |
| `rules.customModuleHandler` | `custom-module-handler` | info |
| `rules.isapiExtension` | `isapi-extension` | info |
| `rules.urlRewrite` | `url-rewrite` | info |
| `rules.stateServerSession` | `state-server-session` | info |
| `rules.localPathSetting` | `local-path-setting` | info |

`unreadable-file` and `scan-limit` have no key: they are always errors. Raising a rule to `error` makes its findings
blockers in the verdict of an app; setting it to `off` leaves it out of the verdict and the counts, and a note names it.
