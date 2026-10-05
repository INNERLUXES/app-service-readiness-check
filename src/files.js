// Reading a file: a file of the folder scanned, or the configuration. Each file is opened once with O_NOFOLLOW where
// the system has it, and its type and size are taken from the open handle, so a file swapped for a link, a pipe or a
// device after it was found is refused, and a file over its limit is refused before it is read. A file is read as
// UTF-8, with or without a byte order mark, or as UTF-16 when it starts with the byte order mark of UTF-16 (little or
// big endian), which is how some editors save web.config. A file without a byte order mark whose bytes are not valid
// UTF-8 is read as Latin-1, one character per byte, because old source files are often saved in a Windows code page
// and the checks look only at ASCII; the report counts such files. A file that holds a null byte without a UTF-16 byte
// order mark is binary and is not read. The tool writes nothing to disk. The walk of the folder is in src/walk.js.

import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = { maxConfigBytes: 1024 * 1024, maxFileBytes: 8 * 1024 * 1024 };

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The flags a file is opened with: read only, and not through a symbolic link where the system can refuse one.
export const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

// The whole file, or an error when it is not a regular file or is over the limit.
export async function readBounded(path, maxBytes) {
  let handle;
  try {
    handle = await open(resolve(path), OPEN_FLAGS);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    if (error.code === 'ELOOP' || error.code === 'EMLINK') throw fileError(path, 'is a symbolic link, which is not followed');
    if (error.code === 'EISDIR') throw fileError(path, 'is a folder');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (opened.isDirectory()) throw fileError(path, 'is a folder');
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// The encoding of a file from its first bytes: utf-16le or utf-16be after their byte order marks, else utf-8.
export function encodingOf(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf-16le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be';
  return 'utf-8';
}

// The text of the bytes in an encoding, without a byte order mark, or null when the bytes are not valid in it or hold
// a null character. UTF-16 big endian is read by swapping each pair of bytes, so it needs no extra decoder.
export function decodeText(buffer, encoding = encodingOf(buffer)) {
  let bytes = buffer;
  if (encoding === 'utf-16be') {
    if (buffer.length % 2) return null;
    bytes = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i += 2) {
      bytes[i] = buffer[i + 1];
      bytes[i + 1] = buffer[i];
    }
  }
  let text;
  try {
    text = new TextDecoder(encoding === 'utf-8' ? 'utf-8' : 'utf-16le', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.includes(String.fromCharCode(0)) ? null : text;
}

// The text of a buffer: { encoding, text }, where encoding is utf-8, utf-16le, utf-16be or latin-1, or an error whose
// .reason says why the bytes are not text.
export function textOf(buffer, shown) {
  const encoding = encodingOf(buffer);
  if (encoding === 'utf-8' && buffer.includes(0)) throw fileError(shown, 'holds binary data (a null byte); a UTF-16 file needs its byte order mark');
  const text = decodeText(buffer, encoding);
  if (text !== null) return { encoding, text };
  if (encoding !== 'utf-8') throw fileError(shown, 'is not valid UTF-16; save the file again as UTF-8');
  return { encoding: 'latin-1', text: buffer.toString('latin1') };
}

// The text of a file, or an error whose .reason says why it is not read: missing, a link, a folder, not a regular file,
// over the limit, binary, or not valid UTF-16. shown is the path the error names.
export async function readText(full, shown, maxBytes) {
  const buffer = await readBounded(full, maxBytes).catch((error) => {
    throw fileError(shown, error.reason ?? error.message);
  });
  return { size: buffer.length, ...textOf(buffer, shown) };
}

// What a path named on the command line is: { full, shown, folder }, or an error when it is missing, a symbolic link or
// neither a file nor a folder. The path is looked at without following a link.
export async function inspectPath(path, base) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  let info;
  try {
    info = await lstat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such file or folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (info.isSymbolicLink()) throw fileError(shown, 'is a symbolic link, which is not followed; name the folder or file itself');
  if (!info.isFile() && !info.isDirectory()) throw fileError(shown, 'is not a regular file or folder');
  return { full, shown, folder: info.isDirectory() };
}

// The configuration named on the command line, read as text: { file, full, size, encoding, text }.
export async function readTextFile(path, base, maxBytes) {
  const { full, shown, folder } = await inspectPath(path, base);
  if (folder) throw fileError(shown, 'is a folder; give the file itself');
  const read = await readText(full, shown, maxBytes);
  if (read.encoding === 'latin-1') throw fileError(shown, 'is not valid UTF-8; save the file again as UTF-8');
  return { file: shown, full, ...read };
}
