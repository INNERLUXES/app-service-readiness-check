// The apps of the folder scanned, and the rules that look across the files of one app. An app is a folder that holds a
// .csproj or .vbproj file; every file belongs to the app of the deepest such folder above it. Files that sit under no
// project folder, or a folder with no project file at all (an ASP.NET web site), make one app at the folder scanned.
// The verdict of an app comes from the levels of its findings: Blockers with an error, Ready with changes with a
// warning and no error, Ready otherwise (docs/method.md).

import { FRAMEWORK_ASSEMBLIES } from './defaults.js';
import { FAMILIES, frameworkOf } from './frameworks.js';
import { VERDICTS } from './data.js';
import { listText } from './size.js';
import { asciiLower, baseName, byCode, folderOf } from './words.js';
import { snippet } from './scan.js';

// The apps of a list of files [{ rel, kind }]: [{ root, name, projects }], deepest roots last, and the root of each
// file.
export function groupApps(files, folderName) {
  const projects = files.filter((f) => f.kind === 'project').map((f) => f.rel).sort(byCode);
  const roots = [...new Set(projects.map(folderOf))].sort(byCode);
  const rootOf = (rel) => {
    let best = null;
    for (const r of roots) if ((r === '.' || rel.startsWith(`${r}/`)) && (best === null || r.length > best.length || best === '.')) best = r;
    return best ?? '.';
  };
  const owners = new Map(files.map((f) => [f.rel, rootOf(f.rel)]));
  const used = new Set(owners.values());
  const apps = [];
  if (used.has('.') && !roots.includes('.')) apps.push({ root: '.', name: folderName, projects: [] });
  for (const r of roots) {
    const own = projects.filter((p) => folderOf(p) === r);
    apps.push({ root: r, name: baseName(own[0]).replace(/\.(?:cs|vb)proj$/i, ''), projects: own });
  }
  apps.sort((a, b) => byCode(a.root === '.' ? '' : a.root, b.root === '.' ? '' : b.root));
  return { apps, rootOf: (rel) => owners.get(rel) ?? rootOf(rel) };
}

// The frameworks of an app: from its project files, or, when they name none, from its web.config files. Each value
// once, in the order found: [{ value, tfm, family, file, offset, from }].
export function frameworksOf(scans) {
  const fromProjects = scans.filter((s) => s.kind === 'project').flatMap((s) => (s.facts.frameworks ?? []).map((f) => ({ ...f, file: s.rel })));
  const list = fromProjects.length ? fromProjects : scans.filter((s) => s.kind === 'web-config').flatMap((s) => (s.facts.frameworks ?? []).map((f) => ({ ...f, file: s.rel })));
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const fw = frameworkOf(f.value);
    const key = fw ? fw.tfm : asciiLower(f.value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...f, tfm: fw ? fw.tfm : null, family: fw ? fw.family : null });
  }
  return out;
}

// How a framework is shown: the value as written, with its short form when that differs.
export const frameworkText = (f) => (f.tfm && asciiLower(f.value) !== f.tfm ? `${f.value} (${f.tfm})` : f.value);

// The findings of the rules across the files of one app: target frameworks that are not offered, and assemblies of
// web.config that no package or reference of the app provides. scans are [{ rel, kind, facts }].
export function appFindings(scans, config) {
  const findings = [];
  const offered = new Set([...config.frameworks]);
  const frameworks = frameworksOf(scans);
  for (const f of frameworks) {
    if (f.family === 'netstandard') continue;
    if (f.tfm === null) findings.push({ rule: 'unsupported-framework', rel: f.file, offset: f.offset, found: `the target framework "${snippet(f.value)}" in ${f.from} is none of the forms the tool reads, so it cannot tell whether App Service offers it` });
    else if (!offered.has(f.tfm)) findings.push({ rule: 'unsupported-framework', rel: f.file, offset: f.offset, found: `the app targets ${snippet(frameworkText(f))}, ${FAMILIES[f.family]}, which is not on the list of frameworks the tool takes as offered by App Service (${listText([...offered], 4)})` });
  }
  const packages = new Set(scans.flatMap((s) => s.facts.packages ?? []).map(asciiLower));
  const known = new Set([...FRAMEWORK_ASSEMBLIES, ...config.knownAssemblies].map(asciiLower));
  for (const s of scans.filter((x) => x.kind === 'web-config')) {
    for (const a of s.facts.assemblies ?? []) {
      const lower = asciiLower(a.name);
      if (lower === '' || known.has(lower) || lower.startsWith('system.') || packages.has(lower)) continue;
      findings.push({ rule: 'gac-assembly', rel: s.rel, offset: a.offset, found: `web.config compiles against the assembly "${snippet(a.name)}", which no package or reference with a HintPath of the app provides, so it may come from the Global Assembly Cache` });
    }
  }
  return { findings, frameworks };
}

// The verdict of an app from the counts of its findings by level.
export function verdictOf(byLevel) {
  if (byLevel.error) return VERDICTS[2];
  if (byLevel.warning) return VERDICTS[1];
  return VERDICTS[0];
}
