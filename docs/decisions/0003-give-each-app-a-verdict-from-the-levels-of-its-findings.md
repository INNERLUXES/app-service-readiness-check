# 3. Give each app a verdict from the levels of its findings

## Status

Accepted

## Context

A folder often holds several apps: a web site, an API, a worker. A migration team plans them one by one and wants a
short answer for each: can it move as it is, does it need changes, or is something in the way. Azure Migrate answers
with Ready, Ready with conditions, Not ready and Unknown, from data it collects on the servers. This tool has only the
source, and its rules are heuristic, so it cannot claim the same answer.

A score made of weights per rule would be hard to explain and easy to argue with. The levels of the rules are already
the judgement of the tool, documented for each rule and set by each team in its configuration.

## Decision

1. An app is a folder with a .csproj or .vbproj file; files belong to the deepest such folder above them, and files
   under none make one app at the folder scanned.
2. The verdict of an app is Blockers when it has a finding at the level `error`, Ready with changes when it has a
   `warning` and no error, and Ready otherwise. Findings at `info` are notes to check and never change the verdict.
3. The verdict uses the levels after the configuration, counts every finding of the app whatever `--min-severity`
   shows, and leaves out rules set to `off`.
4. A file that could not be read is an error finding of the app it sits in, so an app is never Ready because a part of
   it was not read.
5. The verdict is shown next to the counts of the app, and the exit code of the run still comes from `failOn` alone.

## Consequences

- A team changes what blocks an app by changing the level of a rule, in a file a reviewer sees, and the verdict follows.
- The names differ from those of Azure Migrate on purpose, so a reader does not take the verdict for its assessment.
- A verdict of Ready is a statement about the patterns of the tool, not about the app; the notice of every report says
  that a clean result is not a migration assessment and not a certification.
