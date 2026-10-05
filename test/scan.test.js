import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABSOLUTE_PATH, APP_PATH, BIND, CODE_PATTERNS, FIRST_ARG_PORT, LOOK_BACK, PLATFORM_TYPE, SECOND_ARG_PORT, STRING_CS, STRING_VB, TEMP_PATH, URL_PORT, WEB_PORTS, WRITE, FAMILIES, SECRET_KEYS, connectionSecrets, frameworkOf, isPlaceholder, isSecretName, linesOf, maskSecrets, portsOf, scanFile, scanPackages, scanProject, scanWebConfig, snippet, splitFrameworks, stringsOf } from '../src/index.js';

// What one file gives the rules across an app: the frameworks, packages and assemblies, and the small readers of
// frameworks, secrets, ports and strings.

test('frameworks: every form of a target framework brought to its short form, and the forms the tool does not read', () => {
  const t = (v) => frameworkOf(v);
  assert.deepEqual(t('v4.7.2'), { tfm: 'net472', family: 'netfx' });
  assert.deepEqual(t('4.0'), { tfm: 'net40', family: 'netfx' });
  assert.deepEqual(t(' V3.5 '), { tfm: 'net35', family: 'netfx' });
  assert.deepEqual(t('net48'), { tfm: 'net48', family: 'netfx' });
  assert.deepEqual(t('NET481'), { tfm: 'net481', family: 'netfx' });
  assert.deepEqual(t('netcoreapp3.1'), { tfm: 'netcoreapp3.1', family: 'netcore' });
  assert.deepEqual(t('net8.0'), { tfm: 'net8.0', family: 'net' });
  assert.deepEqual(t('net10.0-windows'), { tfm: 'net10.0', family: 'net' });
  assert.deepEqual(t('net6.0-windows10.0.17763.0'), { tfm: 'net6.0', family: 'net' });
  assert.deepEqual(t('netstandard2.0'), { tfm: 'netstandard2.0', family: 'netstandard' });
  for (const v of ['', 'net', 'v5.0', 'net4.8', 'netcoreapp5.0', 'net8', 'dotnet8', '$(TargetFramework)', 'net8.0;net9.0']) assert.equal(t(v), null, v);
  assert.deepEqual(splitFrameworks(' net8.0; ;net48 '), ['net8.0', 'net48']);
  assert.deepEqual(Object.keys(FAMILIES), ['netfx', 'netcore', 'net', 'netstandard']);
});

test('secrets: the names, the parts of a connection string, the placeholders and the mask', () => {
  assert.deepEqual(SECRET_KEYS, ['password', 'pwd', 'accountkey', 'sharedaccesskey']);
  for (const n of ['Password', 'SmtpPassword', 'smtp.password', 'ConnectionStrings:Pwd', 'Storage_Account_Key', 'Shared Access Key']) assert.ok(isSecretName(n), n);
  for (const n of ['PasswordLength', 'User', 'SharedAccessKeyName', 'KeyVault', 'pass']) assert.ok(!isSecretName(n), n);
  for (const v of ['', '  ', '@Microsoft.KeyVault(SecretUri=x)', '$(DbPassword)', '${DB_PASSWORD}', '#{DbPassword}#', '#{DbPassword}', '%DB_PASSWORD%', '__DbPassword__', '{password}', '<password>', '****']) assert.ok(isPlaceholder(v), v);
  for (const v of ['hunter-2', 'Pa$$word', '{not closed', '%a b%']) assert.ok(!isPlaceholder(v), v);
  const cs = 'Server=x;User ID=u;Password=p1;Pwd="q";AccountKey=;SharedAccessKey=#{K}#';
  assert.deepEqual(connectionSecrets(cs), [{ key: 'Password', at: cs.indexOf('Password') }, { key: 'Pwd', at: cs.indexOf('Pwd') }]);
  assert.deepEqual(connectionSecrets(' Password = \'a;b\''), [{ key: 'Password', at: 1 }]);
  assert.deepEqual(connectionSecrets('no secret here'), []);
  assert.equal(maskSecrets('Server=x;Password=hunter2;pwd = "a b";AccountKey=k==;Shared Access Key: z'), 'Server=x;Password=***;pwd = ***;AccountKey=***;Shared Access Key: ***');
  assert.equal(snippet(`a\n  b ${'c'.repeat(80)}`, 10), 'a b ccc...');
  assert.equal(snippet('Password=hunter2'), 'Password=***');
});

test('ports and strings: the ports a line binds, and the strings of C# and VB as written on the disk', () => {
  const urls = 'UseUrls("http://*:5000", "https://localhost:5001", "http://*:80")';
  assert.deepEqual(portsOf(urls), { ports: [5000, 5001], index: urls.indexOf('5000') });
  assert.deepEqual(portsOf('Listen(IPAddress.Any, 70000)'), { ports: [], index: -1 });
  assert.deepEqual(portsOf('ListenAnyIP(5000); ListenLocalhost(5000)'), { ports: [5000], index: 12 });
  assert.deepEqual(stringsOf('a("C:\\\\x\\\\y", @"\\\\s\\h""q", "\\"")', 'cs'), ['C:\\x\\y', '\\\\s\\h"q', '\\"']);
  assert.deepEqual(stringsOf('a("C:\\x\\", "say ""hi""")', 'vb'), ['C:\\x\\', 'say "hi"']);
  assert.deepEqual(linesOf('a\r\nb\rc\n'), [{ start: 0, line: 'a' }, { start: 3, line: 'b' }, { start: 5, line: 'c' }, { start: 7, line: '' }]);
});

test('project: the frameworks of every element with their places, the packages and the references with a HintPath', () => {
  const text = '<Project>\n  <PropertyGroup>\n    <TargetFrameworks>net48;net8.0</TargetFrameworks>\n    <TargetFrameworkVersion>v4.6.1</TargetFrameworkVersion>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageReference Include="Serilog" Version="3.0.0" />\n    <Reference Include="Shop.Barcode, Version=2.0.0.0">\n      <HintPath>lib\\Shop.Barcode.dll</HintPath>\n    </Reference>\n    <Reference Include="Shop.Gac" />\n  </ItemGroup>\n</Project>\n';
  const { facts, findings } = scanProject(text);
  assert.deepEqual(facts.frameworks.map((f) => [f.value, text.slice(f.offset, f.offset + f.value.length), f.from]), [['net48', 'net48', '<TargetFrameworks>'], ['net8.0', 'net8.0', '<TargetFrameworks>'], ['v4.6.1', 'v4.6.1', '<TargetFrameworkVersion>']]);
  assert.deepEqual(facts.packages, ['Serilog', 'Shop.Barcode']);
  assert.deepEqual(findings, []);
  assert.deepEqual(scanPackages('<packages>\n  <package id="Dapper" version="1.0.0" />\n  <package version="1" />\n  <!-- <package id="Old" version="1" /> -->\n</packages>').facts.packages, ['Dapper']);
});

test('web.config: the assemblies it compiles against and the frameworks of compilation and httpRuntime, commented parts left out', () => {
  const text = '<configuration>\n  <system.web>\n    <compilation targetFramework="4.5">\n      <assemblies>\n        <add assembly="Shop.Gac, Version=1.0.0.0" />\n        <add assembly="*" />\n        <!-- <add assembly="Old.Gac" /> -->\n      </assemblies>\n    </compilation>\n    <httpRuntime targetFramework="4.5" />\n  </system.web>\n</configuration>\n';
  const { facts } = scanWebConfig(text);
  assert.deepEqual(facts.assemblies.map((a) => a.name), ['Shop.Gac']);
  assert.deepEqual(facts.frameworks.map((f) => [f.value, f.from]), [['4.5', '<compilation targetFramework>'], ['4.5', '<httpRuntime targetFramework>']]);
  assert.throws(() => scanFile('x', 'xlsx'), /unknown kind xlsx/);
  assert.deepEqual(scanFile('<packages />', 'packages').facts, { packages: [] });
});

test('patterns: every code pattern names a rule, and the paths, writes and ports read what docs/method.md says', () => {
  assert.deepEqual(CODE_PATTERNS.map((p) => p.rule), ['registry-access', 'com-interop', 'windows-authentication', 'smtp-pickup-directory', 'msmq', 'event-log', 'background-work', 'inproc-session-state', 'raw-socket']);
  for (const p of CODE_PATTERNS) assert.ok(!p.re.global && p.lead.startsWith('the code '), p.rule);
  for (const s of ['C:\\x', 'd:/x', '\\\\server\\share', '\\\\\\\\server', '/var/x', '/mnt/x', '/data/x']) assert.ok(ABSOLUTE_PATH.test(s), s);
  for (const s of ['x/C:\\', '~/App_Data', '/tmp/x', '/api/v1', 'http://x', '..\\x', 'C:x']) assert.ok(!ABSOLUTE_PATH.test(s), s);
  for (const s of ['File.WriteAllTextAsync(', 'Directory.Move (', 'new FileStream(', 'img.Save(', 'FileSystem.CopyFile(']) assert.ok(WRITE.test(s), s);
  for (const s of ['File.ReadAllText(', 'db.SaveChanges(', 'File.Exists(', 'new StreamReader(']) assert.ok(!WRITE.test(s), s);
  assert.ok(TEMP_PATH.test('Path.GetTempPath()') && APP_PATH.test('Server.MapPath("~")') && BIND.test('Prefixes.Add("x")'));
  assert.deepEqual([LOOK_BACK, WEB_PORTS], [3, [80, 443]]);
  assert.ok(PLATFORM_TYPE.test(' System.Web.X') && !PLATFORM_TYPE.test('Shop.X'));
  for (const re of [STRING_CS, STRING_VB, URL_PORT, FIRST_ARG_PORT, SECOND_ARG_PORT]) assert.ok(re.global);
});
