// The configuration file: the settings of the tool, in one strict JSON object over the built-in defaults. Every key the
// tool does not know is an error with its line and a suggestion, so a typo cannot leave a default in place unnoticed;
// the JSON reader refuses a name given twice in one object. The configuration is optional: with none, the defaults
// apply.

import { LEVELS } from './data.js';
import { DEFAULT_FAIL_ON, DEFAULT_FRAMEWORKS, DEFAULT_MIN_SEVERITY, DEFAULT_RULES } from './defaults.js';
import { frameworkOf } from './frameworks.js';
import { compileGlob } from './glob.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { asciiLower } from './words.js';

export const CONFIG_LIMITS = { maxFrameworks: 50, maxAssemblies: 200, maxExcludes: 100 };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  allowedFrameworks: 'list of target frameworks',
  knownAssemblies: 'list of assembly names',
  exclude: 'list of globs',
  minSeverity: 'level',
  failOn: 'level'
};

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: '; did you mean "..."?' or nothing. A name that
// differs in length from a known name by more than three characters, or that is longer than 64 characters, is not
// compared with it.
export function suggestion(name, known) {
  if (name.length > 64) return '';
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3 || k.length > 64) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The built-in configuration, as the checks use it. frameworks is the list of frameworks taken as offered: the
// defaults and allowedFrameworks.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    rules: { ...DEFAULT_RULES },
    allowedFrameworks: [],
    frameworks: [...DEFAULT_FRAMEWORKS],
    knownAssemblies: [],
    exclude: [],
    minSeverity: DEFAULT_MIN_SEVERITY,
    failOn: DEFAULT_FAIL_ON
  };
}

// The built-in configuration written as a configuration file, for --print-defaults. Read back, it gives the defaults;
// the lists are empty because they add to the built-in lists of src/defaults.js.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults', rules: d.rules, allowedFrameworks: [], knownAssemblies: [], exclude: [], minSeverity: d.minSeverity, failOn: d.failOn };
}

// Checks a parsed configuration and builds the configuration the checks use, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[^.[]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);
  const show = (v) => (typeof v === 'string' ? `"${v.slice(0, 40)}"` : kindOf(v));

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 120) fail('name', 'name must be a text of 1 to 120 characters');
    else config.name = value.name;
  }

  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    const levels = [...LEVELS, 'off'];
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || !levels.includes(v[k])) fail(path, `${path} must be one of ${levels.join(', ')}, not ${typeof v[k] === 'number' ? String(v[k]) : show(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }

  // A list of texts, each checked by read, which returns the value to keep or throws an Error with the reason.
  const list = (key, max, what, read) => {
    if (!Object.hasOwn(value, key)) return null;
    const v = value[key];
    if (!Array.isArray(v)) {
      fail(key, `${key} must be a list of ${what}, not ${kindOf(v)}`);
      return null;
    }
    if (v.length > max) {
      fail(key, `${key} holds more than ${max} entries`);
      return null;
    }
    const out = [];
    v.forEach((x, i) => {
      const path = `${key}[${i}]`;
      if (typeof x !== 'string') {
        fail(path, `${path} must be a text, not ${kindOf(x)}`);
        return;
      }
      try {
        const kept = read(x);
        if (!out.some((o) => JSON.stringify(o) === JSON.stringify(kept))) out.push(kept);
      } catch (error) {
        fail(path, `${path}: ${error.message}`);
      }
    });
    return out;
  };

  const frameworks = list('allowedFrameworks', CONFIG_LIMITS.maxFrameworks, 'target frameworks', (x) => {
    const fw = frameworkOf(x);
    if (fw === null) throw new Error(`"${x.slice(0, 40)}" is not a target framework the tool reads, such as net48, net6.0 or netcoreapp3.1`);
    if (fw.family === 'netstandard') throw new Error(`"${x.slice(0, 40)}" is a library framework, which is never compared`);
    return fw.tfm;
  });
  if (frameworks) {
    config.allowedFrameworks = frameworks;
    for (const f of frameworks) if (!config.frameworks.includes(f)) config.frameworks.push(f);
  }

  const assemblies = list('knownAssemblies', CONFIG_LIMITS.maxAssemblies, 'assembly names', (x) => {
    const name = x.trim();
    if (name.length === 0 || name.length > 200 || /[,\s]/.test(name)) throw new Error('an assembly name holds 1 to 200 characters with no comma or space; give the name alone, without its version');
    return name;
  });
  if (assemblies) config.knownAssemblies = assemblies;

  const excludes = list('exclude', CONFIG_LIMITS.maxExcludes, 'globs', (x) => compileGlob(x));
  if (excludes) config.exclude = excludes;

  for (const key of ['minSeverity', 'failOn']) {
    if (!Object.hasOwn(value, key)) continue;
    if (!LEVELS.includes(value[key])) fail(key, `${key} must be one of ${LEVELS.join(', ')}`);
    else config[key] = value[key];
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 3 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
