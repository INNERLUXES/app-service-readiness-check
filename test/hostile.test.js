import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, MAX_PROBLEMS, blankComments, compileGlob, globMatches, scanFile, xmlTags } from '../src/index.js';
import { GOOD, cli, goodWith, run, withFiles } from './helpers.js';

// Hostile input: folders and files built to exhaust the memory, the stack or the time, to make the tool follow a link
// out of the folder or round a loop, to rewrite the terminal, to start a second workflow command, to slip a formula
// into a spreadsheet, to show a secret or to change how objects behave. Each heavy test also checks the time, because
// work that grows faster than the input is a failure even when the answer is right. Tests that need a symbolic link,
// a device or file permissions are guarded with process.platform, and none of them asserts a line: lines are asserted
// in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

test('hostile: a source file of two hundred thousand lines, each with a pattern, is scanned in seconds', LIMIT, async () => {
  const line = 'Registry.SetValue("k", "v", 1); File.WriteAllText(@"C:\\x\\y.txt", s); app.Listen(IPAddress.Any, 5000); // EventLog.WriteEntry\n';
  const text = line.repeat(200000);
  const found = await fast(() => scanFile(text, 'cs').findings, 20000);
  assert.equal(found.length, 600000);
});

test('hostile: long lines of quotes, backslashes, comment marks and listen calls are read in one pass', LIMIT, async () => {
  for (const text of ['"'.repeat(500001), '\\'.repeat(500000), `"${'\\"'.repeat(200000)}`, '/*'.repeat(200000), '//'.repeat(200000), `@"${'""'.repeat(200000)}`, `${'Listen(a,'.repeat(100000)}`, `UseUrls(${'"http://h:1'.repeat(100000)})`, `${'File.Copy('.repeat(50000)}\n`.repeat(4), "'".repeat(500000)]) {
    for (const kind of ['cs', 'vb', 'asax', 'appsettings']) await fast(() => scanFile(text, kind));
  }
});

test('hostile: XML with a hundred thousand tags, nesting ten thousand deep, open tags and quotes is read in one pass', LIMIT, async () => {
  const wide = `<configuration>${'<add key="a" value="C:\\x" />'.repeat(100000)}</configuration>`;
  assert.equal((await fast(() => scanFile(wide, 'web-config'))).findings.length, 100000);
  const deep = `${'<a>'.repeat(10000)}<sessionState mode="InProc" />${'</a>'.repeat(10000)}`;
  assert.equal((await fast(() => scanFile(deep, 'web-config'))).findings.length, 1);
  for (const text of ['<'.repeat(500000), `<a ${'b="'.repeat(100000)}`, '<!--'.repeat(100000), `<a${' x'.repeat(200000)}>`, '<![CDATA['.repeat(100000)]) await fast(() => xmlTags(blankComments(text, 'xml')));
});

test('hostile: globs with many stars are matched against long paths in one pass per part', LIMIT, async () => {
  const glob = compileGlob(`${'*a'.repeat(90)}b`);
  const path = `${'a'.repeat(5000)}/x`;
  assert.equal(await fast(() => globMatches(glob, path)), false);
  assert.equal(await fast(() => globMatches(compileGlob('**/'.repeat(60).slice(0, -1)), `${'a/'.repeat(1500)}b`)), true);
});

test('hostile: three thousand files in a hundred folders are walked and scanned in seconds', LIMIT, async () => {
  const files = { ...GOOD };
  for (let d = 0; d < 100; d += 1) for (let f = 0; f < 30; f += 1) files[`Shop/f${d}/c${f}.cs`] = 'EventLog.WriteEntry("a", "b");\n';
  const r = await fast(() => run(files, ['.', '--json']), 60000);
  const out = JSON.parse(r.out);
  assert.equal(out.input.files, 3003);
  assert.equal(out.totals.findings, 3000);
  assert.equal(out.findings.length, LIMITS.maxFindingsPerRule);
  assert.equal(out.totals.notListed, 2500);
  assert.match(out.notes.join('\n'), /2,500 findings past the limit of 500 per rule are counted but not listed/);
});

test('hostile: a configuration over its limit stops the run, and thirty problems list twenty and a count', LIMIT, async () => {
  const big = await run({ ...GOOD, 'c.json': ' '.repeat(LIMITS.maxConfigBytes + 1) }, ['.', '--config', 'c.json']);
  assert.equal(big.code, 2);
  assert.match(big.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const c = await run({ ...GOOD, 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }, ['.', '--config', 'c.json']);
  assert.equal(c.code, 2);
  assert.match(c.err, /\n {2}and 10 more\n$/);
  assert.equal(c.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
});

test('hostile: CRLF, CR, a byte order mark and UTF-16 give the same report as LF', async () => {
  const web = '<configuration>\n  <appSettings>\n    <add key="DbPassword" value="x-y-z" />\n  </appSettings>\n  <system.web>\n    <authentication mode="Windows" />\n  </system.web>\n</configuration>\n';
  const code = 'class A\n{\n    void B()\n    {\n        // EventLog.WriteEntry("a", "b");\n        Registry.SetValue("k", "v", 1);\n    }\n}\n';
  const lf = await run(goodWith({ 'Shop/Web.config': web, 'Shop/A.cs': code }), ['.', '--json']);
  assert.equal(JSON.parse(lf.out).totals.findings, 3);
  const plain = (out) => out.replace(/"encodings": \{[^}]+\}/, '');
  for (const eol of ['\r\n', '\r']) {
    const r = await run(goodWith({ 'Shop/Web.config': `${String.fromCharCode(0xfeff)}${web.split('\n').join(eol)}`, 'Shop/A.cs': code.split('\n').join(eol) }), ['.', '--json']);
    assert.equal(r.out, lf.out, JSON.stringify(eol));
  }
  const utf16 = await run(goodWith({ 'Shop/Web.config': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(web, 'utf16le')]), 'Shop/A.cs': code }), ['.', '--json']);
  assert.equal(plain(utf16.out), plain(lf.out));
});

test('hostile: a secret never reaches any report, in any format, or an error message', async () => {
  const secrets = ['Tiger-Lily-9', 'c2hvcC1rZXk', 'Plum-Gate-4', 'Fern-Hill-2', 'Opal-Moon-3'];
  const files = goodWith({
    'Shop/Web.config': '<configuration>\n  <connectionStrings><add name="M" connectionString="Server=d;Password=Tiger-Lily-9" /></connectionStrings>\n  <appSettings><add key="Blob" value="AccountKey=c2hvcC1rZXk" /><add key="Path" value="C:\\Data;Password=Fern-Hill-2" /></appSettings>\n</configuration>\n',
    'Shop/appsettings.json': '{ "Smtp": { "Password": "Plum-Gate-4" }, "Urls": "http://u:Opal-Moon-3@h:5000" }\n'
  });
  for (const args of [['.'], ['.', '--explain'], ['.', '--json', '--explain'], ['.', '--format', 'csv'], ['.', '--format', 'github']]) {
    const r = await run(files, args);
    assert.equal(r.code, 1, r.err);
    for (const s of secrets) assert.ok(!r.out.includes(s) && !r.err.includes(s), `${args.join(' ')}: ${s}`);
  }
});

test('hostile: control, escape and direction characters in file names and values never reach the reports', async () => {
  const escape = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const files = goodWith({ [`Shop/A${rlo}.cs`]: `Registry.SetValue("k${escape}[2J", "v", 1);\n`, 'Shop/Web.config': `<configuration><system.webServer><modules><add name="M${ls}" type="X${escape}]0;title" /></modules></system.webServer></configuration>\n` });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, ['.', ...(format === 'text' ? ['--explain'] : ['--format', format])]);
    assert.equal(r.code, 1, r.err);
    for (const c of [escape, rlo, ls]) assert.ok(!r.out.includes(c) && !r.err.includes(c), `${format}: ${c.charCodeAt(0)}`);
  }
  const bad = await run(GOOD, [`missing${rlo}`]);
  assert.equal(bad.code, 2);
  assert.ok(!bad.err.includes(rlo));
});

test('hostile: a text cannot start a second workflow command', async () => {
  const r = await run(goodWith({ 'Shop/Web.config': '<configuration><system.webServer><modules><add name="%0A::error::x" type="Shop.M&#10;::error file=x::y" /></modules></system.webServer></configuration>\n' }), ['.', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.equal(lines.length, 2, 'one finding and the summary line');
  assert.ok(lines.every((l) => l.startsWith('::notice ') || l.startsWith('app-service-readiness-check: ')), r.out);
  assert.ok(lines[0].includes('"%250A::error::x"'));
});

test('hostile: a file name that starts with a formula character is not a formula in the CSV report', async () => {
  const r = await run({ '@Shop/=Shop.csproj': '<Project><PropertyGroup><TargetFramework>net5.0</TargetFramework></PropertyGroup></Project>' }, ['.', '--format', 'csv']);
  assert.equal(r.code, 1, r.err);
  const rows = r.out.split('\r\n');
  assert.ok(rows[1].startsWith("error,unsupported-framework,'=Shop,'@Shop/=Shop.csproj,"), rows[1]);
  assert.ok(rows.every((x) => !/(?:^|,)[=+\-@]/.test(x)), 'no field starts with a formula character');
});

test('hostile: constructor, toString and __proto__ as names of files, settings, attributes and keys are only data', async () => {
  const r = await run({ 'toString/__proto__.csproj': '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>', 'toString/constructor.cs': 'class X { }\n', 'toString/appsettings.json': '{ "__proto__": { "Password": "x-1" }, "constructor": "C:\\\\x" }\n', 'toString/Web.config': '<configuration><appSettings><add key="__proto__" value="D:\\x" __proto__="1" /></appSettings></configuration>\n' }, ['.', '--json']);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.apps.map((a) => a.name), ['__proto__']);
  assert.deepEqual(out.findings.map((f) => f.rule).sort(), ['hard-coded-secret', 'local-path-setting', 'local-path-setting']);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal({}.Password, undefined);
  const cfg = await run({ ...GOOD, 'c.json': '{"rules": {"toString": "off", "__proto__": "off"}, "constructor": 1}' }, ['.', '--config', 'c.json']);
  assert.equal(cfg.code, 2);
  assert.match(cfg.err, /"toString" is not a key of rules/);
  assert.match(cfg.err, /"__proto__" is not a key of rules/);
  assert.match(cfg.err, /"constructor" is not a key of the configuration/);
});

test('hostile: empty files and files that hold nothing the tool reads are scanned without a crash', async () => {
  const r = await run({ 'A/A.csproj': '', 'A/Web.config': '', 'A/appsettings.json': '', 'A/packages.config': '', 'A/Global.asax': '', 'A/x.cs': '', 'A/y.vb': '', 'A/z.cs': '\n\n\n' }, ['.', '--json']);
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.equal(out.input.files, 8);
  assert.deepEqual(out.apps.map((a) => [a.name, a.frameworks, a.verdict]), [['A', [], 'Ready']]);
});

test('hostile: a symbolic link inside the folder is counted and never followed, to a file, out of the folder or round a loop', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ ...GOOD, 'outside/Secret.cs': 'Registry.SetValue("k", "v", 1);\n' }, async (dir) => {
    await symlink(resolve(dir, 'outside'), resolve(dir, 'Shop/out'));
    await symlink(resolve(dir, 'Shop'), resolve(dir, 'Shop/loop'));
    await symlink(resolve(dir, 'outside/Secret.cs'), resolve(dir, 'Shop/Linked.cs'));
    const r = await cli(['Shop', '--json'], dir);
    assert.equal(r.code, 0, r.out);
    const out = JSON.parse(r.out);
    assert.equal(out.input.links, 3);
    assert.equal(out.input.files, 3);
    assert.match(out.notes.join('\n'), /3 symbolic links are not followed/);
  });
});

test('hostile: a folder or a configuration named through a symbolic link is refused', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ ...GOOD, 'c.json': '{}' }, async (dir) => {
    await symlink(resolve(dir, 'Shop'), resolve(dir, 'shop-link'));
    await symlink(resolve(dir, 'c.json'), resolve(dir, 'c-link.json'));
    const r = await cli(['shop-link'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /shop-link: is a symbolic link, which is not followed/);
    const c = await cli(['Shop', '--config', 'c-link.json'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /c-link\.json: is a symbolic link/);
  });
});

test('hostile: a device named as the folder or the configuration is refused', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero to name as an input');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    const config = await fast(() => cli(['Shop', '--config', '/dev/zero'], dir));
    assert.equal(config.code, 2);
    assert.match(config.err, /is not a regular file or folder/);
    const input = await fast(() => cli(['/dev/zero'], dir));
    assert.equal(input.code, 2);
    assert.match(input.err, /is not a regular file or folder/);
  });
});

test('hostile: a file or a folder without read access is an error finding', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not take away read access with chmod');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user can read a file without read access');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    await mkdir(resolve(dir, 'Shop/Locked'));
    await writeFile(resolve(dir, 'Shop/Locked/A.cs'), 'x');
    await chmod(resolve(dir, 'Shop/Program.cs'), 0o000);
    await chmod(resolve(dir, 'Shop/Locked'), 0o000);
    try {
      const r = await cli(['.'], dir);
      assert.equal(r.code, 1);
      assert.match(r.out, /the file cannot be read: cannot be read \(EACCES\)/);
      assert.match(r.out, /the folder cannot be read \(EACCES\)/);
    } finally {
      await chmod(resolve(dir, 'Shop/Program.cs'), 0o644);
      await chmod(resolve(dir, 'Shop/Locked'), 0o755);
    }
  });
});
