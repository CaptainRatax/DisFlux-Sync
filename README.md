# ![DisFlux Sync Status](https://status.ratot.eu/api/badge/31/status?style=for-the-badge&label=disflux+sync+status) ![DisFlux Sync DB Status](https://status.ratot.eu/api/badge/30/status?style=for-the-badge&label=disflux+sync+db+status) ![DisFlux Sync Uptime](https://status.ratot.eu/api/badge/31/uptime/72?style=for-the-badge&label=disflux+sync+uptime+%2872h%29) ![DisFlux Sync DB Uptime](https://status.ratot.eu/api/badge/30/uptime/72?style=for-the-badge&label=disflux+sync+db+uptime+%2872h%29) ![GitHub release (latest by date)](https://img.shields.io/github/v/release/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![AGPL-3.0 Licensed](https://img.shields.io/github/license/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![Code quality grade on Codacy](https://img.shields.io/codacy/grade/86a07104eb704eb0b8835a1402bc4f24?style=for-the-badge) ![GitHub repository size](https://img.shields.io/github/repo-size/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub last commit](https://img.shields.io/github/last-commit/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub issues](https://img.shields.io/github/issues/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub pull requests](https://img.shields.io/github/issues-pr/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub language count](https://img.shields.io/github/languages/count/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub top language](https://img.shields.io/github/languages/top/CaptainRatax/DisFlux-Sync?style=for-the-badge) ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/CaptainRatax/DisFlux-Sync?style=for-the-badge)

# DisFlux Sync

DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.

It is designed for communities that want to keep both platforms aligned without storing private server content. DisFlux Sync links servers, channels, roles, and users, then mirrors supported changes and messages across both platforms according to the configured synchronization rules.

> **You do not need to self-host DisFlux Sync or create your own bot to use it.**
>
> Most communities can simply invite the **official DisFlux Sync bots** below and start setting up synchronization immediately.

## Invite the Official Bots

Use the official hosted bots if you just want to set up synchronization for your servers.

### Discord Bot Invite

[Invite DisFlux Sync to Discord](https://discord.com/oauth2/authorize?client_id=1491578639018496030&permissions=8&integration_type=0&scope=bot)

### Fluxer Bot Invite

[Invite DisFlux Sync to Fluxer](https://web.fluxer.app/oauth2/authorize?client_id=1491587030201300830&scope=bot&permissions=8)

## Quick Start

1. Invite the official bots to your Discord server and Fluxer server using the links above
2. Run the setup command in one platform
3. Finish the setup in the other platform
4. Link the channels, roles, and users you want to synchronize

## Main Features

- Server linking between Discord and Fluxer using a secure setup flow
- Channel linking with per-channel priority selection
- Role linking with per-link priority selection
- User linking with per-link priority selection
- Real-time message synchronization between linked channels
- Reply synchronization across both platforms
- Role synchronization and nickname synchronization for linked users
- Optional synchronization of other bot messages per linked channel
- Optional synchronization of webhook messages per linked channel
- Paginated list commands for linked channels, roles, and users
- Minimal data retention by design

## Status Page

You can check the current status of DisFlux Sync, its database, and view incident history on the official status page:

🔗 [status.ratot.eu/disflux-sync](https://status.ratot.eu/status/disflux-sync)

The status page provides:

- Real-time uptime information
- Database status
- Historical incidents and outages

## How It Works

DisFlux Sync does not copy an entire server into a database.

The bot works by:

1. Linking one Discord server to one Fluxer server
2. Linking the channels, roles, and users that should be synchronized
3. Mirroring supported events in real time between both platforms
4. Using the selected priority value when reconciling differences after downtime

Each sync link can define its own priority:

- `discord` means Discord is treated as the source of truth for that link when reconciliation is needed
- `fluxer` means Fluxer is treated as the source of truth for that link when reconciliation is needed

## Data Handling Summary

DisFlux Sync is intentionally designed to retain as little information as possible.

The bot does **not** permanently store:

- Message content
- Channel names
- Channel descriptions or topics
- Usernames, display names, or nicknames
- Role names
- Attachments or shared files
- Full server content

The bot only stores the minimum identifiers and configuration needed to operate, such as:

- Server IDs
- Channel IDs
- Role IDs
- User IDs
- Configuration flags and sync priority settings
- Temporary message ID mappings when technically required for features such as replies, edits, deletes, and reaction synchronization

For more details, see [PRIVACY POLICY.txt](./PRIVACY%20POLICY.txt).

## Requirements

Before running DisFlux Sync, make sure you have:

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- A running MongoDB instance
- A Discord application and bot token
- A Fluxer bot token
- The bot added to the target Discord and Fluxer servers with the permissions required for the features you want to use

## Installation

Clone the repository:

```bash
git clone https://github.com/CaptainRatax/DisFlux-Sync.git
cd DisFlux-Sync
```

Install dependencies:

```bash
npm install
```

## Environment Configuration

Create a `.env` file in the project root and configure the required values.

Example:

```env
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=disflux_sync_db

DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id

FLUXER_TOKEN=your_fluxer_bot_token
FLUXER_API_BASE=https://api.fluxer.app/v1

BOT_PREFIX=!
SETUP_CODE_LENGTH=10
SETUP_CODE_TTL_MINUTES=15
MESSAGE_LINK_TTL_DAYS=30
```

## Running the Bot

For development:

```bash
npm run dev
```

For normal execution:

```bash
npm start
```

To stop the bot, press `Ctrl+C`.

## Basic Setup Flow

### 1. Link the servers

From Discord:

```text
!setup <fluxer-server-id>
```

Then, in the linked Fluxer server:

```text
!finish-setup <code>
```

You can also start the flow from Fluxer and finish it in Discord.

### 2. Link channels

```text
!link-channel <discord|fluxer> <discord-channel-id|auto> <fluxer-channel-id|auto> <yes|no> <yes|no>
```

Arguments:

- 1st argument: priority, either `discord` or `fluxer`
- 2nd argument: Discord channel ID or `auto`
- 3rd argument: Fluxer channel ID or `auto`
- 4th argument: whether to sync messages from other bots in that linked channel
- 5th argument: whether to sync webhook messages in that linked channel

Examples:

```text
!link-channel discord 123456789012345678 auto yes no
!link-channel fluxer auto 987654321098765432 yes yes
!link-channel discord 123456789012345678 987654321098765432 no no
```

Important:

- Messages from **DisFlux Sync itself** are never synchronized
- Messages from **other bots** are only synchronized when the linked channel allows it
- Messages from **webhooks** are only synchronized when the linked channel allows it

### 3. Link roles

```text
!link-role <discord|fluxer> <discord-role-id|auto> <fluxer-role-id|auto>
```

Examples:

```text
!link-role discord 123456789012345678 auto
!link-role fluxer auto 987654321098765432
```

### 4. Link users

```text
!link-user <discord|fluxer> <discord-user-id> <fluxer-user-id>
```

Example:

```text
!link-user discord 123456789012345678 987654321098765432
```

### 5. Unlink channels, roles, or users

```text
!unlink-channel <discord|fluxer> <channel-id>
!unlink-role <discord|fluxer> <role-id>
!unlink-user <discord|fluxer> <user-id>
```

Examples:

```text
!unlink-channel discord 123456789012345678
!unlink-role fluxer 987654321098765432
!unlink-user discord 123456789012345678
```

## Available Commands

### `!help`

Shows the help menu in an embed.

### `!setup <target-guild-id>`

Starts the server linking process from the current server.

### `!finish-setup <code>`

Completes the server linking process in the target server.

### `!link-channel <discord|fluxer> <discord-channel-id|auto> <fluxer-channel-id|auto> <yes|no> <yes|no>`

Creates or updates a linked channel pair and defines whether to sync other bot messages and webhook messages.

### `!link-role <discord|fluxer> <discord-role-id|auto> <fluxer-role-id|auto>`

Creates a role link. One side can be created automatically.

### `!link-user <discord|fluxer> <discord-user-id> <fluxer-user-id>`

Creates a user link.

### `!unlink-channel <discord|fluxer> <channel-id>`

Removes a channel link and clears cached message mappings for that channel pair.

### `!unlink-role <discord|fluxer> <role-id>`

Removes a role link.

### `!unlink-user <discord|fluxer> <user-id>`

Removes a user link.

### `!list-channels [page]`

Lists linked channels in embeds with pagination.

### `!list-roles [page]`

Lists linked roles in embeds with pagination.

### `!list-users [page]`

Lists linked users in embeds with pagination.

## Supported Synchronization

DisFlux Sync currently supports real-time synchronization for supported linked entities, including:

- Messages in linked channels
- Replies
- Reactions
- Edits and deletes
- Embeds
- Attachments
- Role metadata for linked roles
- Role membership for linked users and linked roles
- Nicknames for linked users
- Mention translation for linked users, roles, and channels

## Important Notes

- Only server administrators can use setup and link commands
- The bot must have the permissions required to manage the linked resources
- Some actions can fail safely if the target role or member is above the bot in the hierarchy
- Unsupported content may be skipped or mirrored in a simplified form
- Message synchronization is real time. If the bot is offline, live message events that happen during downtime are not replayed later

## Troubleshooting

### The bot says a server is already linked

That server already has a saved server link. Complete the setup on the correct target server or remove the existing link first.

### A role or user does not update

Make sure the bot has the required permissions and that the target role or member is below the bot in the hierarchy.

### Messages from other bots are not syncing

Check the linked channel configuration. Other bot messages are only mirrored if the linked channel was configured with bot sync enabled.

### Webhook messages are not syncing

Check the linked channel configuration. Webhook messages are only mirrored if the linked channel was configured with webhook sync enabled.

## Project Links

- Repository: [CaptainRatax/DisFlux-Sync](https://github.com/CaptainRatax/DisFlux-Sync)
- Author: [CaptainRatax](https://github.com/CaptainRatax)

## License

Copyright (C) 2026 Captain Ratax

This project is licensed under the GNU Affero General Public License v3.0 or, at your option, any later version.

See the [LICENSE](./LICENSE) file for the full license text.
