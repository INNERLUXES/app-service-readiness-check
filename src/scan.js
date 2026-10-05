// The scan of one file: the findings of the rules that look at one file, and the facts that the rules across an app
// need (src/apps.js): the target frameworks, the packages and the assemblies a web.config compiles against. Comments
// are blanked first (src/lexer.js), so the offsets of the text blanked are the offsets of the file. Every finding has
// the offset where it starts and a text that says what was found; a secret is named by its key and never shown.

import { attrOf, xmlTags } from './xml.js';
import { blankComments } from './lexer.js';
import { lineStarts } from './json.js';
import { APP_PATH, ABSOLUTE_PATH, BIND, CODE_PATTERNS, FIRST_ARG_PORT, LOOK_BACK, PLATFORM_TYPE, SECOND_ARG_PORT, STRING_CS, STRING_VB, TEMP_PATH, URL_PORT, WEB_PORTS, WRITE } from './patterns.js';
import { connectionSecrets, isPlaceholder, isSecretName, maskSecrets } from './secrets.js';
import { listText } from './size.js';
import { splitFrameworks } from './frameworks.js';
import { asciiLower } from './words.js';
import { LANGUAGE } from './kinds.js';

// A short piece of the input for a finding: runs of white space made one space, secrets masked, at most max
// characters.
export function snippet(text, max = 60) {
  const s = maskSecrets(String(text).replace(/\s+/g, ' ').trim());
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

// The lines of a text, without their line ends, with the offset each starts at.
export function linesOf(text) {
  const starts = lineStarts(text);
  return starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : text.length;
    let line = text.slice(start, end);
    while (line.endsWith('\n') || line.endsWith('\r')) line = line.slice(0, -1);
    return { start, line };
  });
}

// The ports a text binds that are not 80 or 443, in the order written, each once, with the index of the first.
export function portsOf(line) {
  const found = [];
  for (const re of [URL_PORT, FIRST_ARG_PORT, SECOND_ARG_PORT]) {
    for (const m of line.matchAll(re)) {
      const port = Number(m[1]);
      if (port > 65535 || WEB_PORTS.includes(port)) continue;
      found.push({ port, index: m.index + m[0].lastIndexOf(m[1]) });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const ports = [...new Set(found.map((f) => f.port))];
  return { ports, index: found.length ? found[0].index : -1 };
}

// The strings of a line, as written in the source: a C# string with its doubled backslashes made one, so a path reads
// as it is on the disk.
export function stringsOf(line, language) {
  const out = [];
  for (const m of line.matchAll(language === 'vb' ? STRING_VB : STRING_CS)) out.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2].replace(/\\\\/g, '\\'));
  return out;
}

// The local path a line writes to: the first string that starts with an absolute path, else, on the line of the
// write itself, a path in the folder of the app, else null.
function pathOn(line, language, same) {
  for (const s of stringsOf(line, language)) if (ABSOLUTE_PATH.test(s)) return { text: `the local path "${snippet(s)}"` };
  const app = same ? APP_PATH.exec(line) : null;
  return app ? { text: `a path in the folder of the app ("${app[0]}")` } : null;
}

// The findings of a C#, VB or Global.asax file, a line at a time.
export function scanCode(text, language) {
  const lines = linesOf(blankComments(text, language));
  const findings = [];
  lines.forEach(({ start, line }, k) => {
    for (const p of CODE_PATTERNS) {
      const m = p.re.exec(line);
      if (m) findings.push({ rule: p.rule, offset: start + m.index, found: `${p.lead} through "${snippet(m[0])}"` });
    }
    if (BIND.test(line)) {
      const { ports, index } = portsOf(line);
      if (ports.length) findings.push({ rule: 'non-standard-port', offset: start + index, found: `the code binds ${ports.length === 1 ? 'the port' : 'the ports'} ${listText(ports.map(String), 5)}` });
    }
    const w = WRITE.exec(line);
    if (w && !TEMP_PATH.test(line)) {
      for (let back = 0; back <= LOOK_BACK && k - back >= 0; back += 1) {
        const where = pathOn(lines[k - back].line, language, back === 0);
        if (!where) continue;
        findings.push({ rule: 'local-disk-write', offset: start + w.index, found: `the code writes a file through "${snippet(w[0].replace(/\s+/g, ''))}" to ${where.text}${back ? ` (named ${back} ${back === 1 ? 'line' : 'lines'} above)` : ''}` });
        break;
      }
    }
  });
  return { findings, facts: {} };
}

const lastParent = (tag) => tag.parents.at(-1);
const valueIs = (attr, ...values) => attr !== undefined && values.includes(asciiLower(attr.value.trim()));

// The secrets of the attributes of a tag: an attribute named like a secret, the value of an appSettings entry whose key
// is named like one, and the secret parts of a connection string in any attribute.
function secretsOfTag(tag, findings) {
  const key = attrOf(tag, 'key');
  for (const a of tag.attrs) {
    const flagged = (name) => !isPlaceholder(a.value) && !valueIs(a, 'true', 'false') && isSecretName(name);
    if (flagged(a.name)) findings.push({ rule: 'hard-coded-secret', offset: a.offset, found: `the attribute "${snippet(a.name)}" of <${snippet(tag.name)}> holds a secret written in the file; the value is masked` });
    else if (a.lower === 'value' && key && flagged(key.value)) findings.push({ rule: 'hard-coded-secret', offset: a.offset, found: `the setting "${snippet(key.value)}" holds a secret written in the file; the value is masked` });
    else {
      const name = attrOf(tag, 'name');
      let what = `the attribute "${snippet(a.name)}" of <${snippet(tag.name)}>`;
      if (a.lower === 'connectionstring') what = `the connection string${name ? ` "${snippet(name.value)}"` : ''}`;
      else if (a.lower === 'value' && key) what = `the setting "${snippet(key.value)}"`;
      for (const s of connectionSecrets(a.value)) findings.push({ rule: 'hard-coded-secret', offset: a.offset + s.at, found: `${what} holds ${snippet(s.key)}= with a secret written in the file; the value is masked` });
    }
  }
}

// The findings and facts of a web.config file, tag by tag.
export function scanWebConfig(text) {
  const tags = xmlTags(blankComments(text, 'xml'));
  const findings = [];
  const facts = { assemblies: [], frameworks: [] };
  const push = (rule, offset, found) => findings.push({ rule, offset, found });
  for (const t of tags) {
    const first = findings.length;
    const parent = lastParent(t);
    const mode = attrOf(t, 'mode');
    if (t.lower === 'authentication' && valueIs(mode, 'windows')) push('windows-authentication', mode.offset, 'web.config sets <authentication mode="Windows">, which signs users in with their Windows account');
    if (t.lower === 'windowsauthentication' && valueIs(attrOf(t, 'enabled'), 'true')) push('windows-authentication', attrOf(t, 'enabled').offset, 'web.config turns on <windowsAuthentication> in IIS');
    if (t.lower === 'identity' && valueIs(attrOf(t, 'impersonate'), 'true')) push('windows-authentication', attrOf(t, 'impersonate').offset, 'web.config sets <identity impersonate="true">, which runs requests as the Windows user');
    if (t.lower === 'add' && parent === 'assemblies') {
      const a = attrOf(t, 'assembly');
      if (a && a.value.trim() !== '*') facts.assemblies.push({ name: a.value.split(',')[0].trim(), offset: a.offset });
    }
    if (t.lower === 'smtp' && valueIs(attrOf(t, 'deliveryMethod'), 'specifiedpickupdirectory', 'pickupdirectoryfromiis')) push('smtp-pickup-directory', attrOf(t, 'deliveryMethod').offset, `web.config sends mail with deliveryMethod="${snippet(attrOf(t, 'deliveryMethod').value)}", which drops each message into a folder`);
    if (t.lower === 'netmsmqbinding' || t.lower === 'msmqintegrationbinding') push('msmq', t.offset, `web.config configures the WCF binding <${snippet(t.name)}>, which needs MSMQ`);
    for (const a of t.attrs) if (/^\s*(?:net\.msmq:\/\/|msmq\.formatname:|formatname:)/i.test(a.value)) push('msmq', a.offset, `web.config names the MSMQ address "${snippet(a.value)}"`);
    if (t.lower === 'sessionstate') {
      const m = mode ? asciiLower(mode.value.trim()) : 'inproc';
      if (m === 'inproc') push('inproc-session-state', mode ? mode.offset : t.offset, mode ? 'web.config sets <sessionState mode="InProc">, which keeps state in the memory of one instance' : 'web.config has <sessionState> with no mode, so state is kept InProc, in the memory of one instance');
      else if (m === 'stateserver' || m === 'sqlserver') push('state-server-session', mode.offset, `web.config sets <sessionState mode="${snippet(mode.value)}">, which keeps state in ${m === 'stateserver' ? 'the ASP.NET state service' : 'a SQL Server database'}`);
    }
    if (t.lower === 'add' && (parent === 'modules' || parent === 'httpmodules' || parent === 'handlers' || parent === 'httphandlers')) {
      const type = attrOf(t, 'type');
      const modules = attrOf(t, 'modules');
      const processor = attrOf(t, 'scriptProcessor');
      const name = attrOf(t, 'name') ?? attrOf(t, 'path');
      const label = name ? ` "${snippet(name.value)}"` : '';
      if ((modules && /isapimodule/i.test(modules.value)) || (processor && /\.dll\s*$/i.test(processor.value))) push('isapi-extension', (modules ?? processor).offset, `web.config maps the handler${label} to an ISAPI extension`);
      else if (type && !PLATFORM_TYPE.test(type.value)) push('custom-module-handler', type.offset, `web.config adds the ${parent.endsWith('modules') ? 'HTTP module' : 'HTTP handler'}${label} of type "${snippet(type.value.split(',')[0])}"`);
    }
    if ((t.lower === 'filter' && parent === 'isapifilters') || (t.lower === 'add' && parent === 'isapicgirestriction')) {
      const path = attrOf(t, 'path');
      push('isapi-extension', path ? path.offset : t.offset, `web.config ${t.lower === 'filter' ? 'adds an ISAPI filter' : 'allows an ISAPI or CGI extension'}${path ? ` "${snippet(path.value)}"` : ''}`);
    }
    if (t.lower === 'rule' && t.parents.includes('rewrite')) {
      const name = attrOf(t, 'name');
      push('url-rewrite', name ? name.offset : t.offset, `web.config has the URL Rewrite rule${name ? ` "${snippet(name.value)}"` : ''}`);
    }
    if ((t.lower === 'compilation' || t.lower === 'httpruntime') && attrOf(t, 'targetFramework')) {
      const f = attrOf(t, 'targetFramework');
      facts.frameworks.push({ value: f.value.trim(), offset: f.offset, from: `<${t.lower === 'compilation' ? 'compilation' : 'httpRuntime'} targetFramework>` });
    }
    secretsOfTag(t, findings);
    for (const a of t.attrs) {
      // A value another rule reported, such as the path of an ISAPI extension, is not reported again.
      if (a.lower === 'assembly' || a.lower === 'type' || a.lower === 'scriptprocessor' || findings.slice(first).some((f) => f.offset === a.offset)) continue;
      if (!ABSOLUTE_PATH.test(a.value.trim())) continue;
      const key = attrOf(t, 'key');
      const what = a.lower === 'value' && key ? `the setting "${snippet(key.value)}"` : `${snippet(a.name)} of <${snippet(t.name)}>`;
      push('local-path-setting', a.offset, `web.config sets ${what} to "${snippet(a.value.split(';')[0])}", a local path`);
    }
  }
  return { findings, facts };
}

// The findings and facts of a project file: its target frameworks, its packages and references, and the references
// that point at COM, MSMQ or Windows services.
export function scanProject(text) {
  const tags = xmlTags(blankComments(text, 'xml'));
  const findings = [];
  const facts = { frameworks: [], packages: [] };
  let reference = null;
  for (const t of tags) {
    if (t.lower === 'targetframework' || t.lower === 'targetframeworks' || t.lower === 'targetframeworkversion') {
      let from = 0;
      for (const value of splitFrameworks(t.text)) {
        const at = t.text.indexOf(value, from);
        from = at + value.length;
        facts.frameworks.push({ value, offset: t.textOffset + at, from: `<${t.name}>` });
      }
    }
    const include = attrOf(t, 'Include');
    if (t.lower === 'packagereference' && include) facts.packages.push(include.value.trim());
    if (t.lower === 'reference' && include) {
      reference = { name: include.value.split(',')[0].trim(), tag: t };
      const lower = asciiLower(reference.name);
      if (lower === 'system.messaging') findings.push({ rule: 'msmq', offset: include.offset, found: 'the project references System.Messaging, the MSMQ library' });
      if (lower === 'system.serviceprocess') findings.push({ rule: 'background-work', offset: include.offset, found: 'the project references System.ServiceProcess, the library of Windows services' });
    }
    if (t.lower === 'hintpath' && reference && t.parents.at(-1) === 'reference') facts.packages.push(reference.name);
    if (t.lower === 'comreference' && include) findings.push({ rule: 'com-interop', offset: include.offset, found: `the project references the COM component "${snippet(include.value)}"` });
  }
  return { findings, facts };
}

// The packages of a packages.config file.
export function scanPackages(text) {
  const tags = xmlTags(blankComments(text, 'xml'));
  const packages = tags.filter((t) => t.lower === 'package' && attrOf(t, 'id')).map((t) => attrOf(t, 'id').value.trim());
  return { findings: [], facts: { packages } };
}

// A JSON name and its string value on one line or over a few, as appsettings.json writes them.
const PAIR = /"((?:[^"\\\r\n]|\\.){0,200})"\s*:\s*"((?:[^"\\\r\n]|\\.){0,4000})"/g;

// The findings of an appsettings.json file: secrets, the ports of the URLs it binds and local paths.
export function scanAppSettings(text) {
  const blanked = blankComments(text, 'json');
  const findings = [];
  for (const m of blanked.matchAll(PAIR)) {
    const [, key, value] = m;
    const keyAt = m.index + 1;
    const valueAt = m.index + m[0].length - value.length - 1;
    if (isSecretName(key) && !isPlaceholder(value) && !['true', 'false'].includes(asciiLower(value.trim()))) findings.push({ rule: 'hard-coded-secret', offset: keyAt, found: `the setting "${snippet(key)}" holds a secret written in the file; the value is masked` });
    else for (const s of connectionSecrets(value)) findings.push({ rule: 'hard-coded-secret', offset: valueAt + s.at, found: `the setting "${snippet(key)}" holds ${snippet(s.key)}= with a secret written in the file; the value is masked` });
    if (['urls', 'url', 'aspnetcore_urls', 'http_ports', 'aspnetcore_http_ports'].includes(asciiLower(key))) {
      const ports = /ports$/i.test(key) ? { ports: value.split(/[;,\s]+/).filter((p) => /^\d{1,5}$/.test(p) && !WEB_PORTS.includes(Number(p))).map(Number), index: 0 } : portsOf(value);
      if (ports.ports.length) findings.push({ rule: 'non-standard-port', offset: valueAt + Math.max(ports.index, 0), found: `the setting "${snippet(key)}" binds ${ports.ports.length === 1 ? 'the port' : 'the ports'} ${listText(ports.ports.map(String), 5)}` });
    }
    if (ABSOLUTE_PATH.test(value.trim())) findings.push({ rule: 'local-path-setting', offset: valueAt, found: `the setting "${snippet(key)}" is "${snippet(value.split(';')[0])}", a local path` });
  }
  return { findings, facts: {} };
}

// The scan of a file of a kind.
export function scanFile(text, kind) {
  if (kind === 'web-config') return scanWebConfig(text);
  if (kind === 'project') return scanProject(text);
  if (kind === 'packages') return scanPackages(text);
  if (kind === 'appsettings') return scanAppSettings(text);
  if (kind === 'cs' || kind === 'vb' || kind === 'asax') return scanCode(text, LANGUAGE[kind]);
  throw new Error(`unknown kind ${kind}`);
}
