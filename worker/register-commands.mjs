// One-time registration of the /event slash commands with Discord.
// Guild-scoped so they appear instantly and only in the band server.
//
// Usage:  node worker/register-commands.mjs <APP_ID> <GUILD_ID> <BOT_TOKEN>
//
// APP_ID    — Discord application → General Information → Application ID
// GUILD_ID  — right-click the server icon → Copy Server ID (needs Developer
//             Mode: User Settings → Advanced → Developer Mode)
// BOT_TOKEN — Discord application → Bot → Reset Token (only needed here,
//             the worker never uses it)

const [appId, guildId, botToken] = process.argv.slice(2);
if (!appId || !guildId || !botToken) {
  console.error('Usage: node worker/register-commands.mjs <APP_ID> <GUILD_ID> <BOT_TOKEN>');
  process.exit(1);
}

const STRING = 3;
const SUB_COMMAND = 1;

const commands = [
  {
    name: 'event',
    description: 'Manage the events page on withertonothing.com',
    options: [
      {
        type: SUB_COMMAND,
        name: 'add',
        description: 'Add a show to the website',
        options: [
          { type: STRING, name: 'title', description: 'Event title, e.g. Blood Dealer + support', required: true },
          { type: STRING, name: 'date', description: 'e.g. 2026-11-14 or "14 Nov 2026"', required: true },
          { type: STRING, name: 'location', description: 'Full address, e.g. The Flapper, Kingston Row, Birmingham B1 2NU', required: true },
          { type: STRING, name: 'time', description: 'Start time, e.g. 19:30 or 7:30pm (optional)', required: false },
          { type: STRING, name: 'tickets', description: 'Ticket link (optional)', required: false },
        ],
      },
      {
        type: SUB_COMMAND,
        name: 'remove',
        description: 'Remove a show from the website',
        options: [
          { type: STRING, name: 'id', description: 'Event id shown by /event list', required: true },
        ],
      },
      {
        type: SUB_COMMAND,
        name: 'list',
        description: 'List the shows currently on the website',
      },
    ],
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  }
);

if (res.ok) {
  console.log('✅ /event commands registered. They should appear in the server immediately.');
} else {
  console.error(`❌ Registration failed (${res.status}):`);
  console.error(await res.text());
  process.exit(1);
}
