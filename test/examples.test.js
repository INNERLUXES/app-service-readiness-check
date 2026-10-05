import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const TRACKING = 'examples/messy/Pellworth.Tracking';
const RATES = 'examples/messy/Pellworth.Rates.Api';

test('examples: the messy folder fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean folder passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean folder also meets the configuration of the messy one');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the rules that fire on the messy folder, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const at = async (file, needle, n = 1) => {
    const lines = (await readFile(resolve(root, file), 'utf8')).split('\n');
    return `${file}:${lines.map((l, i) => [l, i]).filter(([l]) => l.includes(needle))[n - 1][1] + 1}`;
  };
  const byRule = {};
  for (const x of report.findings) (byRule[x.rule] ??= []).push(x.at);
  const web = `${TRACKING}/Web.config`;
  const code = (name) => `${TRACKING}/${name}`;
  assert.deepEqual(byRule, {
    'unsupported-framework': [await at(code('Pellworth.Tracking.csproj'), '<TargetFrameworkVersion>')],
    'com-interop': [await at(code('Pellworth.Tracking.csproj'), '<COMReference'), await at(code('Services/CarrierSettings.cs'), 'DllImport'), await at(code('Services/LabelPrinter.vb'), 'CreateObject')],
    'registry-access': [await at(code('Services/CarrierSettings.cs'), 'Registry.LocalMachine')],
    'hard-coded-secret': [await at(web, 'TrackingDb'), await at(web, 'AccountKey=')],
    'non-standard-port': [await at(`${RATES}/Program.cs`, 'UseUrls'), await at(`${RATES}/appsettings.json`, '"Urls"')],
    'inproc-session-state': [await at(`${RATES}/Program.cs`, 'AddDistributedMemoryCache'), await at(web, '<sessionState')],
    'event-log': [await at(code('Global.asax.cs'), 'EventLog.SourceExists'), await at(code('Global.asax.cs'), 'EventLog.CreateEventSource'), await at(code('Global.asax.cs'), 'EventLog.WriteEntry')],
    msmq: [await at(code('Pellworth.Tracking.csproj'), 'System.Messaging'), await at(code('Services/LabelPrinter.vb'), 'System.Messaging'), await at(code('Services/LabelPrinter.vb'), 'FormatName:'), await at(code('Services/LabelPrinter.vb'), 'New MessageQueue')],
    'local-disk-write': [await at(code('Services/ManifestExporter.cs'), 'File.WriteAllText(folder'), await at(code('Services/ManifestExporter.cs'), 'File.Copy'), await at(code('Services/ManifestExporter.cs'), 'upload.SaveAs')],
    'local-path-setting': [await at(web, 'ManifestExportFolder'), await at(web, 'pickupDirectoryLocation')],
    'gac-assembly': [await at(web, 'Pellworth.Legacy.Barcode')],
    'windows-authentication': [await at(web, '<authentication'), await at(web, '<identity')],
    'smtp-pickup-directory': [await at(web, '<smtp')],
    'background-work': [await at(`${RATES}/Program.cs`, 'AddHostedService'), await at(`${RATES}/RateRefresher.cs`, 'BackgroundService'), await at(code('Global.asax.cs'), 'QueueBackgroundWorkItem')],
    'custom-module-handler': [await at(web, 'YardAudit'), await at(web, 'YardAudit', 2)],
    'isapi-extension': [await at(web, 'IsapiModule')],
    'url-rewrite': [await at(web, '<rule ')]
  });
  assert.deepEqual(report.apps.map((a) => [a.name, a.verdict, a.frameworks.map((f) => f.shown)]), [['Pellworth.Rates.Api', 'Ready with changes', ['net7.0']], ['Pellworth.Tracking', 'Blockers', ['v4.0 (net40)']]]);
  assert.equal(report.input.excluded, 1);
  assert.deepEqual(report.input.skippedFolders, { count: 1, names: ['obj'] });
});

test('examples: the same files written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'app-service-readiness-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    const walk = async (sub) => {
      for (const e of await readdir(resolve(dir, sub), { withFileTypes: true })) {
        const rel = `${sub}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== 'output') await walk(rel);
        } else if (!e.name.endsWith('.md')) {
          const text = (await readFile(resolve(dir, rel), 'utf8')).split('\r\n').join('\n');
          await writeFile(resolve(dir, rel), text.split('\n').join('\r\n'));
        }
      }
    };
    await walk('examples');
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
