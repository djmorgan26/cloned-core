/**
 * Lightweight content guard for untrusted web content.
 *
 * Goals:
 *  - Flag likely prompt-injection phrases and dangerous patterns
 *  - Provide a sanitized version suitable for LLM context
 *  - Attach machine-readable signals for downstream policy
 */

export interface GuardResult {
  sanitized: string;
  flags: string[]; // e.g., ["injection.ignore-previous", "credentials.request", "exfil.command"]
}

const PATTERNS: Array<{ re: RegExp; flag: string }> = [
  { re: /ignore (?:all|any) (?:previous|above) instructions?/i, flag: 'injection.ignore-previous' },
  { re: /disregard (?:system|developer|safety) (?:instructions|message)/i, flag: 'injection.ignore-system' },
  { re: /you are now .*?assistant/i, flag: 'injection.role-change' },
  { re: /BEGIN\s+PROMPT\s+INJECTION/i, flag: 'injection.explicit' },
  { re: /print\s+environment\s+variables?|\$\{?\w+\}?/i, flag: 'exfil.env' },
  { re: /curl\s+http/i, flag: 'exfil.curl' },
  { re: /ssh\s+|rm\s+-rf\s+|powershell\s+-/i, flag: 'cmd.dangerous' },
  { re: /api[_-]?key|password|secret|token/i, flag: 'credentials.request' },
  { re: /data exfiltration|exfiltrate/i, flag: 'exfil.mention' },
];

/**
 * Remove HTML/script/style and collapse whitespace. This is minimal by design
 * and can be replaced by a proper sanitizer or readability pipeline later.
 */
function stripHtml(input: string): string {
  // Remove script/style blocks
  let out = input.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  // Drop tags
  out = out.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  out = out.replace(/[\t\n\r ]+/g, ' ').trim();
  return out;
}

export function guardUntrustedContent(raw: string): GuardResult {
  const sanitized = stripHtml(raw);
  const flags: string[] = [];
  for (const { re, flag } of PATTERNS) {
    if (re.test(sanitized)) flags.push(flag);
  }
  return { sanitized, flags };
}

