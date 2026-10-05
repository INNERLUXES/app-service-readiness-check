// Secrets written into web.config or appsettings.json. A secret is found in two forms: a part of a connection string
// such as "Password=..." whose key is one of SECRET_KEYS, and a setting or attribute whose own name is one of them
// (an appSettings key, a JSON name, a password attribute). A value that is empty, a Key Vault reference or a
// placeholder for a value set elsewhere is not a secret. The value of a secret never leaves this file: a finding names
// the key and says the value is masked, and every text the reports take from the input goes through maskSecrets.

// The keys whose value is a secret, compared lowered and without spaces, so "Shared Access Key" is "sharedaccesskey".
export const SECRET_KEYS = ['password', 'pwd', 'accountkey', 'sharedaccesskey'];

const squash = (text) => String(text).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)).replace(/[\s_-]+/g, '');

// True when a name, compared lowered and without spaces, underscores or hyphens, ends in one of SECRET_KEYS, after a
// dot or colon too: Password, SmtpPassword, Smtp.Password and Storage:AccountKey all do; PasswordLength does not.
export function isSecretName(name) {
  const last = squash(name).split(/[.:]/).at(-1);
  return SECRET_KEYS.some((k) => last.endsWith(k));
}

// True when a value is not a secret written in the file: empty, a Key Vault reference, or a placeholder for a value set
// elsewhere: $(Name), ${Name}, #{Name}#, %Name%, __Name__, {Name}, <Name>, or only asterisks.
export function isPlaceholder(value) {
  const v = String(value).trim();
  if (v === '') return true;
  if (/^@Microsoft\.KeyVault\(/i.test(v)) return true;
  return /^(?:\$\([^)]*\)|\$\{[^}]*\}|#\{[^}]*\}#?|%[^%\s]+%|__[A-Za-z0-9_.:-]+__|\{[^{}]*\}|<[^<>]*>|\*+)$/.test(v);
}

// The secrets of a connection string: [{ key, at }] for each part key=value whose key is one of SECRET_KEYS and whose
// value is not a placeholder; at is the offset of the key in the text.
export function connectionSecrets(text) {
  const out = [];
  let from = 0;
  const s = String(text);
  while (from <= s.length) {
    let end = s.indexOf(';', from);
    if (end < 0) end = s.length;
    const part = s.slice(from, end);
    const eq = part.indexOf('=');
    if (eq > 0) {
      const key = part.slice(0, eq);
      let value = part.slice(eq + 1).trim();
      if (value.length >= 2 && (value[0] === "'" || value[0] === '"') && value.at(-1) === value[0]) value = value.slice(1, -1);
      if (SECRET_KEYS.includes(squash(key)) && !isPlaceholder(value)) out.push({ key: key.trim(), at: from + (part.length - part.trimStart().length) });
    }
    from = end + 1;
  }
  return out;
}

// A text with the value after every secret key replaced by ***, for any text a report takes from the input.
export const maskSecrets = (text) => String(text).replace(/\b(password|pwd|account\s*key|shared\s*access\s*key)(\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^;"',\s]*)/gi, '$1$2***');
