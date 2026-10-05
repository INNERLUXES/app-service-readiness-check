# Threat model

## What the tool touches

- It walks the folder named on the command line and reads the files of the kinds of docs/inputs.md in it, and the
  configuration named with `--config`. Nothing else is opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, follows no symbolic link, evaluates nothing it reads, builds nothing, starts no
  program and reads no clock. The code it reads is only text: nothing in it is ever run.

## What the input may hold

The folder is the source of an app, and in a pipeline that checks every pull request it may be written by whoever
opened the pull request. Through it, a person can try to:

- make the tool read outside the folder or walk forever: a symbolic link or a junction to another folder, a link back
  to a parent folder that makes a loop, a file swapped for a link between the walk and the read, a path written as a web
  address;
- exhaust the memory, the stack or the time: files of megabytes, hundreds of thousands of files, folders nested very
  deep, lines of hundreds of thousands of quotes, backslashes or comment marks, XML with a hundred thousand tags or
  nested very deep, globs with many stars;
- get a secret printed: a password or an account key in web.config or appsettings.json, which a careless report would
  copy into a log of the pipeline;
- move the result: a rule set to off, a framework added, an assembly called known, a folder excluded, `failOn` raised,
  a line that looks commented out but is not, or one that is but looks live;
- slip in something that is not text: a binary file renamed to `.cs`, bytes that are not valid in their encoding;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name or in any value;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: a file name, an app name or a value that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the report is opened;
- change how objects behave: a file, a setting, an attribute or a key named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read outside the folder or walk a loop | The walk counts every link it meets and follows none; the folder and the configuration named on the command line are looked at without following a link, and a link is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Tests put links to a file, out of the folder and back to a parent in the folder |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, the code read is only text, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Files have size limits checked on the open handle before they are read; the walk has limits on files, entries, depth and bytes and keeps a list of its own, with no recursion; the readers of comments and XML read each character a fixed number of times with no recursion; the XML reader limits tags and depth; every pattern does work that grows with the line, with bounded repeats; a glob is matched with one pass per part over a list of places; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input, a glob or the configuration; a test looks for `new RegExp` in src |
| A secret reaches a log | A finding of a secret names its key and says the value is masked; every text a report takes from the input goes through a mask of the secret keys. A test puts secrets in web.config and appsettings.json and checks every format and the error output |
| The result is moved through the input or the configuration | A file or folder that cannot be read and a walk past its limits are error findings that cannot be set off; a rule set to off is named in a note; comments are blanked by a reader of each language that knows its strings, so text inside a string is never taken for a comment. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte without a UTF-16 byte order mark makes the file an error finding, and so does a UTF-16 file that is not valid; other bytes are read as Latin-1, and the report counts such files |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a file name and in the values, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error::` and an encoded line break with `::error file=` into web.config |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from a folder you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | Names are kept in lists, maps and sets, the readers define own properties, and names are looked up with `Object.hasOwn`. A test uses `__proto__`, `constructor` and `toString` as names of files, settings, attributes and keys |
| A device or a pipe hangs the tool | A path that is not a regular file or folder is refused before it is read, and the walk passes over every entry that is not a file or a folder |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the app runs on App Service, whether a finding is a real blocker, what the code does at run time, what is
installed on the server the app runs on today (docs/limits.md), who may change the configuration in your repository,
and where your pipeline keeps the output.

A clean result is not a migration assessment and not a certification.
