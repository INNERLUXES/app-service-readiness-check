import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { KINDS, LANGUAGE, asciiLower, baseName, byCode, capped, decodeText, displayPath, encodingOf, fileError, fileKind, flat, folderOf, grouped, inspectPath, joinPath, levelOf, lineStarts, listText, plural, positionOf, readBounded, readText, readTextFile, safeText, textOf } from '../src/index.js';
import { configOf, withFiles } from './helpers.js';

// The small helpers: numbers and lists, text cleaning, words and paths, kinds, lines and columns, and the files the
// tool reads.

test('size: grouped numbers, lists and plurals', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(plural(1, 'app'), '1 app');
  assert.equal(plural(2, 'app'), '2 apps');
  assert.equal(plural(2, 'symbolic link'), '2 symbolic links');
});

test('text: control, line separator and direction characters become spaces; long text is cut; problems are capped', () => {
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d${String.fromCharCode(0x9b)}e`), 'a b c d e');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n\t b '), 'a b');
  assert.deepEqual(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).slice(-2), ['p19', 'and 5 more']);
  assert.deepEqual(capped(['a']), ['a']);
  assert.equal(levelOf({ key: null }, configOf()), 'error');
  assert.equal(levelOf({ key: 'msmq' }, configOf({ rules: { msmq: 'off' } })), 'off');
});

test('words: lowercase for A to Z only, the parts of a path, and code order', () => {
  assert.equal(asciiLower('ABC-xyz'), 'abc-xyz');
  assert.equal(asciiLower(`${String.fromCharCode(0x130)}I`), `${String.fromCharCode(0x130)}i`, 'no letter past ASCII changes, whatever the locale');
  assert.equal(baseName('a/b/Web.config'), 'Web.config');
  assert.equal(baseName('Web.config'), 'Web.config');
  assert.equal(joinPath('a', 'b'), 'a/b');
  assert.equal(joinPath('.', 'b'), 'b');
  assert.equal(joinPath('a', '.'), 'a');
  assert.equal(joinPath('', 'b'), 'b');
  assert.equal(folderOf('a/b/c.cs'), 'a/b');
  assert.equal(folderOf('c.cs'), '.');
  assert.deepEqual(['b', 'B', 'a'].sort(byCode), ['B', 'a', 'b']);
  assert.equal(byCode('a', 'a'), 0);
});

test('kinds: the files the tool reads, in any case, and nothing else', () => {
  assert.deepEqual(KINDS.map((k) => k.kind), ['web-config', 'appsettings', 'project', 'packages', 'asax', 'cs', 'vb']);
  const expected = { 'Web.config': 'web-config', 'web.Release.config': 'web-config', 'WEB.CONFIG': 'web-config', 'appsettings.json': 'appsettings', 'appsettings.Production.json': 'appsettings', 'a/Shop.csproj': 'project', 'Legacy.vbproj': 'project', 'packages.config': 'packages', 'Global.asax': 'asax', 'Global.asax.cs': 'cs', 'Module1.VB': 'vb', 'x/Program.cs': 'cs' };
  for (const [name, kind] of Object.entries(expected)) assert.equal(fileKind(name), kind, name);
  for (const name of ['web..config', 'app.config', 'webx.config', 'appsettings.json.bak', 'appsettings..json', 'settings.json', '.cs', '.csproj', 'a.cshtml', 'a.vbhtml', 'Default.aspx', 'web.config.bak', 'packages.lock.json']) assert.equal(fileKind(name), null, name);
  assert.deepEqual(LANGUAGE, { 'web-config': 'xml', appsettings: 'json', project: 'xml', packages: 'xml', asax: 'asax', cs: 'cs', vb: 'vb' });
});

test('lines: LF, CRLF and a lone CR each end a line; positions count from 1', () => {
  const starts = lineStarts('a\nb\r\nc\rd');
  assert.deepEqual(starts, [0, 2, 5, 7]);
  assert.deepEqual(positionOf(starts, 6), { line: 3, column: 2 });
});

test('files: UTF-8 with or without a byte order mark, UTF-16 after its byte order mark, Latin-1 for other bytes, and no binary', () => {
  const base = resolve('base');
  assert.equal(displayPath(resolve(base, 'a/b.cs'), base), 'a/b.cs');
  assert.equal(displayPath(base, base), '.');
  assert.ok(displayPath(resolve(base, '../x.cs'), base).endsWith('/x.cs'));
  assert.equal(fileError('a.cs', 'why').message, 'a.cs: why');
  assert.equal(fileError('a.cs', 'why').reason, 'why');
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a/>', 'utf16le')]);
  const be = Buffer.from(le);
  for (let i = 0; i < be.length; i += 2) [be[i], be[i + 1]] = [le[i + 1], le[i]];
  assert.equal(encodingOf(le), 'utf-16le');
  assert.equal(encodingOf(be), 'utf-16be');
  assert.equal(encodingOf(Buffer.from('a')), 'utf-8');
  assert.equal(decodeText(le), '<a/>');
  assert.equal(decodeText(be), '<a/>');
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.equal(decodeText(Buffer.from([0xc3])), null);
  assert.equal(decodeText(Buffer.from([0xfe, 0xff, 0x00])), null, 'an odd number of bytes is not UTF-16');
  assert.deepEqual(textOf(Buffer.from([0x63, 0xe9, 0x64]), 'x.cs'), { encoding: 'latin-1', text: `c${String.fromCharCode(0xe9)}d` });
  assert.deepEqual(textOf(le, 'x'), { encoding: 'utf-16le', text: '<a/>' });
  assert.throws(() => textOf(Buffer.from([0x61, 0, 0x62]), 'x.cs'), /x\.cs: holds binary data \(a null byte\)/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x00, 0xd8]), 'x.cs'), /x\.cs: is not valid UTF-16/);
});

test('files: a file is read whole, and a missing file, a folder or one over its limit is refused', async () => {
  await withFiles({ 'a.cs': 'x\n', 'd/b.cs': 'x', 'c.json': '{}', 'l.json': Buffer.from([0x7b, 0xe9, 0x7d]) }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.cs'), 100)).toString(), 'x\n');
    await assert.rejects(readBounded(resolve(dir, 'a.cs'), 1), /2 bytes is over the 1 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'nope.cs'), 100), /no such file/);
    await assert.rejects(readBounded(resolve(dir, 'd'), 100), /is a folder/);
    assert.deepEqual(await readText(resolve(dir, 'a.cs'), 'a.cs', 100), { size: 2, encoding: 'utf-8', text: 'x\n' });
    const t = await readTextFile('c.json', dir, 100);
    assert.deepEqual([t.file, t.text, t.encoding], ['c.json', '{}', 'utf-8']);
    await assert.rejects(readTextFile('l.json', dir, 100), /l\.json: is not valid UTF-8; save the file again as UTF-8/);
    await assert.rejects(readTextFile('d', dir, 100), /d: is a folder; give the file itself/);
    assert.deepEqual(await inspectPath('a.cs', dir), { full: resolve(dir, 'a.cs'), shown: 'a.cs', folder: false });
    assert.deepEqual(await inspectPath('d', dir), { full: resolve(dir, 'd'), shown: 'd', folder: true });
    await assert.rejects(inspectPath('nope', dir), /nope: no such file or folder/);
  });
});
