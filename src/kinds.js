// The kind of a file, from its name, compared without regard to the case of the letters A to Z. Only these files are
// read; every other file in the folder is passed over and counted.
//
//   web-config   web.config, and web.<name>.config such as web.release.config
//   appsettings  appsettings.json, and appsettings.<name>.json such as appsettings.production.json
//   project      a .csproj or .vbproj file
//   packages     packages.config
//   asax         global.asax
//   cs           a .cs file, Global.asax.cs included
//   vb           a .vb file, Global.asax.vb included

import { asciiLower, baseName } from './words.js';

// The kinds the tool reads, in the order the reports list them, with the name each report gives them.
export const KINDS = [
  { kind: 'web-config', label: 'web.config' },
  { kind: 'appsettings', label: 'appsettings' },
  { kind: 'project', label: 'project' },
  { kind: 'packages', label: 'packages.config' },
  { kind: 'asax', label: 'Global.asax' },
  { kind: 'cs', label: 'C#' },
  { kind: 'vb', label: 'VB' }
];

// The language a file is read in, to blank its comments (src/lexer.js).
export const LANGUAGE = { 'web-config': 'xml', appsettings: 'json', project: 'xml', packages: 'xml', asax: 'asax', cs: 'cs', vb: 'vb' };

// The kind of a path, or null.
export function fileKind(path) {
  const name = asciiLower(baseName(path));
  if (name === 'web.config' || (name.startsWith('web.') && name.endsWith('.config') && name.length > 'web..config'.length)) return 'web-config';
  if (name === 'appsettings.json' || (name.startsWith('appsettings.') && name.endsWith('.json') && name.length > 'appsettings..json'.length)) return 'appsettings';
  if ((name.endsWith('.csproj') && name.length > 7) || (name.endsWith('.vbproj') && name.length > 7)) return 'project';
  if (name === 'packages.config') return 'packages';
  if (name === 'global.asax') return 'asax';
  if (name.endsWith('.cs') && name.length > 3) return 'cs';
  if (name.endsWith('.vb') && name.length > 3) return 'vb';
  return null;
}
