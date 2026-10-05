# Changes

## 1.0.0

First release.

- Scans the source folder of ASP.NET and ASP.NET Core web apps for what may block or complicate a move to Azure App
  Service, the way a migration team checks an app before a rehost. It walks the folder with no recursion, never walks
  `bin`, `obj`, `node_modules`, `.git` or `.vs`, follows no symbolic link, takes `--exclude` globs, and reads
  web.config, appsettings.json, .csproj and .vbproj files, packages.config, Global.asax and .cs and .vb files as text,
  as UTF-8, as UTF-16 after a byte order mark, or as Latin-1, with their comments blanked first.
- Nineteen rules in three levels: secrets written in web.config or appsettings.json, always masked
  (`hard-coded-secret`), registry use (`registry-access`), COM and native calls (`com-interop`), target frameworks not
  on the documented list (`unsupported-framework`), writes to local paths (`local-disk-write`), assemblies of web.config
  with no package (`gac-assembly`), Windows authentication and impersonation (`windows-authentication`), mail pickup
  folders (`smtp-pickup-directory`), MSMQ (`msmq`), the event log (`event-log`), state kept in memory
  (`inproc-session-state`), ports other than 80 and 443 (`non-standard-port`), listening sockets (`raw-socket`),
  Windows services and background work (`background-work`), custom HTTP modules and handlers
  (`custom-module-handler`), ISAPI (`isapi-extension`), URL Rewrite rules (`url-rewrite`), the ASP.NET state service
  or SQL Server state (`state-server-session`) and local paths in settings (`local-path-setting`); and two rules of
  input problems that cannot be lowered (`unreadable-file`, `scan-limit`).
- Groups the files into apps by their project folders, and gives each app a verdict: Blockers, Ready with changes or
  Ready, from the levels of its findings, with its target frameworks and counts.
- A configuration file in strict JSON over documented defaults: the level of every rule, frameworks to add to the
  list, assemblies known to need no package, globs to leave out, the minimum severity and the level that fails the run;
  a key the tool does not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; every finding has its file and line, and a count per rule; `--min-severity`,
  `--fail-on`, `--explain` with the rule, the sources and the tool's own choice, and `--print-defaults`. Exit code `0`
  when no finding is at or above the fail-on level, `1` when one is, `2` for a usage or input error, with no result.
- Reads no clock, connects to nothing, runs nothing it reads, writes nothing to disk, reports binary input and folders
  past its limits as errors, neutralizes formulas in the CSV report, and has a size limit on every input.
- A heuristic check before the move, not a migration assessment and not a certification: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
