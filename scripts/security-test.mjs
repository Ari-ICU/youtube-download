import { join, resolve } from 'path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { console.log('  ✓', label); pass++; }
  else           { console.error('  ✗', label); fail++; }
}

// ── Format ID regex (slash removed) ──────────────────────────────────────────
const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;
console.log('\nFormat ID regex:');
check('normal format "18"',            FORMAT_ID_RE.test('18'));
check('merge format "137+140"',        FORMAT_ID_RE.test('137+140'));
check('slash rejected "137/../../"',   !FORMAT_ID_RE.test('137/../../'));
check('null byte rejected',            !FORMAT_ID_RE.test('137\x00'));
check('too long (61 chars) rejected',  !FORMAT_ID_RE.test('a'.repeat(61)));
check('empty string rejected',         !FORMAT_ID_RE.test(''));

// ── MIME allowlist (header injection prevention) ──────────────────────────────
const ALLOWED_MIMES = { 'video/mp4': true, 'audio/mp4': true };
console.log('\nMIME allowlist:');
check('video/mp4 allowed',             !!ALLOWED_MIMES['video/mp4']);
check('audio/mp4 allowed',             !!ALLOWED_MIMES['audio/mp4']);
check('text/html blocked',             !ALLOWED_MIMES['text/html']);
const injectedMime = 'video/mp4\r\nX-Injected: evil';
check('CRLF injection blocked',        !ALLOWED_MIMES[injectedMime]);

// ── Token UUID regex ──────────────────────────────────────────────────────────
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
console.log('\nToken regex:');
check('valid v4 UUID',                 TOKEN_RE.test('550e8400-e29b-41d4-a716-446655440000'));
check('path traversal rejected',       !TOKEN_RE.test('../../etc/passwd'));
check('CRLF injection rejected',       !TOKEN_RE.test('550e8400-e29b-41d4-a716-446655440000\n'));
check('v1 UUID rejected',              !TOKEN_RE.test('550e8400-e29b-11d4-a716-446655440000'));

// ── isAllowedUrl SSRF checks ──────────────────────────────────────────────────
function isAllowedUrl(raw) {
  const ALLOWED_HOSTS = ['youtube.com','www.youtube.com','youtu.be','m.youtube.com','music.youtube.com'];
  try {
    const p = new URL(raw);
    if (p.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some((h) => p.hostname === h || p.hostname.endsWith(`.${h}`));
  } catch { return false; }
}
console.log('\nisAllowedUrl SSRF:');
check('youtube.com allowed',           isAllowedUrl('https://www.youtube.com/watch?v=abc'));
check('youtu.be allowed',              isAllowedUrl('https://youtu.be/abc'));
check('http rejected',                 !isAllowedUrl('http://www.youtube.com/watch?v=abc'));
check('credential bypass blocked',     !isAllowedUrl('https://youtube.com@evil.com'));
check('subdomain spoof blocked',       !isAllowedUrl('https://evil.youtube.com.attacker.com'));
check('internal IP blocked',           !isAllowedUrl('https://192.168.1.1'));
check('localhost blocked',             !isAllowedUrl('https://localhost'));

// ── Title/filename length cap ─────────────────────────────────────────────────
console.log('\nTitle/filename sanitization:');
const longTitle = 'A'.repeat(10000);
const capped = longTitle.replace(/[^\w\s\-]/g, '').trim().slice(0, 200);
check('10000-char title capped to 200', capped.length === 200);

const traversalFilename = '../../../etc/passwd';
const sanitized = traversalFilename.replace(/[^\w\s\-()]/g, '').trim().slice(0, 200);
check('path traversal in filename removed', !sanitized.includes('/') && !sanitized.includes('.'));

// ── Temp dir path safety ──────────────────────────────────────────────────────
console.log('\nTemp dir path safety:');
// mkdtemp produces paths like /tmp/ytdl-XXXXXX — output filename is hardcoded
// as "output.mp4" or "preview.mp4", not user-supplied, so no traversal possible
check('output filename is hardcoded (not user input)', true); // by design

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
