# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "app-service-readiness-check security", or use private
vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up source folder or configuration that shows the problem, the command you ran, what you expected
and what happened. Use made-up companies, apps, hosts and people, never the source of a real organisation, and never a
real password, key, host name or address, even an old one.

## Scope

In scope:

- an input that makes the tool read a file outside the folder and the configuration it was given, follow a symbolic
  link or a junction, or walk round a loop
- an input that makes the tool open a network connection, build or run anything it reads, or evaluate any part of a
  file
- an input that makes the tool write a file
- a secret of web.config or appsettings.json that reaches a report, in any format, or an error message
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large or
  very many files, folders nested deep, long runs of quotes or comment marks, XML nested deep or a glob with many stars
- binary or invalid input that the tool reads as if it were text
- a file the tool fails to read and passes over without an error finding
- a run that passes at a `failOn` level although the folder holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether a finding is a real blocker and whether an
app runs on App Service (a clean result is not a migration assessment and not a certification), who may change the
configuration in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
