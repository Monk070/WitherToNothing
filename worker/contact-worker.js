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
    const phone = String(data.phone || '').trim().slice(0, 50);
    const message = String(data.message || '').trim().slice(0, 1500);
    const honeypot = String(data.website || '').trim();

    // Bots fill the hidden "website" field; humans never see it. Pretend
    // success so the bot doesn't learn it was caught.
    if (honeypot) {
      return new Response('OK', { headers: CORS_HEADERS });
    }

    if (!name || !email || !message) {
      return new Response('Missing fields', { status: 400, headers: CORS_HEADERS });
    }

    // Verify the Turnstile token (skipped if the secret isn't configured,
    // so the form keeps working before/without Turnstile setup).
    if (env.TURNSTILE_SECRET) {
      const token = String(data.turnstileToken || '');
      if (!token) {
        return new Response('Verification required', { status: 403, headers: CORS_HEADERS });
      }
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: request.headers.get('CF-Connecting-IP') || undefined,
        }),
      });
      const outcome = await verify.json();
      if (!outcome.success) {
        return new Response('Verification failed', { status: 403, headers: CORS_HEADERS });
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response('Invalid email', { status: 400, headers: CORS_HEADERS });
    }

    // Check the email's domain actually accepts mail (has MX, or at least
    // an A record as fallback). Fail open on DNS lookup errors so a DNS
    // hiccup never blocks a legitimate message.
    try {
      const domain = email.split('@')[1];
      const lookup = async (type) => {
        const res = await fetch(
          `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
          { headers: { accept: 'application/dns-json' } }
        );
        const json = await res.json();
        return Array.isArray(json.Answer) && json.Answer.length > 0;
      };
      if (!(await lookup('MX')) && !(await lookup('A'))) {
        return new Response('Invalid email domain', { status: 400, headers: CORS_HEADERS });
      }
    } catch {
      // DNS check unavailable — allow the message through.
    }

    const fields = [
      { name: 'Name', value: name },
      { name: 'Email', value: email },
    ];
    if (phone) {
      fields.push({ name: 'Contact Number', value: phone });
    }
    fields.push({ name: 'Message', value: message });

    const payload = {
      embeds: [
        {
          title: 'New message from withertonothing.com',
          color: 0xf2a71b,
          fields,
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
