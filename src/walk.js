// The walk of the folder scanned: every folder below it, with a list of its own and no recursion, in the order of the
// names. A symbolic link (a junction on Windows too) is counted and never followed, so the walk cannot leave the folder
// or go round a loop. The folders of SKIPPED_FOLDERS and every file or folder that matches an --exclude glob are passed
// over and counted. Of the files, only the kinds of src/kinds.js are kept. The walk stops at its limits and says so, so
// a run never passes because a part of the folder was not read.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SKIPPED_FOLDERS } from './defaults.js';
import { globMatches } from './glob.js';
import { fileKind } from './kinds.js';
import { asciiLower, byCode, joinPath } from './words.js';

export const WALK_LIMITS = { maxFiles: 20000, maxEntries: 500000, maxDepth: 64 };

// The files of a folder: { files: [{ rel, full, kind }], skipped: { names, count }, excluded, links, others,
// unreadable: [{ rel, reason }], limit }, where rel is the path relative to the folder with forward slashes and limit
// is null or the limit the walk stopped at.
export async function walkFolder(root, { excludes = [], limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const files = [];
  const unreadable = [];
  const skippedNames = new Set();
  let skipped = 0;
  let excluded = 0;
  let links = 0;
  let others = 0;
  let entries = 0;
  let limit = null;
  const skip = new Set(SKIPPED_FOLDERS.map(asciiLower));
  const stack = [{ full: root, rel: '', depth: 0 }];
  while (stack.length && !limit) {
    const dir = stack.pop();
    let list;
    try {
      list = await readdir(dir.full, { withFileTypes: true });
    } catch (error) {
      unreadable.push({ rel: dir.rel || '.', reason: `the folder cannot be read (${error.code ?? error.message})` });
      continue;
    }
    list.sort((a, b) => byCode(a.name, b.name));
    const folders = [];
    for (const entry of list) {
      entries += 1;
      if (entries > lim.maxEntries) {
        limit = `more than ${lim.maxEntries.toLocaleString('en-US')} files and folders`;
        break;
      }
      const rel = joinPath(dir.rel, entry.name);
      if (entry.isSymbolicLink()) {
        links += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (skip.has(asciiLower(entry.name))) {
          skipped += 1;
          skippedNames.add(asciiLower(entry.name));
        } else if (excludes.some((g) => globMatches(g, rel, true))) excluded += 1;
        else if (dir.depth + 1 > lim.maxDepth) limit = `folders nested more than ${lim.maxDepth} deep (${rel})`;
        else folders.push({ full: join(dir.full, entry.name), rel, depth: dir.depth + 1 });
        continue;
      }
      if (!entry.isFile()) {
        others += 1;
        continue;
      }
      const kind = fileKind(entry.name);
      if (kind === null) {
        others += 1;
        continue;
      }
      if (excludes.some((g) => globMatches(g, rel, false))) {
        excluded += 1;
        continue;
      }
      if (files.length >= lim.maxFiles) {
        limit = `more than ${lim.maxFiles.toLocaleString('en-US')} files of the kinds read`;
        break;
      }
      files.push({ rel, full: join(dir.full, entry.name), kind });
    }
    for (let i = folders.length - 1; i >= 0; i -= 1) stack.push(folders[i]);
  }
  files.sort((a, b) => byCode(a.rel, b.rel));
  return { files, skipped: { names: [...skippedNames].sort(byCode), count: skipped }, excluded, links, others, unreadable, limit };
}
