# 2. Scan the source as text, with fixed patterns

## Status

Accepted

## Context

What blocks a move to App Service is written in the source of an app: a password in web.config, a call to the
registry, a COM component, a write to a drive, Windows authentication, state kept in memory. A full reading of that
source would need a C# and a VB compiler, the packages of the app restored, and MSBuild to evaluate the project files
and the build-time changes of web.config. That means running code from the folder, reaching package feeds and depending
on tools of a given version, which a check in a pipeline over pull requests should not do.

A migration team that reviews an app reads the same files and looks for the same few dozen forms. Most of them have
one way of being written: a type name, a call, an element or an attribute of web.config.

## Decision

1. The tool reads the files as text and runs nothing: no build, no restore, no evaluation of a project file, no code
   from the folder.
2. Each rule is a fixed pattern of src/patterns.js or a check of a tag of web.config or a project file. No pattern is
   built from the input or the configuration, and every pattern does work that grows with the length of the line.
3. Comments are blanked first by a small reader of each language that knows its strings, so a line commented out is
   not reported and text inside a string is never taken for a comment. The text keeps its length and line ends, so a
   finding points at the line and column of the source.
4. The rules are called heuristic in every document and in the notice of every report. A finding is a lead with a
   file and a line, not a proof; a clean run says only that none of the patterns matched.

## Consequences

- The tool needs no .NET SDK, no network and no packages; the same folder gives the same report on Linux, Windows and
  macOS.
- It misses what the text does not show: a path in a variable far from the write, a call through a wrapper or
  reflection, a dependency installed on the server (docs/limits.md). It may report a pattern that never runs.
- A new rule is a new pattern with a test of the form that is reported and the form next to it that is not.
