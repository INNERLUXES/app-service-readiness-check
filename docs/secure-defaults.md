# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest
of the document is about what the tool cannot do for you: which folder you give it, where the output goes, and who may
change the configuration. A clean result is not a migration assessment and not a certification; it is a folder with
none of the patterns the rules look for, not a finding that the app is ready.

## How the tool behaves by default

- **Reads, never runs.** The tool reads the files of the folder it is given and the configuration. It follows no
  symbolic link, fetches no web address, refuses an argument that looks like an address, builds nothing, runs nothing
  it reads, evaluates nothing, starts no program and writes nothing to disk.
- **Secrets stay masked.** A secret found in web.config or appsettings.json is named by its key; its value never
  reaches a report, in any format, or an error message.
- **Every rule on from the first run.** Secrets, registry use, COM and native calls and frameworks not on the list are
  errors; local writes, assemblies with no package, Windows authentication, pickup folders, MSMQ, the event log, state
  in memory, ports and listeners are warnings; the rest are notes.
- **Fail closed on what it cannot read.** A file or folder that cannot be read and a folder past the limits of a run are
  error findings that fail the run at the default `failOn` of `error`; these two rules have no key and cannot be lowered
  or set off. A path that cannot be used stops the run with exit code `2` and no result.
- **Unknown keys are errors.** A key in the configuration that the tool does not know stops the run, with its line and
  a suggestion, so a typo such as `failOm` cannot leave a default in place. A key named twice stops the run.
- **No regular expression from the input.** No pattern is built from a file, a glob or the configuration; a glob is
  matched with a list of places, not turned into a pattern.
- **No recursion.** The walk of the folder, the readers of comments and XML and the matching of globs keep lists of
  their own, so a deep folder or file cannot exhaust the stack.
- **No prototype tricks.** Names from the input are looked up in lists or with `Object.hasOwn`, and the readers define
  own properties, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names included, has control characters, line separators and direction
  controls removed and its length capped before it reaches a report or an error message. The GitHub format escapes
  `%`, CR and LF in a message and also `:` and `,` in a property. The CSV format puts a single quote in front of a field
  that a spreadsheet could read as a formula.
- **The same input gives the same output.** No clock, no zone, no locale and no random number
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`"failOn": "warning"`.** Every app with a verdict of Ready with changes fails the run too.
- **`rules`.** Raise `inprocSessionState` to `error` when the app must scale out on day one, `windowsAuthentication`
  when it moves to Microsoft Entra ID with the move, or `localPathSetting` to `warning` to review every local path.
- **Keep `allowedFrameworks`, `knownAssemblies` and `exclude` short.** Each entry hides findings: a framework added, an
  assembly called known, a folder left out. Review each one, and prefer an `exclude` glob that names a folder of
  vendored or tool-made code over one that leaves out a kind of file everywhere.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: App Service readiness check
    run: npx --yes github:INNERLUXES/app-service-readiness-check src --config readiness.json --format github
```

- Give the job read access to the contents and nothing more. The tool needs no secret and no network access to Azure.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because
  `npx` runs what it downloads.
- Do not hide the exit code with a trailing `|| true`. To see the report without failing, keep `failOn` at `error` and
  keep the JSON or CSV report as an artifact of the job.
- Treat a CSV report built from a folder you do not trust as untrusted data: open it with formulas off.
- A finding of `hard-coded-secret` means the secret is in the history of the repository: change it, even after the
  file is fixed.

## Protecting the configuration

The configuration decides which rules report, which frameworks count as offered, which assemblies need no package,
which folders are read and what fails the run. Keep it in the repository, put its path in `CODEOWNERS` with the people
who own the move, and require their review in branch protection. Review a change that sets a rule to off or lower, adds
a framework, an assembly or a glob, or raises `failOn` like a change to code: each of them can hide a gap.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
