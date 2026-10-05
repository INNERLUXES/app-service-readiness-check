// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// source folders to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean'];
const TRACKING = 'examples/messy/Pellworth.Tracking';
const RATES = 'examples/messy/Pellworth.Rates.Api';

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy folder: the counts, the apps with their verdicts, one finding of every rule that
// fires, and the result.
export const EXPECTED = [
  'input: folder examples/messy; 12 files of the kinds read: 1 web.config, 1 appsettings, 2 project, 1 packages.config, 1 Global.asax, 5 C#, 1 VB; read as UTF-8 12; 1 folder skipped (obj); 1 excluded',
  'config: examples/config.json (Pellworth readiness review): frameworks offered',
  'net7.0 (1 from allowedFrameworks); exclude Proxies',
  'apps: 2 (0 Ready, 1 Ready with changes, 1 Blockers)',
  'findings: 34 (7 error, 20 warning, 7 info)',
  `Pellworth.Rates.Api  ${RATES}  net7.0        0      3        2     Ready with changes`,
  `Pellworth.Tracking   ${TRACKING}   v4.0 (net40)  7      17       5     Blockers`,
  'the app targets v4.0 (net40), .NET Framework, which is not on the list of frameworks the tool takes as offered by App Service',
  'the project references the COM component "PellworthLabelPrint"',
  'the code calls COM or native code through "DllImport"',
  'the code uses the Windows registry through "Registry.LocalMachine"',
  'the code calls COM or native code through "CreateObject("',
  'the connection string "TrackingDb" holds Password= with a secret written in the file; the value is masked',
  'the setting "ProofOfDeliveryStorage" holds AccountKey= with a secret written in the file; the value is masked',
  'the code binds the port 5080',
  'the setting "Urls" binds the ports 5080 and 5443',
  'the code keeps its cache and state in the memory of one instance through "AddDistributedMemoryCache("',
  'the code uses the Windows event log through "EventLog.WriteEntry"',
  'the project references System.Messaging, the MSMQ library',
  'the code uses MSMQ through "New MessageQueue"',
  'the code writes a file through "File.WriteAllText(" to the local path "C:\\Pellworth\\Exports\\" (named 2 lines above)',
  'the code writes a file through "File.Copy(" to the local path "\\\\fs01\\manifests\\archive\\"',
  'the code writes a file through ".SaveAs(" to a path in the folder of the app ("Server.MapPath")',
  'web.config sets the setting "ManifestExportFolder" to "D:\\Pellworth\\Manifests", a local path',
  'web.config compiles against the assembly "Pellworth.Legacy.Barcode"',
  'web.config sets <authentication mode="Windows">',
  'web.config sets <identity impersonate="true">',
  'web.config sets <sessionState mode="InProc">',
  'web.config sends mail with deliveryMethod="SpecifiedPickupDirectory"',
  'the code runs work in the background through "QueueBackgroundWorkItem("',
  'the code runs work in the background through ": BackgroundService"',
  'web.config adds the HTTP module "YardAudit" of type "Pellworth.Tracking.Modules.YardAuditModule"',
  'web.config maps the handler "ManifestImage" to an ISAPI extension',
  'web.config has the URL Rewrite rule "Old tracking links"',
  'not a migration assessment and not a certification',
  'RESULT: FAIL - 7 findings at or above error (7 error, 20 warning, 7 info)'
];
// What must not be reported: the secret values, the placeholders, the integrated security connection string, the
// lines that were commented out, the temporary file, the platform handler, the proxy that is excluded, the build output
// and the packages of web.config.
export const UNWANTED = ['Fr8ight', 'bm90LWEtcmVhbC1rZXk', 'CarrierPortalPassword', 'TariffsPassword', 'ReportsDb', 'OldFtpPassword', 'E:\\old-exports', 'manifest-scratch', 'TransferRequestHandler', 'Proxies/', 'TcpListener', 'obj/', 'Newtonsoft.Json"', 'System.Web.Abstractions', 'PellworthLabelPrint.Backup', 'REM', 'RESULT: PASS', 'ERROR    unreadable-file', 'ERROR    scan-limit'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy folder', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean folder', clean, 0, ['input: folder examples/clean; 5 files of the kinds read: 1 web.config, 1 appsettings, 1 project, 2 C#', 'apps: 1 (1 Ready, 0 Ready with changes, 0 Blockers)', 'Harrowgate.Loans  examples/clean/Harrowgate.Loans  net8.0     0      0        0     Ready', 'findings: 0', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', '  INFO  ', 'RESULT: FAIL', 'note:', 'D:\\Harrowgate']);

  // Without the configuration, .NET 7 is not on the list, the proxy is read and the local paths are info.
  expect('messy, built-in configuration', await run(MESSY.slice(0, 1)), 1, ['config: built-in defaults', 'the app targets net7.0, .NET, which is not on the list', 'the code listens on a socket of its own through "new TcpListener"', 'INFO     local-path-setting', 'apps: 2 (0 Ready, 0 Ready with changes, 2 Blockers)'], ['WARNING  local-path-setting']);
  // The same proxy left out from the command line.
  expect('messy, excluded on the command line', await run([...MESSY.slice(0, 1), '--exclude', '**/Proxies/**']), 1, ['1 excluded'], ['TcpListener']);
  // Only the errors are shown with --min-severity error, and the verdicts still count the rest.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 7 (7 error); 27 below error not shown', 'Ready with changes', 'RESULT: FAIL - 7 findings at or above error'], ['WARNING  ', 'INFO  ']);
  // The clean folder passes when every level fails the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A file in place of the folder stops the run.
  expect('a file named', await run(['examples/messy/README.md']), 2, ['examples/messy/README.md: is a file; give the folder of the app'], [], 'err');

  // The README shows the whole report of the messy folder, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean folder.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy folder differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean folder differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('hard-coded-secret') && l.includes(`${TRACKING}/Web.config:4`));
  const sample = lines.slice(at, at + 8).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the secret differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=app-service-readiness-check registry-access::') || x.includes('title=app-service-readiness-check inproc-session-state::') && x.includes('Web.config'));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
