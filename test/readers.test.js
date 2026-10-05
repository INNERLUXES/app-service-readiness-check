import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOB_LIMITS, XML_LIMITS, attrOf, blankComments, compileGlob, decodeEntities, globMatches, xmlTags } from '../src/index.js';

// The readers under the checks: comments blanked in every language with the places kept, the tags of XML, and the
// globs of --exclude.

const keepsShape = (before, after) => {
  assert.equal(after.length, before.length);
  assert.deepEqual([...after].map((c, i) => (c === '\n' || c === '\r' ? i : -1)).filter((i) => i >= 0), [...before].map((c, i) => (c === '\n' || c === '\r' ? i : -1)).filter((i) => i >= 0));
};

test('lexer: C# line and block comments are blanked, strings of every form are kept', () => {
  const text = 'var a = "// not a comment"; // gone\r\nvar b = @"C:\\x"" /* kept */"; /* gone\n still gone */ var c = \'"\';\nvar d = $@"{x} // kept"; var e = """raw // kept"""; var f = \'\\\'\'; // gone';
  const out = blankComments(text, 'cs');
  keepsShape(text, out);
  for (const kept of ['"// not a comment"', '@"C:\\x"" /* kept */"', "'\"'", '$@"{x} // kept"', '"""raw // kept"""', 'var c', 'var f']) assert.ok(out.includes(kept), kept);
  assert.ok(!out.includes('gone'));
});

test('lexer: an unclosed string ends at the line end, an unclosed comment at the end of the text', () => {
  assert.equal(blankComments('var a = "open\nvar b = 1; // x', 'cs'), 'var a = "open\nvar b = 1;     ');
  assert.equal(blankComments('a /* b\nc', 'cs'), 'a     \n ');
  assert.equal(blankComments('"\\', 'cs'), '"\\');
});

test('lexer: VB comments with a quote or REM, outside strings with doubled quotes', () => {
  const text = 'Dim a = "it\'s ""quoted"" \' kept" \' gone\nREM gone\n  rem gone too\nDim remark = 1 : REM gone\nDim b = 2 ' + String.fromCharCode(0x2019) + ' gone';
  const out = blankComments(text, 'vb');
  keepsShape(text, out);
  assert.ok(out.includes('"it\'s ""quoted"" \' kept"'));
  assert.ok(out.includes('Dim remark = 1 :'));
  assert.ok(!out.includes('gone'));
});

test('lexer: JSON keeps quotes of every kind in strings and blanks // and /* */; XML and Global.asax blank their own', () => {
  assert.equal(blankComments('{"a": "x//y", // c\n"b": 1 /* d */}', 'json'), '{"a": "x//y",     \n"b": 1        }');
  assert.equal(blankComments('{"a": "it\'s"} // c', 'json'), '{"a": "it\'s"}     ');
  assert.equal(blankComments('<a><!-- <b x="1"/> --><c/></a>', 'xml'), `<a>${' '.repeat('<!-- <b x="1"/> -->'.length)}<c/></a>`);
  assert.equal(blankComments('<!-- open', 'xml'), '         ');
  const asax = '<%@ Application Inherits="G" %>\n<%-- EventLog.WriteEntry("x") --%>\n<!-- y -->\n<script runat="server">// z\n</script>';
  const out = blankComments(asax, 'asax');
  keepsShape(asax, out);
  assert.ok(!out.includes('EventLog') && !out.includes('y') && !out.includes('// z'));
  assert.ok(out.includes('Inherits="G"'));
  assert.throws(() => blankComments('x', 'cobol'), /unknown language cobol/);
});

test('xml: tags with their attributes, places, parents and text', () => {
  const text = '<?xml version="1.0"?>\n<configuration>\n  <system.web>\n    <compilation targetFramework="4.8" debug=\'true\'>\n      <assemblies><add assembly="A, Version=1.0" /></assemblies>\n    </compilation>\n  </system.web>\n  <x:y a = "1&amp;2" />\n</configuration>';
  const tags = xmlTags(text);
  assert.deepEqual(tags.map((t) => t.lower), ['configuration', 'system.web', 'compilation', 'assemblies', 'add', 'x:y']);
  const add = tags.find((t) => t.lower === 'add');
  assert.deepEqual(add.parents, ['configuration', 'system.web', 'compilation', 'assemblies']);
  assert.equal(attrOf(add, 'ASSEMBLY').value, 'A, Version=1.0');
  assert.equal(text.slice(attrOf(add, 'assembly').offset, attrOf(add, 'assembly').offset + 1), 'A');
  assert.equal(attrOf(tags[2], 'debug').value, 'true');
  assert.equal(attrOf(tags[5], 'a').value, '1&2');
  assert.deepEqual(tags[5].parents, ['configuration']);
  assert.equal(attrOf(tags[0], 'nope'), undefined);
});

test('xml: element text, CDATA, broken tags and the limits', () => {
  const tags = xmlTags('<p><TargetFramework> net8.0 </TargetFramework><![CDATA[<q a="1">]]><!DOCTYPE x><r a="1" b c="2"<s/></p>');
  assert.deepEqual(tags.map((t) => t.lower), ['p', 'targetframework', 'r', 's']);
  assert.equal(tags[1].text, ' net8.0 ');
  assert.deepEqual(tags[2].attrs.map((a) => [a.name, a.value]), [['a', '1'], ['c', '2']]);
  assert.deepEqual(xmlTags('<a x="never closed').map((t) => t.attrs[0].value), ['never closed']);
  assert.deepEqual(xmlTags('< a><1b><c').map((t) => t.lower), ['c']);
  assert.equal(xmlTags('<a/>'.repeat(10), { ...XML_LIMITS, maxTags: 3 }).length, 3);
  assert.equal(decodeEntities('&lt;&gt;&quot;&apos;&amp;&nbsp;'), '<>"\'&&nbsp;');
});

test('glob: *, ? and ** with names and paths, folders only with a trailing slash, letters in any case', () => {
  const m = (g, p, dir = false) => globMatches(compileGlob(g), p, dir);
  assert.ok(m('Proxies', 'a/b/Proxies', true));
  assert.ok(m('*.Designer.cs', 'Forms/Main.designer.cs'));
  assert.ok(!m('*.Designer.cs', 'Forms/Main.cs'));
  assert.ok(m('legacy/**', 'legacy/a/b/c.cs'));
  assert.ok(m('src/*/Gen', 'src/app/gen', true));
  assert.ok(!m('src/*/Gen', 'src/a/b/Gen', true));
  assert.ok(m('a/**/b.cs', 'a/b.cs'));
  assert.ok(m('a/**/b.cs', 'a/x/y/b.cs'));
  assert.ok(!m('a/**/b.cs', 'a/xb.cs'));
  assert.ok(m('**/Proxies/**', 'x/Proxies/y.cs'));
  assert.ok(m('file?.cs', 'file1.cs'));
  assert.ok(!m('file?.cs', 'file12.cs'));
  assert.ok(m('./obj2/', 'obj2', true));
  assert.ok(!m('obj2/', 'obj2'));
  assert.ok(!m('*.cs', 'a/b.vb'));
  assert.ok(m('/top/x.cs', 'top/x.cs'));
});

test('glob: an empty glob, a backslash, a bracket, a brace and . or .. are refused', () => {
  for (const [g, why] of [['', /1 to 200 characters/], ['x'.repeat(GLOB_LIMITS.maxLength + 1), /1 to 200 characters/], ['a\\b', /backslash, a bracket or a brace/], ['[ab].cs', /bracket/], ['{a,b}', /brace/], ['a/../b', /"\.\."/], ['a//b', /an empty part/], ['/', /an empty part/]]) assert.throws(() => compileGlob(g), why, g);
});
