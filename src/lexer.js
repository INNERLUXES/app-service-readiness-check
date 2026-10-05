// Comments are blanked before a file is scanned, so a line that was commented out is not reported. The text keeps its
// length and its line ends: every character of a comment except CR and LF becomes a space, so the line and column of
// what is left do not move. The text is read once, left to right, with no regular expression and no recursion. Strings
// are kept, because the checks look into them (a path, a port, a connection string).
//
//   cs    // to the end of the line and /* to */, outside "...", @"...", $"...", """...""" and '...'
//   vb    ' to the end of the line, and REM at the start of a statement, outside "..."
//   json  // and /* */ as .NET reads appsettings.json, outside "..."
//   xml   <!-- to -->
//   asax  <%-- to --%> and <!-- to -->, then the comments of cs

// A copy of the part from a to b with every character but CR and LF made a space.
const blank = (text, a, b) => text.slice(a, b).replace(/[^\r\n]/g, ' ');

const isLineEnd = (c) => c === 10 || c === 13;
const isWordChar = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

// The end of a run that starts at i and ends after the first place where close starts, or at the end of the text.
function endOf(text, i, close) {
  const at = text.indexOf(close, i);
  return at < 0 ? text.length : at + close.length;
}

// The end of a string that starts with its quote at i: a backslash escapes the next character, and the string ends at
// its closing quote or at the end of the line when it is never closed.
function quotedEnd(text, i, quote, escapes) {
  let j = i + 1;
  while (j < text.length) {
    const c = text.charCodeAt(j);
    if (escapes && c === 92) {
      j += 2;
      continue;
    }
    if (c === quote) return j + 1;
    if (isLineEnd(c)) return j;
    j += 1;
  }
  return text.length;
}

// The end of a string in which the quote is written twice to stand for itself: a verbatim C# string (which may run
// over several lines) or a VB string (which may not).
function doubledEnd(text, i, overLines) {
  let j = i + 1;
  while (j < text.length) {
    const c = text.charCodeAt(j);
    if (c === 34) {
      if (text.charCodeAt(j + 1) === 34) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    if (!overLines && isLineEnd(c)) return j;
    j += 1;
  }
  return text.length;
}

function blankCs(text, json = false) {
  let out = '';
  let from = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    const next = text.charCodeAt(i + 1);
    if (c === 47 && next === 47) {
      let j = i;
      while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
      out += text.slice(from, i) + blank(text, i, j);
      from = j;
      i = j;
    } else if (c === 47 && next === 42) {
      const j = endOf(text, i + 2, '*/');
      out += text.slice(from, i) + blank(text, i, j);
      from = j;
      i = j;
    } else if (c === 34) {
      if (!json && text.startsWith('"""', i)) i = endOf(text, i + 3, '"""');
      else i = quotedEnd(text, i, 34, true);
    } else if (!json && (c === 64 || c === 36) && (next === 34 || ((next === 64 || next === 36) && text.charCodeAt(i + 2) === 34))) {
      // @"...", $@"..." and @$"..." are verbatim; $"..." is an ordinary string.
      const quote = next === 34 ? i + 1 : i + 2;
      const verbatim = c === 64 || next === 64;
      i = verbatim ? doubledEnd(text, quote, true) : quotedEnd(text, quote, 34, true);
    } else if (!json && c === 39) {
      i = quotedEnd(text, i, 39, true);
    } else i += 1;
  }
  return out + text.slice(from);
}

function blankVb(text) {
  let out = '';
  let from = 0;
  let i = 0;
  const n = text.length;
  // At the start of a statement: the start of a line or after a colon, with only white space since.
  let start = true;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      i = doubledEnd(text, i, false);
      start = false;
    } else if (c === 39 || c === 0x2018 || c === 0x2019) {
      let j = i;
      while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
      out += text.slice(from, i) + blank(text, i, j);
      from = j;
      i = j;
    } else if (start && (c === 82 || c === 114) && /^rem$/i.test(text.slice(i, i + 3)) && !isWordChar(text.charCodeAt(i + 3))) {
      let j = i;
      while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
      out += text.slice(from, i) + blank(text, i, j);
      from = j;
      i = j;
    } else {
      if (isLineEnd(c) || c === 58) start = true;
      else if (c !== 32 && c !== 9) start = false;
      i += 1;
    }
  }
  return out + text.slice(from);
}

// Blanks the runs from each open marker to its close marker.
function blankBetween(text, open, close) {
  let out = '';
  let from = 0;
  let i = text.indexOf(open);
  while (i >= 0) {
    const j = endOf(text, i + open.length, close);
    out += text.slice(from, i) + blank(text, i, j);
    from = j;
    i = text.indexOf(open, j);
  }
  return out + text.slice(from);
}

// The text with its comments blanked, for one of the languages above.
export function blankComments(text, language) {
  if (language === 'cs') return blankCs(text);
  if (language === 'json') return blankCs(text, true);
  if (language === 'vb') return blankVb(text);
  if (language === 'xml') return blankBetween(text, '<!--', '-->');
  if (language === 'asax') return blankCs(blankBetween(blankBetween(text, '<%--', '--%>'), '<!--', '-->'));
  throw new Error(`unknown language ${language}`);
}
