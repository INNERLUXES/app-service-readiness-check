// The simple globs of --exclude and of exclude in the configuration. A glob is matched against the path of a file or
// folder relative to the folder scanned, with forward slashes, without regard to the case of the letters A to Z:
//
//   *        any characters in one name, not a slash
//   ?        one character that is not a slash
//   **       any characters, slashes included; "a/**/b" also matches "a/b"
//   name     a glob with no slash matches a file or folder of that name at any depth ("Scripts", "*.Designer.cs")
//   a/b      a glob with a slash matches the whole path from the folder scanned ("legacy/**", "src/*/Proxies")
//   a/       a trailing slash matches folders only
//
// A folder that matches is not walked, so nothing below it is read. No other character has a meaning: brackets,
// braces and backslashes are refused, so a glob means the same on every system. A glob is matched with one pass per
// part over a list of places, with no regular expression built from it and no recursion.

import { asciiLower } from './words.js';

export const GLOB_LIMITS = { maxLength: 200 };

// A glob, checked and split into parts: { source, nameOnly, dirOnly, parts }, or an Error with the reason.
export function compileGlob(source) {
  const s = String(source);
  if (s.length === 0 || s.length > GLOB_LIMITS.maxLength) throw new Error(`a glob holds 1 to ${GLOB_LIMITS.maxLength} characters`);
  if (/[\\[\]{}]/.test(s)) throw new Error(`the glob "${s.slice(0, 60)}" holds a backslash, a bracket or a brace; write paths with forward slashes, and use only *, ** and ?`);
  let body = s.startsWith('./') ? s.slice(2) : s;
  while (body.startsWith('/')) body = body.slice(1);
  const dirOnly = body.endsWith('/');
  while (body.endsWith('/')) body = body.slice(0, -1);
  if (body === '' || body.split('/').some((p) => p === '' || p === '.' || p === '..')) throw new Error(`the glob "${s.slice(0, 60)}" has an empty part, "." or ".."`);
  const parts = [];
  const text = asciiLower(body);
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('**/', i)) {
      parts.push({ t: 'any-folders' });
      i += 3;
    } else if (text.startsWith('**', i)) {
      parts.push({ t: 'any' });
      i += 2;
    } else if (text[i] === '*') {
      parts.push({ t: 'star' });
      i += 1;
    } else if (text[i] === '?') {
      parts.push({ t: 'one' });
      i += 1;
    } else {
      parts.push({ t: 'char', c: text[i] });
      i += 1;
    }
  }
  return { source: s, nameOnly: !body.includes('/'), dirOnly, parts };
}

// True when a compiled glob matches a path (relative, forward slashes) of a file or, with isDir, a folder.
export function globMatches(glob, path, isDir = false) {
  if (glob.dirOnly && !isDir) return false;
  const full = asciiLower(path);
  const p = glob.nameOnly ? full.slice(full.lastIndexOf('/') + 1) : full;
  const n = p.length;
  let cur = new Uint8Array(n + 1);
  cur[0] = 1;
  for (const part of glob.parts) {
    const next = new Uint8Array(n + 1);
    if (part.t === 'char' || part.t === 'one') {
      for (let i = 0; i < n; i += 1) if (cur[i] && (part.t === 'one' ? p[i] !== '/' : p[i] === part.c)) next[i + 1] = 1;
    } else if (part.t === 'star') {
      for (let i = 0; i <= n; i += 1) next[i] = cur[i] || (i > 0 && next[i - 1] && p[i - 1] !== '/') ? 1 : 0;
    } else if (part.t === 'any') {
      for (let i = 0; i <= n; i += 1) next[i] = cur[i] || (i > 0 && next[i - 1]) ? 1 : 0;
    } else {
      let seen = false;
      for (let i = 0; i <= n; i += 1) {
        next[i] = cur[i] || (seen && p[i - 1] === '/') ? 1 : 0;
        if (cur[i]) seen = true;
      }
    }
    cur = next;
  }
  return cur[n] === 1;
}
