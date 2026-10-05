# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A check of an app before a move to App Service is tempting to tie to the calendar: the day support of a framework
ends, the age of a package, the date a runtime leaves the portal, the last change of a file. Each of these would make
the same folder give a different result on a different day, so a pipeline that passed yesterday could fail today with
no change to the repository, and two people reading the same commit could see two reports. The output could never be
saved and compared.

The checks do not need a date. Whether web.config holds a password, whether the code writes to `C:\`, whether a
project targets a framework on a list: all of it can be read from the folder as it is. When a framework leaves support
is a fact of its own that changes the list of frameworks, and the list is kept in the repository, where a change to it
is reviewed like a change to code.

## Decision

1. The tool reads no clock, no time zone and no locale. The same folder and configuration give the same output on
   every machine and on every day.
2. The list of frameworks taken as offered is a list of names, not of dates. It changes by a commit, and a team adds a
   framework with `allowedFrameworks`, where a reviewer sees it.
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the examples, not the documents, not the comments of the code. `npm run check` and a test fail on any number that
   reads like a year. Version numbers such as Node 22, .NET 8, RFC 4180 or 1.0.0 are not years and are fine, and web
   addresses that hold a year are left out of the sources.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- The list of frameworks goes out of date between releases. The README, docs/inputs.md and the source of the list say
  so, and ask the reader to check it against the App Service pages.
- The example files carry no date, and their values are chosen so that no port, version or count reads like a year;
  the old project file of the messy example has no MSBuild namespace, because its address holds a year.
