import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, csvField, escapeData, escapeProperty, frameworksText, parseArgs } from '../src/index.js';
import { GOOD, cli, columnOf, goodWith, lineOf, run, withFiles } from './helpers.js';

const WARN = goodWith({ 'Shop/Log.cs': 'class Log { void W() { EventLog.WriteEntry("Shop", "x"); } }\n' });
const ERROR = goodWith({ 'Shop/Reg.cs': 'class Reg { object R() => Registry.CurrentUser.OpenSubKey("Shop"); }\n' });
const INFO = goodWith({ 'Shop/Feed.cs': 'class Feed : BackgroundService { }\n' });

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(GOOD);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^app-service-readiness-check: \.\ninput: folder \.; 3 files of the kinds read: 1 appsettings, 1 project, 1 C#; read as UTF-8 3; 0 folders skipped; 0 excluded; 0 links not followed; 0 other files passed over\nconfig: built-in defaults: frameworks offered net20, .+ and net10\.0; minimum severity info; fail on error\nrules: hard-coded-secret \(error\); /);
  assert.match(clean.out, /\napps: 1 \(1 Ready, 0 Ready with changes, 0 Blockers\)\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['.', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(INFO, ['.', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(INFO, ['.', '--fail-on', 'info'])).code, 1);
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['.', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['.', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
  const off = await run({ ...ERROR, 'c.json': '{"rules": {"registryAccess": "off"}}' }, ['.', '--config', 'c.json']);
  assert.equal(off.code, 0);
  assert.match(off.out, /note: 1 rule is off: registry-access\n/);
});

test('cli: the folder named can be the folder of one app, deeper than the base folder', async () => {
  const r = await run(goodWith({ 'Other/Other.csproj': '<Project><PropertyGroup><TargetFramework>net5.0</TargetFramework></PropertyGroup></Project>' }), ['Shop']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^app-service-readiness-check: Shop\n/);
  assert.ok(r.out.includes('\n  Shop  Shop    net8.0     0      0        0     Ready\n'), r.out);
});

test('cli: --min-severity hides the findings below it, and the verdicts still count them', async () => {
  const r = await run(WARN, ['.', '--min-severity', 'error']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below error not shown/);
  assert.match(r.out, /note: 1 finding below error is not shown; the verdicts count it/);
  assert.match(r.out, /Ready with changes/);
});

test('cli: --exclude leaves files and folders out, from the flag and the configuration', async () => {
  const r = await run(goodWith({ 'Shop/Legacy/Reg.cs': 'Registry.SetValue("k", "v", 1);\n', 'Shop/Old.Designer.cs': 'Registry.SetValue("k", "v", 1);\n' }), ['.', '--exclude', 'Legacy', '--exclude', '*.Designer.cs']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /; 2 excluded;/);
  const c = await run(goodWith({ 'Shop/Legacy/Reg.cs': 'Registry.SetValue("k", "v", 1);\n', 'c.json': '{"exclude": ["Shop/Legacy/"]}' }), ['.', '--config', 'c.json']);
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, /; exclude Shop\/Legacy\/; /);
});

test('cli: UTF-16 files with a byte order mark are read, little and big endian, and other bytes as Latin-1', async () => {
  const web = '<configuration>\n  <system.web>\n    <sessionState mode="InProc" />\n  </system.web>\n</configuration>\n';
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(web, 'utf16le')]);
  const be = Buffer.from(le);
  for (let i = 0; i < be.length; i += 2) [be[i], be[i + 1]] = [le[i + 1], le[i]];
  for (const [bytes, name] of [[le, 'UTF-16 LE'], [be, 'UTF-16 BE']]) {
    const r = await run(goodWith({ 'Shop/Web.config': bytes }));
    assert.match(r.out, new RegExp(`read as UTF-8 3, ${name} 1;`));
    assert.match(r.out, /WARNING {2}inproc-session-state {4}Shop\/Web\.config:3\n/);
  }
  const latin = await run(goodWith({ 'Shop/Old.cs': Buffer.concat([Buffer.from('// R'), Buffer.from([0xe9]), Buffer.from('sum\nEventLog.WriteEntry("x", "y");\n')]) }));
  assert.match(latin.out, /read as UTF-8 3, Latin-1 1;/);
  assert.match(latin.out, /note: 1 file that is not valid UTF-8 was read as Latin-1/);
  assert.match(latin.out, /Shop\/Old\.cs:2\n/);
});

test('cli: exit 2 for usage errors, with the usage and nothing on standard output', async () => {
  for (const [args, message] of [
    [[], /give the folder to scan: the source folder of the app/],
    [['.', 'other'], /other: one folder per run/],
    [['.', '--bogus'], /unknown argument --bogus/],
    [['.', '--format', 'xml'], /unknown format xml \(text, json, csv or github\)/],
    [['.', '--format', 'json', '--format', 'text'], /--format was given twice/],
    [['.', '--json', '--format', 'csv'], /--json and --format csv ask for two formats; give one/],
    [['.', '--min-severity', 'notice'], /--min-severity: unknown level notice \(info, warning, error\)/],
    [['.', '--fail-on', 'fatal'], /--fail-on: unknown level fatal/],
    [['.', '--config', 'a.json', '--config', 'b.json'], /--config was given twice/],
    [['.', '--config'], /--config needs a value/],
    [['.', '--exclude', '--json'], /--exclude needs a value/],
    [['.', '--explain', '--format', 'github'], /--explain adds the sources of each finding to the text and JSON reports; the github format has no place for them/],
    [['.', '--explain', '--format', 'csv'], /the csv format has no place for them/],
    [['-'], /reading from standard input is not supported/],
    [['.', '--config', '-'], /reading from standard input is not supported/],
    [['https://example.test/app'], /give a local path; the tool never fetches a URL/],
    [['.', '--config', 'file://c.json'], /give a local path/],
    [['.', ...Array.from({ length: 101 }, () => ['--exclude', 'x']).flat()], /--exclude was given more than 100 times/]
  ]) {
    const r = await run(GOOD, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message, args.join(' '));
    assert.ok(r.err.includes('Usage: app-service-readiness-check'), args.join(' '));
    assert.equal(r.out, '');
  }
  assert.deepEqual(parseArgs(['x', '--exclude', 'a', '--exclude', 'b']).excludes, ['a', 'b']);
});

test('cli: exit 2 for input errors, with the problems and no result', async () => {
  for (const [files, args, message] of [
    [GOOD, ['missing'], /missing: no such file or folder/],
    [GOOD, ['Shop/Program.cs'], /Shop\/Program\.cs: is a file; give the folder of the app/],
    [GOOD, ['.', '--exclude', 'a\\b'], /--exclude: the glob "a\\b" holds a backslash/],
    [GOOD, ['.', '--exclude', '../up'], /has an empty part, "\." or "\.\."/],
    [{ ...GOOD, 'c.json': '{"failOm": "info"}' }, ['.', '--config', 'c.json'], /c\.json: line 1: "failOm" is not a key of the configuration; did you mean "failOn"\?/],
    [GOOD, ['.', '--config', 'nope.json'], /nope\.json: no such file or folder/],
    [GOOD, ['.', '--config', 'Shop'], /Shop: is a folder; give the file itself/]
  ]) {
    const r = await run(files, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /^app-service-readiness-check: no result, the input has (?:a problem|problems):\n/);
    assert.match(r.err, message);
    assert.equal(r.out, '');
  }
});

test('cli: a binary file, a file over its limit and an invalid UTF-16 file are error findings, and nothing in them is checked', async () => {
  const bin = await run(goodWith({ 'Shop/Lib.cs': Buffer.from([0x63, 0, 0x64]) }));
  assert.equal(bin.code, 1);
  assert.match(bin.out, /ERROR {4}unreadable-file +Shop\/Lib\.cs:1\n {11}the file cannot be read: holds binary data \(a null byte\); a UTF-16 file needs its byte order mark; nothing in it is checked/);
  assert.match(bin.out, /read as UTF-8 3, 1 not read;/);
  const big = await run(ERROR, ['.'], { maxFileBytes: 60 });
  assert.match(big.out, /Shop\/Program\.cs:1\n {11}the file cannot be read: [\d,]+ bytes is over the 60 byte limit; nothing in it is checked/);
  const utf16 = await run(goodWith({ 'Shop/Web.config': Buffer.from([0xff, 0xfe, 0x00, 0xd8]) }));
  assert.match(utf16.out, /Shop\/Web\.config:1\n {11}the file cannot be read: is not valid UTF-16/);
  const total = await run(GOOD, ['.'], { maxTotalBytes: 100 });
  assert.equal(total.code, 1);
  assert.match(total.out, /ERROR {4}scan-limit {14}\.:1\n {11}the folder holds more than 0 MB in the files of the kinds read; the walk stopped there/);
  const many = await run(GOOD, ['.'], { maxFiles: 1 });
  assert.match(many.out, /the folder holds more than 1 files of the kinds read; the walk stopped there, and the rest of the folder is not read/);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], '.');
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--config', '--exclude', '--fail-on', '--min-severity', '--format', 'github', 'csv', 'registry-access (rules.registryAccess)', 'unreadable-file (always error)', 'bin, obj, node_modules, .git, .vs', 'Verdicts: Blockers', 'Exit codes: 0 no finding at or above the fail-on level']) assert.ok(USAGE.includes(s), s);
  const version = await cli(['--version'], '.');
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const defaults = await cli(['--print-defaults'], '.');
  assert.equal(defaults.code, 0);
  assert.deepEqual(Object.keys(JSON.parse(defaults.out)), ['name', 'rules', 'allowedFrameworks', 'knownAssemblies', 'exclude', 'minSeverity', 'failOn']);
});

test('text: the apps, the rules with their counts, the findings with the fix, --explain, and the notice', async () => {
  const r = await run(goodWith({ 'Shop/Log.cs': '\nEventLog.WriteEntry("Shop", "x");\n' }), ['.']);
  assert.ok(r.out.includes('Apps (1)\n\n  app   folder  framework  error  warning  info  verdict\n  Shop  Shop    net8.0     0      1        0     Ready with changes\n'));
  assert.ok(r.out.includes('Rules (21)\n\n  rule                    level    findings\n  hard-coded-secret       error    0\n'));
  assert.ok(r.out.includes('  event-log               warning  1\n'));
  assert.match(r.out, /\n {2}WARNING {2}event-log {15}Shop\/Log\.cs:2\n {11}the code uses the Windows event log through "EventLog\.WriteEntry"\n {11}fix: log through ILogger/);
  assert.ok(r.out.includes(NOTICE));
  assert.ok(!r.out.includes('basis:'));
  const explained = await run(goodWith({ 'Shop/Log.cs': 'EventLog.WriteEntry("Shop", "x");\n' }), ['.', '--explain']);
  assert.match(explained.out, /\n {11}rule: a line of code that uses the Windows event log\n {11}basis: calls that read or write the Windows event logs .+ \(Operating system functionality in Azure App Service \(Microsoft Learn\), https:\/\/learn\.microsoft\.com\/en-us\/azure\/app-service\/operating-system-functionality\)\n {11}the tool's own choice: EventLog calls/);
  const none = await run({ 'notes.txt': 'x' });
  assert.match(none.out, /Apps \(0\)\n\n {2}none\n/);
  assert.match(none.out, /note: the folder holds no file of the kinds the tool reads/);
  assert.equal(frameworksText({ frameworks: [] }), 'none found');
});

test('json: the whole report, without the sources unless --explain', async () => {
  const r = await run(WARN, ['.', '--json']);
  const out = JSON.parse(r.out);
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'apps', 'rules', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.deepEqual(Object.keys(out.findings[0]), ['rule', 'level', 'app', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.deepEqual(Object.keys(out.apps[0]), ['name', 'folder', 'projects', 'frameworks', 'findings', 'byLevel', 'verdict']);
  assert.deepEqual(out.apps[0].projects, ['Shop/Shop.csproj']);
  assert.deepEqual(Object.keys(out.input), ['folder', 'files', 'byKind', 'encodings', 'notRead', 'skippedFolders', 'excluded', 'links', 'otherFiles']);
  assert.deepEqual(out.rules.find((x) => x.id === 'event-log'), { id: 'event-log', level: 'warning', findings: 1 });
  const explained = JSON.parse((await run(WARN, ['.', '--json', '--explain'])).out);
  assert.ok(explained.findings[0].basis.length > 0);
  assert.deepEqual(out.result, { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
  assert.deepEqual(out.totals, { findings: 1, byLevel: { error: 0, warning: 1, info: 0 }, hidden: 0, notListed: 0, apps: 1, byVerdict: { Ready: 0, 'Ready with changes': 1, Blockers: 0 } });
  assert.equal(out.tool, 'app-service-readiness-check');
});

test('csv: one row per finding, with its app and place', async () => {
  const text = 'class Reg {\n  object R() => Registry.CurrentUser.OpenSubKey("Shop, \\"Main\\"");\n}\n';
  const r = await run(goodWith({ 'Shop/Reg.cs': text, 'Shop/=Odd.cs': 'EventLog.WriteEntry("a", "b");\n' }), ['.', '--format', 'csv']);
  const rows = r.out.split('\r\n');
  assert.equal(rows[0], CSV_COLUMNS.join(','));
  assert.equal(rows[0], 'level,rule,app,file,line,column,found,fix');
  assert.ok(rows[1].startsWith(`error,registry-access,Shop,Shop/Reg.cs,2,${columnOf(text, 'Registry')},"the code uses the Windows registry through ""Registry.CurrentUser""",`), rows[1]);
  assert.ok(rows.some((x) => x.startsWith('warning,event-log,Shop,Shop/=Odd.cs,1,1,')), 'a file name that starts with = inside a path stays as it is');
  assert.equal(rows.at(-1), '');
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('=1+1'), "'=1+1");
  assert.equal(csvField(null), '');
  assert.equal(csvField(3), '3');
  assert.equal((await run(GOOD, ['.', '--format', 'csv'])).out, 'level,rule,app,file,line,column,found,fix\r\n');
});

test('github: one workflow command per finding, with its properties and message escaped, then a summary line', async () => {
  const text = 'class Log {\n  void W() { EventLog.WriteEntry("Shop", "x"); }\n}\n';
  const r = await run(goodWith({ 'Shop/Log.cs': text, 'Shop/Feed.cs': 'class Feed : BackgroundService { }\n' }), ['.', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], `::warning file=Shop/Log.cs,line=${lineOf(text, 'EventLog')},col=${columnOf(text, 'EventLog')},title=app-service-readiness-check event-log::the code uses the Windows event log through "EventLog.WriteEntry"; fix: log through ILogger or System.Diagnostics.Trace to App Service diagnostic logs or Application Insights`);
  assert.match(lines[1], /^::notice file=Shop\/Feed\.cs,line=1,col=12,title=app-service-readiness-check background-work::/);
  assert.equal(lines[2], 'app-service-readiness-check: 1 app (0 Ready, 1 Ready with changes, 0 Blockers), 2 findings; RESULT: PASS - no finding at or above error (1 warning, 1 info)');
  assert.match((await run(ERROR, ['.', '--format', 'github'])).out, /^::error file=Shop\/Reg\.cs,line=1,col=\d+,title=app-service-readiness-check registry-access::/);
  assert.equal(escapeData('a%\r\nb'), 'a%25%0D%0Ab');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
});

test('cli: a run writes nothing to disk', async () => {
  await withFiles(WARN, async (dir) => {
    const before = await readdir(resolve(dir), { recursive: true });
    for (const format of ['text', 'json', 'csv', 'github']) assert.equal((await cli(['.', '--format', format], dir)).code, 0);
    assert.deepEqual(await readdir(resolve(dir), { recursive: true }), before);
  });
});
