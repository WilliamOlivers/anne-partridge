// GitHub OAuth callback for Decap CMS
// Deployed as a Vercel serverless function at /api/auth
// Requires env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    res.status(400).send('Missing OAuth code');
    return;
  }

  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).send('OAuth credentials not configured');
    return;
  }

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

    // Build the message Decap CMS expects
    const payload = JSON.stringify({ token: data.access_token, provider: 'github' });
    const message = JSON.stringify('authorization:github:success:' + payload);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
(function() {
  const msg = ${message};
  function receiveMessage(e) {
    window.opener.postMessage(msg, e.origin);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (err) {
    const errPayload = JSON.stringify({ error: String(err.message) });
    const errMsg     = JSON.stringify('authorization:github:error:' + errPayload);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
(function() {
  const msg = ${errMsg};
  function receiveMessage(e) {
    window.opener.postMessage(msg, e.origin);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(html);
  }
}
