// The tags of an XML file (web.config, a project file, packages.config), read once, left to right, with no recursion
// and no regular expression built from the input. This is not a full XML reader: it finds each start tag with its
// name, its attributes and their places, the names of the elements it sits inside, and the text that follows it up to
// the next tag. Comments are blanked before (src/lexer.js); declarations, processing instructions and CDATA sections
// are passed over. A file that is not well formed is still read as far as it goes, because the checks are heuristic
// and a broken tag must not hide the rest of the file. The five predefined entities are decoded in values and text.

export const XML_LIMITS = { maxTags: 200000, maxDepth: 256 };

const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13;
const isNameStart = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58;
const isNameChar = (c) => isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 46;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// A value with the five predefined entities decoded; any other entity is left as written.
export const decodeEntities = (value) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e]);

const lowerAscii = (text) => text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

function readName(text, i) {
  let j = i;
  while (j < text.length && isNameChar(text.charCodeAt(j))) j += 1;
  return j;
}

// The start tags of a text: [{ name, lower, offset, parents, attrs: [{ name, lower, value, offset }], text,
// textOffset }], where parents lists the lowered names of the open elements around the tag, outermost first, and
// offset is the place of the "<" (of the value, for an attribute).
export function xmlTags(text, limits = XML_LIMITS) {
  const tags = [];
  const stack = [];
  const n = text.length;
  let i = text.indexOf('<');
  while (i >= 0 && i < n) {
    const c = text.charCodeAt(i + 1);
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i);
      i = end < 0 ? -1 : text.indexOf('<', end + 3);
      continue;
    }
    if (c === 33 || c === 63) {
      const end = text.indexOf('>', i);
      i = end < 0 ? -1 : text.indexOf('<', end + 1);
      continue;
    }
    if (c === 47) {
      const end = readName(text, i + 2);
      const lower = lowerAscii(text.slice(i + 2, end));
      const at = stack.lastIndexOf(lower);
      if (at >= 0) stack.length = at;
      const close = text.indexOf('>', end);
      i = close < 0 ? -1 : text.indexOf('<', close + 1);
      continue;
    }
    if (!isNameStart(c)) {
      i = text.indexOf('<', i + 1);
      continue;
    }
    const nameEnd = readName(text, i + 1);
    const name = text.slice(i + 1, nameEnd);
    const tag = { name, lower: lowerAscii(name), offset: i, parents: [...stack], attrs: [], text: '', textOffset: -1 };
    let j = nameEnd;
    let selfClosing = false;
    let ended = false;
    while (j < n) {
      const d = text.charCodeAt(j);
      if (isSpace(d)) {
        j += 1;
        continue;
      }
      if (d === 62) {
        j += 1;
        ended = true;
        break;
      }
      if (d === 47 && text.charCodeAt(j + 1) === 62) {
        j += 2;
        selfClosing = true;
        ended = true;
        break;
      }
      if (d === 60) break;
      if (!isNameStart(d)) {
        j += 1;
        continue;
      }
      const attrEnd = readName(text, j);
      const attrName = text.slice(j, attrEnd);
      j = attrEnd;
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      if (text.charCodeAt(j) !== 61) continue;
      j += 1;
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      const quote = text.charCodeAt(j);
      if (quote !== 34 && quote !== 39) continue;
      const close = text.indexOf(String.fromCharCode(quote), j + 1);
      const valueEnd = close < 0 ? n : close;
      tag.attrs.push({ name: attrName, lower: lowerAscii(attrName), value: decodeEntities(text.slice(j + 1, valueEnd)), offset: j + 1 });
      j = valueEnd + 1;
    }
    tags.push(tag);
    if (tags.length >= limits.maxTags) break;
    if (ended) {
      const next = text.indexOf('<', j);
      const textEnd = next < 0 ? n : next;
      if (!selfClosing) {
        tag.text = decodeEntities(text.slice(j, textEnd));
        tag.textOffset = j;
        if (stack.length < limits.maxDepth) stack.push(tag.lower);
      }
      i = next;
    } else i = text.indexOf('<', j);
  }
  return tags;
}

// The value of an attribute of a tag, by its name compared without regard to case, or undefined.
export function attrOf(tag, name) {
  const lower = lowerAscii(name);
  return tag.attrs.find((a) => a.lower === lower);
}
