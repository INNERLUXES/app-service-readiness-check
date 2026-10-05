import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { appFindings, compileGlob, frameworkText, frameworksOf, groupApps, verdictOf, walkFolder } from '../src/index.js';
import { GOOD, configOf, findingsOf, goodWith, lineOf, reportOf, withFiles } from './helpers.js';

// The apps of a folder, the rules across the files of one app, the verdicts, and the walk of the folder.

test('apps: a folder with a project file is an app; files belong to the deepest one; the rest make an app at the top', () => {
  const files = ['web/Web.csproj', 'web/Global.asax', 'web/api/Api.vbproj', 'web/api/A.vb', 'web/api/x/B.vb', 'tools/run.cs', 'Web.config'].map((rel) => ({ rel, kind: rel.endsWith('proj') ? 'project' : 'cs' }));
  const { apps, rootOf } = groupApps(files, 'repo');
  assert.deepEqual(apps.map((a) => [a.root, a.name, a.projects]), [['.', 'repo', []], ['web', 'Web', ['web/Web.csproj']], ['web/api', 'Api', ['web/api/Api.vbproj']]]);
  assert.deepEqual(['web/Global.asax', 'web/api/x/B.vb', 'tools/run.cs', 'webapi/x.cs'].map(rootOf), ['web', 'web/api', '.', '.']);
  assert.deepEqual(groupApps([{ rel: 'A.csproj', kind: 'project' }, { rel: 'B.csproj', kind: 'project' }, { rel: 'x.cs', kind: 'cs' }], 'top').apps.map((a) => [a.root, a.name, a.projects.length]), [['.', 'A', 2]]);
  assert.deepEqual(groupApps([], 'none').apps, []);
});

test('apps: the frameworks come from the project files, from web.config only when the projects name none, each once', () => {
  const p = (frameworks) => ({ rel: 'A.csproj', kind: 'project', facts: { frameworks: frameworks.map((value, i) => ({ value, offset: i, from: '<TargetFramework>' })) } });
  const w = { rel: 'Web.config', kind: 'web-config', facts: { frameworks: [{ value: '4.5', offset: 0, from: '<compilation targetFramework>' }] } };
  assert.deepEqual(frameworksOf([p(['net48', 'v4.8', 'NET48', 'odd']), w]).map((f) => [f.value, f.tfm]), [['net48', 'net48'], ['odd', null]]);
  assert.deepEqual(frameworksOf([p([]), w]).map((f) => [f.value, f.tfm, f.file]), [['4.5', 'net45', 'Web.config']]);
  assert.equal(frameworkText({ value: 'v4.0', tfm: 'net40' }), 'v4.0 (net40)');
  assert.equal(frameworkText({ value: 'net8.0', tfm: 'net8.0' }), 'net8.0');
  assert.equal(frameworkText({ value: 'odd', tfm: null }), 'odd');
});

test('apps: a framework not on the list, a form the tool does not read, and a library that is not compared', () => {
  const scans = [{ rel: 'A.csproj', kind: 'project', facts: { frameworks: ['net6.0', 'netstandard2.0', 'net8.0', 'banana'].map((value) => ({ value, offset: 0, from: '<TargetFrameworks>' })) } }];
  const { findings } = appFindings(scans, configOf());
  assert.deepEqual(findings.map((f) => f.found), [
    'the app targets net6.0, .NET, which is not on the list of frameworks the tool takes as offered by App Service (net20, net30, net35, net462 and 8 more)',
    'the target framework "banana" in <TargetFrameworks> is none of the forms the tool reads, so it cannot tell whether App Service offers it'
  ]);
  assert.deepEqual(appFindings(scans, configOf({ allowedFrameworks: ['net6.0'] })).findings.length, 1);
});

test('apps: an assembly of web.config with no package is a gac-assembly finding; framework names, packages, HintPath references and known names are not', () => {
  const scans = [
    { rel: 'Web.config', kind: 'web-config', facts: { assemblies: ['Shop.Gac', 'System.Web.Mvc', 'mscorlib', 'Dapper', 'shop.lib', 'Vendor.Pdf', ''].map((name) => ({ name, offset: 0 })) } },
    { rel: 'packages.config', kind: 'packages', facts: { packages: ['Dapper'] } },
    { rel: 'A.csproj', kind: 'project', facts: { packages: ['Shop.Lib'], frameworks: [] } }
  ];
  assert.deepEqual(appFindings(scans, configOf()).findings.map((f) => f.found.split('"')[1]), ['Shop.Gac', 'Vendor.Pdf']);
  assert.deepEqual(appFindings(scans, configOf({ knownAssemblies: ['vendor.pdf'] })).findings.map((f) => f.found.split('"')[1]), ['Shop.Gac']);
});

test('apps: the verdict is Blockers with an error, Ready with changes with a warning, Ready otherwise', () => {
  assert.equal(verdictOf({ error: 1, warning: 3, info: 0 }), 'Blockers');
  assert.equal(verdictOf({ error: 0, warning: 1, info: 9 }), 'Ready with changes');
  assert.equal(verdictOf({ error: 0, warning: 0, info: 9 }), 'Ready');
});

test('apps: two apps in one run, each with its own findings, frameworks and verdict, and settings across files of one app', async () => {
  const r = await reportOf(goodWith({
    'Legacy/Legacy.csproj': '<Project>\n  <PropertyGroup>\n    <TargetFrameworkVersion>v4.5</TargetFrameworkVersion>\n  </PropertyGroup>\n</Project>\n',
    'Legacy/Web.config': '<configuration>\n  <system.web>\n    <compilation><assemblies><add assembly="Legacy.Gac" /></assemblies></compilation>\n    <sessionState mode="InProc" />\n  </system.web>\n</configuration>\n',
    'Shop/Jobs.cs': 'class Feed : BackgroundService { }\n'
  }));
  assert.deepEqual(r.apps.map((a) => [a.name, a.folder, a.frameworks.map((f) => f.shown), a.byLevel, a.verdict]), [
    ['Legacy', 'Legacy', ['v4.5 (net45)'], { error: 1, warning: 2, info: 0 }, 'Blockers'],
    ['Shop', 'Shop', ['net8.0'], { error: 0, warning: 0, info: 1 }, 'Ready']
  ]);
  assert.deepEqual(r.apps[0].frameworks[0].at, 'Legacy/Legacy.csproj:3');
  assert.deepEqual(findingsOf(r).map((f) => [f.rule, f.app]), [['unsupported-framework', 'Legacy'], ['gac-assembly', 'Legacy'], ['inproc-session-state', 'Legacy'], ['background-work', 'Shop']]);
  assert.deepEqual(r.totals.byVerdict, { Ready: 1, 'Ready with changes': 0, Blockers: 1 });
});

test('apps: a web site with no project file is one app named after the folder, its framework read from web.config', async () => {
  const web = '<configuration>\n  <system.web>\n    <httpRuntime targetFramework="4.8" />\n  </system.web>\n</configuration>\n';
  const r = await reportOf({ 'site/Web.config': web, 'site/App_Code/Util.cs': 'class Util { }\n' }, []);
  assert.equal(r.apps.length, 1);
  assert.equal(r.apps[0].folder, '.');
  assert.deepEqual(r.apps[0].frameworks.map((f) => [f.shown, f.at]), [['4.8 (net48)', `site/Web.config:${lineOf(web, 'targetFramework')}`]]);
  assert.equal(r.apps[0].verdict, 'Ready');
});

test('walk: skipped folders, excluded globs, files of other kinds, sorted paths and its limits', async () => {
  await withFiles({ ...GOOD, 'Shop/bin/x.cs': 'x', 'Shop/OBJ/y.cs': 'y', 'Shop/node_modules/z.cs': 'z', 'Shop/.vs/w.cs': 'w', 'Shop/Gen/a.cs': 'a', 'Shop/b.Designer.cs': 'b', 'Shop/readme.md': '#', 'Shop/a/b/c/d.cs': 'd' }, async (dir) => {
    const w = await walkFolder(resolve(dir), { excludes: [compileGlob('Gen'), compileGlob('*.Designer.cs')] });
    assert.deepEqual(w.files.map((f) => [f.rel, f.kind]), [['Shop/Program.cs', 'cs'], ['Shop/Shop.csproj', 'project'], ['Shop/a/b/c/d.cs', 'cs'], ['Shop/appsettings.json', 'appsettings']]);
    assert.deepEqual(w.skipped, { names: ['.vs', 'bin', 'node_modules', 'obj'], count: 4 });
    assert.deepEqual([w.excluded, w.others, w.links, w.limit], [2, 1, 0, null]);
    assert.match((await walkFolder(resolve(dir), { limits: { maxFiles: 2 } })).limit, /more than 2 files of the kinds read/);
    assert.match((await walkFolder(resolve(dir), { limits: { maxEntries: 3 } })).limit, /more than 3 files and folders/);
    assert.match((await walkFolder(resolve(dir), { limits: { maxDepth: 2 } })).limit, /folders nested more than 2 deep \(Shop\/a\/b\)/);
  });
});
