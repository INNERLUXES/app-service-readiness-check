// A run: read the configuration, walk the folder, read and scan each file of the kinds read, group the files into
// apps, run the rules across each app and build the report of the run. A path on the command line that cannot be used
// (missing, a link, a file in place of the folder), a glob or a configuration with a problem stops the run with an
// InputError and no result. A file or folder that cannot be read, and a folder past the limits of a run, are error
// findings of their own, so the run fails at the default level and never passes because a part of the input was
// passed over.

import { appFindings, frameworkText, groupApps, verdictOf } from './apps.js';
import { ConfigError, defaultConfig, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, VERDICTS, pointPage } from './data.js';
import { FILE_LIMITS, displayPath, inspectPath, readText, readTextFile } from './files.js';
import { compileGlob } from './glob.js';
import { positionOf, lineStarts } from './json.js';
import { KINDS } from './kinds.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { scanFile } from './scan.js';
import { grouped, plural } from './size.js';
import { safeText } from './text.js';
import { WALK_LIMITS, walkFolder } from './walk.js';
import { baseName, byCode, joinPath } from './words.js';

export const LIMITS = { ...FILE_LIMITS, ...WALK_LIMITS, maxTotalBytes: 256 * 1024 * 1024, maxFindingsPerRule: 500 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export function levelOf(rule, config) {
  return rule.key === null ? 'error' : config.rules[rule.key];
}

// The run as a report object. folder is the folder scanned as shown; walk is what src/walk.js found; files are the
// files read, [{ rel, kind, encoding, read, facts }]; raw are the findings, [{ rule, rel, line, column, found }], with
// rel relative to the folder; apps are the apps of src/apps.js with their frameworks.
export function buildReport({ folder, walk, files, raw, apps, config, minSeverity, failOn, version, limits = LIMITS }) {
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const shownPath = (rel) => safeText(joinPath(folder, rel));
  const appOfRel = new Map(apps.map((a) => [a.root, a]));
  const all = raw
    .filter((f) => level(f.rule) !== 'off')
    .map((f) => ({ ...f, level: level(f.rule), file: shownPath(f.rel), app: appOfRel.get(f.root)?.name ?? null }))
    .sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || byCode(a.file, b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule));
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) {
      cut += 1;
      continue;
    }
    const rule = RULES.find((r) => r.id === f.rule);
    findings.push({
      rule: f.rule,
      level: f.level,
      app: f.app === null ? null : safeText(f.app, 120),
      file: f.file,
      line: f.line,
      column: f.column,
      at: `${f.file}:${f.line}`,
      found: safeText(f.found, 800),
      fix: rule.fix,
      basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
      own: rule.own
    });
  }
  // The result counts every finding at or above the minimum severity, including the ones past the limit of a rule.
  const result = decide(shown, failOn);
  // The verdicts and the counts per rule count every finding of a rule that is not off, whatever is shown.
  const shownApps = apps.map((a) => {
    const mine = all.filter((f) => f.root === a.root);
    const byLevel = { error: 0, warning: 0, info: 0 };
    for (const f of mine) byLevel[f.level] += 1;
    return {
      name: safeText(a.name, 120),
      folder: shownPath(a.root),
      projects: a.projects.map(shownPath),
      frameworks: a.frameworks.map((f) => ({ value: safeText(f.value, 60), tfm: f.tfm, shown: safeText(frameworkText(f), 80), at: `${shownPath(f.file)}:${f.line}` })),
      findings: mine.length,
      byLevel,
      verdict: verdictOf(byLevel)
    };
  });
  const rules = RULES.map((r) => ({ id: r.id, level: level(r.id), findings: all.filter((f) => f.rule === r.id).length }));
  const byKind = Object.fromEntries(KINDS.map((k) => [k.kind, files.filter((f) => f.kind === k.kind).length]));
  const encodings = { 'utf-8': 0, 'utf-16le': 0, 'utf-16be': 0, 'latin-1': 0 };
  for (const f of files) if (f.read) encodings[f.encoding] += 1;
  const notes = [];
  if (!files.length) notes.push('the folder holds no file of the kinds the tool reads');
  if (walk.links) notes.push(`${plural(walk.links, 'symbolic link')} ${walk.links === 1 ? 'is' : 'are'} not followed`);
  if (encodings['latin-1']) notes.push(`${plural(encodings['latin-1'], 'file')} that ${encodings['latin-1'] === 1 ? 'is' : 'are'} not valid UTF-8 ${encodings['latin-1'] === 1 ? 'was' : 'were'} read as Latin-1`);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown; the verdicts count ${hidden === 1 ? 'it' : 'them'}`);
  const off = RULES.filter((r) => r.key !== null && levelOf(r, config) === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, shownApps.filter((a) => a.verdict === v).length]));
  return {
    tool: 'app-service-readiness-check',
    version,
    input: {
      folder: safeText(folder),
      files: files.length,
      byKind,
      encodings,
      notRead: files.filter((f) => !f.read).length,
      skippedFolders: { count: walk.skipped.count, names: walk.skipped.names.map((n) => safeText(n, 60)) },
      excluded: walk.excluded,
      links: walk.links,
      otherFiles: walk.others
    },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      frameworks: config.frameworks,
      allowedFrameworks: config.allowedFrameworks,
      knownAssemblies: config.knownAssemblies.map((n) => safeText(n, 200)),
      exclude: config.exclude.map((g) => safeText(g.source, 200)),
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    apps: shownApps,
    rules,
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut, apps: shownApps.length, byVerdict },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// The line and column of an offset of a text, with the line starts worked out once per text.
function placer(text) {
  const starts = lineStarts(text);
  return (offset) => positionOf(starts, offset);
}

// Walks the folder, reads and scans its files, and builds the report object of the run.
export async function checkPaths({ folder: folderPath, config: configPath = null, excludes = [], minSeverity = null, failOn = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  const lim = { ...LIMITS, ...limits };
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, lim.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  const problems = [];
  const globs = [];
  for (const g of excludes) {
    try {
      globs.push(compileGlob(g));
    } catch (error) {
      problems.push(`--exclude: ${error.message}`);
    }
  }
  let root = null;
  try {
    root = await inspectPath(folderPath, base);
    if (!root.folder) problems.push(`${root.shown}: is a file; give the folder of the app, such as the folder that holds its web.config or .csproj`);
  } catch (error) {
    problems.push(error.message);
  }
  if (problems.length) throw new InputError(capped(problems));

  const walk = await walkFolder(root.full, { excludes: [...config.exclude, ...globs], limits: lim });
  const raw = [];
  const at = (rel, rule, found) => raw.push({ rule, rel, line: 1, column: 1, found });
  for (const u of walk.unreadable) at(u.rel, 'unreadable-file', `${u.reason}; nothing in it is checked`);
  const files = [];
  let total = 0;
  let limit = walk.limit;
  for (const f of walk.files) {
    if (limit) break;
    const shown = displayPath(f.full, base);
    let read;
    try {
      read = await readText(f.full, shown, lim.maxFileBytes);
    } catch (error) {
      files.push({ rel: f.rel, kind: f.kind, read: false, encoding: null, facts: {} });
      at(f.rel, 'unreadable-file', `the file cannot be read: ${error.reason ?? error.message}; nothing in it is checked`);
      continue;
    }
    total += read.size;
    if (total > lim.maxTotalBytes) {
      limit = `more than ${grouped(lim.maxTotalBytes / 1048576)} MB in the files of the kinds read`;
      break;
    }
    const place = placer(read.text);
    const scanned = scanFile(read.text, f.kind);
    for (const x of scanned.findings) {
      const p = place(x.offset);
      raw.push({ rule: x.rule, rel: f.rel, line: p.line, column: p.column, found: x.found });
    }
    files.push({ rel: f.rel, kind: f.kind, read: true, encoding: read.encoding, facts: scanned.facts, place });
  }
  if (limit) raw.push({ rule: 'scan-limit', rel: '.', line: 1, column: 1, found: `the folder holds ${limit}; the walk stopped there, and the rest of the folder is not read` });

  const folderName = root.shown === '.' ? baseName(root.full.split('\\').join('/')) : baseName(root.shown);
  const { apps, rootOf } = groupApps(files, folderName);
  for (const a of apps) {
    const mine = files.filter((f) => f.read && rootOf(f.rel) === a.root);
    const { findings, frameworks } = appFindings(mine, config);
    const placeOf = new Map(mine.map((f) => [f.rel, f.place]));
    for (const x of findings) {
      const p = placeOf.get(x.rel)(x.offset);
      raw.push({ rule: x.rule, rel: x.rel, line: p.line, column: p.column, found: x.found });
    }
    a.frameworks = frameworks.map((f) => ({ ...f, line: placeOf.get(f.file)(f.offset).line }));
  }
  for (const r of raw) r.root = r.rel === '.' && !apps.some((a) => a.root === '.') ? (apps[0]?.root ?? '.') : rootOf(r.rel);
  return buildReport({ folder: root.shown, walk, files, raw, apps, config, minSeverity: minSeverity ?? config.minSeverity, failOn: failOn ?? config.failOn, version, limits: lim });
}
