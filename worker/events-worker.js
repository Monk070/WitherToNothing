// Cloudflare Worker: Discord slash-command endpoint ("/event") that lets the
// band manage the Events page from the private server. Adding or removing a
// show commits events.json to the GitHub repo via the Contents API; GitHub
// Pages then redeploys the site automatically (~1 min).
//
// Secrets (set as Worker secrets in the Cloudflare dashboard):
//   DISCORD_PUBLIC_KEY — Discord application → General Information → Public Key
//   GITHUB_TOKEN       — fine-grained PAT, Contents read/write on the repo only
//   DISCORD_GUILD_ID   — optional; if set, interactions from any other server
//                        are rejected (defence in depth — the commands are
//                        guild-registered anyway)

const REPO = 'Monk070/WitherToNothing';
const FILE = 'events.json';
const BRANCH = 'main';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('wtn-events worker');
    }
    const body = await request.text();
    if (!(await verifySignature(request, body, env))) {
      return new Response('Bad signature', { status: 401 });
    }
    const interaction = JSON.parse(body);

    // Discord's endpoint-validation ping.
    if (interaction.type === 1) return json({ type: 1 });

    if (interaction.type !== 2 || interaction.data.name !== 'event') {
      return json(reply('Unsupported interaction.'));
    }
    if (env.DISCORD_GUILD_ID && interaction.guild_id !== env.DISCORD_GUILD_ID) {
      return json(reply('This command only works in the band server.'));
    }

    // Acknowledge within Discord's 3-second window, then do the GitHub work
    // and edit the "thinking…" message with the real result.
    ctx.waitUntil(handleCommand(interaction, env));
    return json({ type: 5 });
  },
};

/* ---------- command handling ---------- */

async function handleCommand(i, env) {
  let content;
  try {
    const sub = i.data.options[0];
    const opts = Object.fromEntries((sub.options || []).map((o) => [o.name, o.value]));
    if (sub.name === 'add') content = await addEvent(opts, i, env);
    else if (sub.name === 'remove') content = await removeEvent(opts, i, env);
    else if (sub.name === 'list') content = await listEvents(env);
    else content = 'Unknown subcommand.';
  } catch (err) {
    content = '⚠️ Something went wrong: ' + String(err.message || err).slice(0, 300);
  }
  await fetch(
    `https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );
}

async function addEvent(opts, i, env) {
  const iso = parseDate(opts.date);
  if (!iso) {
    return "⚠️ I couldn't read that date. Try `2026-11-14` or `14 Nov 2026`.";
  }
  const title = opts.title.trim();
  const location = opts.location.trim();
  const time = normTime(opts.time);
  if (opts.time && !time) {
    return "⚠️ I couldn't read that time. Try `19:30` or `7:30pm`.";
  }
  const tickets = (opts.tickets || '').trim();
  if (tickets && !/^https?:\/\//i.test(tickets)) {
    return '⚠️ The tickets link must start with http:// or https://.';
  }
  const { sha, data } = await getEvents(env);
  const id = crypto.randomUUID().slice(0, 8);
  data.events.push({ id, date: iso, title, location, ...(time && { time }), ...(tickets && { tickets }) });
  data.events.sort((a, b) => (a.date < b.date ? -1 : 1));
  await putEvents(env, sha, data, `Add event: ${title} ${iso} (${who(i)} via Discord)`);
  return (
    `✅ Added **${title}** — ${location} — ${fmt(iso)}${time ? ', ' + fmtTime(time) : ''}. ` +
    `Live on the site in a minute or two. (id: \`${id}\`)`
  );
}

async function removeEvent(opts, i, env) {
  const id = opts.id.trim().replace(/`/g, '');
  const { sha, data } = await getEvents(env);
  const ev = data.events.find((e) => e.id === id);
  if (!ev) {
    return `⚠️ No event with id \`${id}\`. Use \`/event list\` to see the ids.`;
  }
  data.events = data.events.filter((e) => e.id !== id);
  const label = ev.title || ev.venue || 'event';
  await putEvents(env, sha, data, `Remove event: ${label} ${ev.date} (${who(i)} via Discord)`);
  return `🗑️ Removed **${label}** — ${fmt(ev.date)}. The site updates in a minute or two.`;
}

async function listEvents(env) {
  const { data } = await getEvents(env);
  if (!data.events.length) {
    return 'No shows on the site right now — the Events page shows the "announcement coming soon" placeholder.';
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines = data.events.map((e) => {
    const past = e.date < today ? ' *(past — hidden on the site)*' : '';
    const tm = e.time ? `, ${fmtTime(e.time)}` : '';
    const tix = e.tickets ? ` — <${e.tickets}>` : '';
    return `\`${e.id}\` — ${fmt(e.date)}${tm} — **${e.title || e.venue}** — ${e.location || e.city || ''}${tix}${past}`;
  });
  return '📅 **Shows on the site:**\n' + lines.join('\n');
}

/* ---------- helpers ---------- */

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function reply(content) {
  return { type: 4, data: { content, flags: 64 } }; // 64 = only the sender sees it
}

function who(i) {
  const u = (i.member && i.member.user) || i.user || {};
  return u.global_name || u.username || 'band';
}

// "2026-11-14" stays as-is; anything else goes through Date.parse.
function parseDate(s) {
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isNaN(Date.parse(s + 'T00:00:00Z')) ? null : s;
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// "19:30", "7.30pm", "7pm" → "19:30" (24-hour storage); null if unreadable.
function normTime(s) {
  if (!s) return null;
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

// "19:30" → "7:30pm" for Discord replies.
function fmtTime(hm) {
  let [h, m] = hm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return h + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
}

function fmt(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/* ---------- Discord request signature (Ed25519) ---------- */

async function verifySignature(request, body, env) {
  const sig = request.headers.get('X-Signature-Ed25519');
  const ts = request.headers.get('X-Signature-Timestamp');
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(env.DISCORD_PUBLIC_KEY),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(sig),
      new TextEncoder().encode(ts + body)
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/* ---------- GitHub Contents API ---------- */

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'wtn-events-worker',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function getEvents(env) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return { sha: null, data: { events: [] } };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const file = await res.json();
  const bin = atob(file.content.replace(/\n/g, ''));
  const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  const data = JSON.parse(text);
  if (!Array.isArray(data.events)) data.events = [];
  return { sha: file.sha, data };
}

async function putEvents(env, sha, data, message) {
  const text = JSON.stringify(data, null, 2) + '\n';
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const body = { message, content: btoa(bin), branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: ghHeaders(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error('someone else updated the events at the same time — try again');
    }
    throw new Error(`GitHub write failed (${res.status})`);
  }
}
