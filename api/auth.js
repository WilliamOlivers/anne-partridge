// GitHub OAuth handler for Decap CMS
// Step 1 (no code): redirect to GitHub authorization page (with anti-CSRF state)
// Step 2 (with code): verify state, exchange code for token, post back to CMS window

import { randomBytes, timingSafeEqual } from 'node:crypto';

// Fixed scope: the repo is public, so write access to public repos is enough.
// Never taken from the query string.
const SCOPE = 'public_repo';
const STATE_COOKIE = 'oauth_state';

export default async function handler(req, res) {
  const { code, state } = req.query;

  const host        = req.headers.host;
  const isLocal     = host.startsWith('localhost');
  const protocol    = isLocal ? 'http' : 'https';
  const origin      = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/auth`;
  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  res.setHeader('Cache-Control', 'no-store');

  // ── Step 1: Initiate OAuth — redirect to GitHub ──────────────────────────
  if (!code) {
    const newState = randomBytes(24).toString('hex');
    res.setHeader('Set-Cookie', cookie(STATE_COOKIE, newState, 600, isLocal));

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('state', newState);
    res.redirect(302, url.toString());
    return;
  }

  // ── Step 2: Callback — verify state, exchange code for access token ──────
  // The state cookie is single-use: clear it whatever happens next.
  const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
  const clear    = cookie(STATE_COOKIE, '', 0, isLocal);

  try {
    if (!safeEqual(expected, state)) {
      throw new Error('Invalid OAuth state');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      throw new Error(data.error_description || 'Token exchange failed');
    }

    const payload = JSON.stringify({ token: data.access_token, provider: 'github' });
    const message = JSON.stringify('authorization:github:success:' + payload);

    res.setHeader('Set-Cookie', clear);
    res.setHeader('Content-Type', 'text/html');
    res.send(buildPopupHtml(message, origin));

  } catch (err) {
    const payload = JSON.stringify({ error: String(err.message) });
    const message = JSON.stringify('authorization:github:error:' + payload);

    res.setHeader('Set-Cookie', clear);
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(buildPopupHtml(message, origin));
  }
}

function cookie(name, value, maxAge, isLocal) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/api/auth; HttpOnly; SameSite=Lax${isLocal ? '' : '; Secure'}`;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Escape `<` so a message can never close the surrounding <script> tag.
function jsLiteral(s) {
  return s.replace(/</g, '\\u003c');
}

function buildPopupHtml(message, origin) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
(function () {
  const msg = ${jsLiteral(message)};
  const allowedOrigin = ${jsLiteral(JSON.stringify(origin))};
  function receiveMessage(e) {
    // Only hand the result to the CMS served from this same origin.
    if (e.origin !== allowedOrigin) return;
    window.opener.postMessage(msg, allowedOrigin);
    window.removeEventListener('message', receiveMessage, false);
  }
  window.addEventListener('message', receiveMessage, false);
  // Handshake carries no secret; target the CMS origin only.
  window.opener.postMessage('authorizing:github', allowedOrigin);
})();
</script>
</body></html>`;
}
