// GitHub OAuth handler for Decap CMS
// Step 1 (no code): redirect to GitHub authorization page
// Step 2 (with code): exchange code for token, post back to CMS window

export default async function handler(req, res) {
  const { code, scope } = req.query;

  const host        = req.headers.host;
  const protocol    = host.startsWith('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth`;
  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  // ── Step 1: Initiate OAuth — redirect to GitHub ──────────────────────────
  if (!code) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scope || 'repo');
    res.redirect(302, url.toString());
    return;
  }

  // ── Step 2: Callback — exchange code for access token ────────────────────
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      throw new Error(data.error_description || 'Token exchange failed');
    }

    const payload = JSON.stringify({ token: data.access_token, provider: 'github' });
    const message = JSON.stringify('authorization:github:success:' + payload);

    res.setHeader('Content-Type', 'text/html');
    res.send(buildPopupHtml(message));

  } catch (err) {
    const payload = JSON.stringify({ error: String(err.message) });
    const message = JSON.stringify('authorization:github:error:' + payload);

    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(buildPopupHtml(message));
  }
}

function buildPopupHtml(message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
(function () {
  const msg = ${message};
  function receiveMessage(e) {
    window.opener.postMessage(msg, e.origin);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body></html>`;
}
