import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_FAIL_ON, DEFAULT_FRAMEWORKS, DEFAULT_MIN_SEVERITY, DEFAULT_RULES, KEYS, RULES, defaultConfig, defaultsAsConfig, distance, isObject, kindOf, readConfig, suggestion, validateConfig } from '../src/index.js';

// The configuration file: every key with a good value and a bad one, the suggestions, and the defaults.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems;
  }
  return assert.fail('not refused');
};

test('config: the defaults, and --print-defaults read back gives them', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.frameworks, DEFAULT_FRAMEWORKS);
  assert.deepEqual([d.allowedFrameworks, d.knownAssemblies, d.exclude], [[], [], []]);
  assert.deepEqual([d.minSeverity, d.failOn], [DEFAULT_MIN_SEVERITY, DEFAULT_FAIL_ON]);
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(defaultsAsConfig()), ['name', ...Object.keys(KEYS).filter((k) => k !== 'name')]);
  for (const r of RULES.filter((x) => x.key)) assert.ok(Object.hasOwn(DEFAULT_RULES, r.key), r.key);
  assert.deepEqual(Object.keys(DEFAULT_RULES), RULES.filter((x) => x.key).map((x) => x.key), 'the defaults are in the order of the rules');
});

test('config: every key with a good value', () => {
  const c = readConfig(JSON.stringify({ name: 'Review', rules: { registryAccess: 'warning', urlRewrite: 'off' }, allowedFrameworks: ['net6.0', 'v4.5', 'net45', 'net8.0'], knownAssemblies: ['Vendor.Pdf', 'Vendor.Pdf', 'Shop.Gac'], exclude: ['Proxies', 'legacy/**'], minSeverity: 'warning', failOn: 'warning' }), 'c.json');
  assert.equal(c.file, 'c.json');
  assert.equal(c.name, 'Review');
  assert.equal(c.rules.registryAccess, 'warning');
  assert.equal(c.rules.urlRewrite, 'off');
  assert.deepEqual(c.allowedFrameworks, ['net6.0', 'net45', 'net8.0'], 'brought to the short form, repeats dropped');
  assert.deepEqual(c.frameworks, [...DEFAULT_FRAMEWORKS, 'net6.0', 'net45'], 'a framework already on the list is not added twice');
  assert.deepEqual(c.knownAssemblies, ['Vendor.Pdf', 'Shop.Gac']);
  assert.deepEqual(c.exclude.map((g) => g.source), ['Proxies', 'legacy/**']);
  assert.deepEqual([c.minSeverity, c.failOn], ['warning', 'warning']);
});

test('config: an unknown key is an error with its line and a suggestion', () => {
  assert.deepEqual(problems('{\n  "failOm": "info",\n  "rules": {\n    "registryAcess": "off"\n  }\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?', 'c.json: line 4: "registryAcess" is not a key of rules; did you mean "registryAccess"?']);
  assert.deepEqual(problems('{"allowedFramework": []}'), ['c.json: line 1: "allowedFramework" is not a key of the configuration; did you mean "allowedFrameworks"?']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind for every key', () => {
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.match(problems('{"name": " "}')[0], /name must be a text of 1 to 120 characters/);
  assert.match(problems('{"rules": []}')[0], /rules must be an object, not a list/);
  assert.match(problems('{"rules": {"msmq": "fatal"}}')[0], /rules\.msmq must be one of info, warning, error, off, not "fatal"/);
  assert.match(problems('{"rules": {"msmq": 1}}')[0], /not 1/);
  assert.match(problems('{"allowedFrameworks": "net6.0"}')[0], /allowedFrameworks must be a list of target frameworks, not a string/);
  assert.match(problems('{"allowedFrameworks": ["net6"]}')[0], /allowedFrameworks\[0\]: "net6" is not a target framework the tool reads, such as net48, net6\.0 or netcoreapp3\.1/);
  assert.match(problems('{"allowedFrameworks": ["netstandard2.0"]}')[0], /is a library framework, which is never compared/);
  assert.match(problems('{"allowedFrameworks": [3]}')[0], /allowedFrameworks\[0\] must be a text, not a number/);
  assert.match(problems(JSON.stringify({ allowedFrameworks: Array(CONFIG_LIMITS.maxFrameworks + 1).fill('net6.0') }))[0], /allowedFrameworks holds more than 50 entries/);
  assert.match(problems('{"knownAssemblies": ["Vendor.Pdf, Version=1.0.0.0"]}')[0], /an assembly name holds 1 to 200 characters with no comma or space/);
  assert.match(problems('{"knownAssemblies": [" "]}')[0], /knownAssemblies\[0\]: an assembly name/);
  assert.match(problems('{"exclude": ["a\\\\b"]}')[0], /exclude\[0\]: the glob "a\\b" holds a backslash/);
  assert.match(problems('{"exclude": {}}')[0], /exclude must be a list of globs, not an object/);
  assert.match(problems('{"minSeverity": "fatal"}')[0], /minSeverity must be one of info, warning, error/);
  assert.match(problems('{"failOn": null}')[0], /failOn must be one of info, warning, error/);
});

test('config: a repeated name and JSON that does not parse are refused, and the problems are in the order of their lines', () => {
  assert.match(problems('{"failOn": "info", "failOn": "error"}')[0], /^c\.json: line 1, column 20: the name "failOn" appears twice/);
  assert.match(problems('{"failOn": "info",}')[0], /^c\.json: line 1, column 19: a comma before the closing brace/);
  assert.match(problems('{"failOn": "info" // comment\n}')[0], /a comma or a closing brace was expected/);
  assert.deepEqual(problems('{\n"failOn": 1,\n"minSeverity": 2,\n"zz": 3\n}').map((p) => p.split(':')[1].trim()), ['line 2', 'line 3', 'line 4']);
});

test('config: suggestions, edit distance and the kinds of values', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(distance('', 'abc'), 3);
  assert.equal(distance('kitten', 'sitting'), 3);
  assert.equal(suggestion('exclud', ['exclude', 'rules']), '; did you mean "exclude"?');
  assert.equal(suggestion('x', ['rules']), '');
  assert.equal(suggestion('y'.repeat(65), ['rules']), '');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf([]), 'a list');
  assert.equal(kindOf({}), 'an object');
  assert.equal(kindOf(1), 'a number');
  assert.equal(isObject({}), true);
  assert.equal(isObject([]), false);
  assert.throws(() => validateConfig(1), /the configuration must be a JSON object, not a number/);
  assert.deepEqual(validateConfig({}).rules, DEFAULT_RULES);
});
