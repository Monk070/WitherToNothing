// Cloudflare Worker: relays contact form submissions to the band's private
// Discord channel. The webhook URL is stored as a Worker secret
// (DISCORD_WEBHOOK_URL) so it never appears in the public repo.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
    }

    const name = String(data.name || '').trim().slice(0, 100);
    const email = String(data.email || '').trim().slice(0, 200);
    const message = String(data.message || '').trim().slice(0, 1500);

    if (!name || !email || !message) {
      return new Response('Missing fields', { status: 400, headers: CORS_HEADERS });
    }

    const payload = {
      embeds: [
        {
          title: 'New message from withertonothing.com',
          color: 0xf2a71b,
          fields: [
            { name: 'Name', value: name },
            { name: 'Email', value: email },
            { name: 'Message', value: message },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
    }
    return new Response('OK', { headers: CORS_HEADERS });
  },
};
