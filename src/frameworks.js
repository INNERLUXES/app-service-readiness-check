// The target frameworks of a project, as a documented data file. A value is read from <TargetFramework>,
// <TargetFrameworks> (split at semicolons) or <TargetFrameworkVersion> of a project file, or from the targetFramework
// attribute of <compilation> or <httpRuntime> in web.config, and brought to one short form:
//
//   v4.7.2, 4.7.2, net472          .NET Framework 4.7.2, short form net472 (the same for 1.0 to 4.8.1)
//   netcoreapp3.1                  .NET Core 3.1, short form netcoreapp3.1
//   net8.0, net8.0-windows         .NET 8, short form net8.0 (a platform after the hyphen is dropped)
//   netstandard2.0                 a library, not an app: it is not compared with the list
//
// Letters are compared without regard to case. Any other value is reported as a form the tool does not read.
// Check the list before you rely on it: the frameworks App Service offers change, and the list of the tool is in
// src/defaults.js (DEFAULT_FRAMEWORKS), with allowedFrameworks in the configuration to add one.

import { asciiLower } from './words.js';

export const FAMILIES = { netfx: '.NET Framework', netcore: '.NET Core', net: '.NET', netstandard: '.NET Standard' };

// The framework of a value: { tfm, family } or null when the value is none of the forms above.
export function frameworkOf(value) {
  const v = asciiLower(String(value).trim());
  let m = /^v?([1-4])\.([0-9])(?:\.([0-9]))?$/.exec(v);
  if (m) return { tfm: `net${m[1]}${m[2]}${m[3] ?? ''}`, family: 'netfx' };
  m = /^net([1-4])([0-9])([0-9]?)$/.exec(v);
  if (m) return { tfm: v, family: 'netfx' };
  m = /^netcoreapp([1-3])\.([0-9])$/.exec(v);
  if (m) return { tfm: v, family: 'netcore' };
  m = /^net([5-9]|[1-9][0-9])\.([0-9])(?:-[a-z][a-z0-9.]{0,30})?$/.exec(v);
  if (m) return { tfm: `net${m[1]}.${m[2]}`, family: 'net' };
  m = /^netstandard([1-2])\.([0-9])$/.exec(v);
  if (m) return { tfm: v, family: 'netstandard' };
  return null;
}

// The values of a <TargetFrameworks> list, trimmed, with empty ones left out.
export const splitFrameworks = (text) => String(text).split(';').map((x) => x.trim()).filter(Boolean);
