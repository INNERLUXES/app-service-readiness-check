# Limits

The tool reads the source folder of an ASP.NET or ASP.NET Core app as text: its configuration files, its project files
and its C# and VB code. It is a check to run before a move to Azure App Service,
not a migration assessment and not a certification. It runs nothing it reads, builds nothing, connects to no system and
asks nobody anything. Every rule is heuristic: a finding points at a line where a pattern matched, and a run without findings says only that the folder
holds none of the patterns of docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **What the code does when it runs.** The tool matches text. A path held in a variable set more than three lines
  above a write, in a field, in a setting or in another file is not seen; nor is a call made through reflection, a
  wrapper of the app's own or a library. A pattern in a string or a name that only looks like a call is reported.
- **The machine the app runs on today.** What is installed in the Global Assembly Cache, registered as a COM
  component, set in IIS outside web.config, scheduled in the Task Scheduler or run as a Windows service next to the app
  is not in the folder, so it is not read. `gac-assembly` only says that no package of the app names an assembly.
- **The build output.** `bin` and `obj` are never walked, compiled assemblies and packages are not opened, and the
  changes that a `web.*.config` file makes to web.config at build time are not applied: each file is read as written.
- **Other kinds of files.** Razor views (`.cshtml`, `.vbhtml`), Web Forms pages (`.aspx`, `.ascx`), handlers
  (`.ashx`), `app.config`, `applicationHost.config`, PowerShell and batch files, Dockerfiles and the settings of a
  pipeline are not read.
- **Whether App Service offers a framework.** The list of frameworks is the tool's own and goes out of date
  (docs/inputs.md); App Service also runs .NET Framework 4 apps on a newer CLR 4 than they target.
- **Whether a finding is a blocker for you.** The verdict comes from the levels of the rules
  ([decision 3](decisions/0003-give-each-app-a-verdict-from-the-levels-of-its-findings.md)); an in-process COM
  component, a registry read or a module may well run on App Service, and Managed Instance or a Windows container may
  take what plain App Service does not.
- **Secrets under other names.** Only the keys of docs/method.md are read, in web.config and appsettings.json. A token,
  an API key under another name, a certificate or a secret in code is not seen; a secret scanner looks for those.
- **Time.** The tool reads no clock and no dates
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).

## The readers

- Comments are blanked by a reader of each language that knows its strings; a string that the reader takes as closed
  too early or too late can hide or show a comment. Preprocessor branches (`#if`) are read whole.
- The XML reader is not a full XML parser: it finds start tags, attributes and the text after a tag, decodes the five
  predefined entities, and reads a file that is not well formed as far as it goes.
- appsettings.json is read name by name, with comments allowed as .NET allows them; an array of strings is not read.
- A file whose bytes are not valid UTF-8 and that has no UTF-16 byte order mark is read as Latin-1; a UTF-16 file
  without a byte order mark holds null bytes and is an `unreadable-file` finding.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, a file is an error finding, or the walk stops with
a `scan-limit` finding.

| What | Limit |
| --- | --- |
| a file of a kind read | 8 MB; a larger file is an `unreadable-file` finding |
| the configuration | 1 MB |
| files of the kinds read | 20,000 |
| files and folders walked in all | 500,000 |
| folders nested | 64 deep |
| bytes of the files read | 256 MB |
| tags of one XML file | 200,000 |
| a string a pattern looks into | 400 characters on a line of code, 4,000 in appsettings.json |
| a glob | 200 characters; 100 globs from the command line and 100 from the configuration |
| JSON nesting of the configuration | 32 deep |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result and the verdicts |
| problems of the input | 20 listed; the rest are counted |

The tests check a file of two hundred thousand lines, lines of hundreds of thousands of quotes, backslashes and comment
marks, XML with a hundred thousand tags and nesting ten thousand deep, globs with ninety stars against long paths, and
three thousand files in a hundred folders, each with a time check.
