// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { sanitizeMongoObjectId } from "../utils/sanitize.js";
import { formatInlineCode } from "../utils/prefix.js";

function getGuildFieldName(platform) {
	if (platform === "discord") {
		return "discordGuildId";
	}
	if (platform === "fluxer") {
		return "fluxerGuildId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function truncate(value, maxLength = 80) {
	const text = String(value ?? "");
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength - 3)}...`;
}
function parsePageNumber(value) {
	if (value === undefined) {
		return 1;
	}
	const parsed = Number.parseInt(String(value).trim(), 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}
function getDiscordMemberLabel(member, userId) {
	if (!member) {
		return `Unknown (${userId})`;
	}
	return (
		member.displayName ??
		member.user?.globalName ??
		member.user?.username ??
		`Unknown (${userId})`
	);
}
function getFluxerMemberLabel(member, userId) {
	if (!member) {
		return `Unknown (${userId})`;
	}
	return (
		member.nick ??
		member.user?.global_name ??
		member.user?.username ??
		`Unknown (${userId})`
	);
}
function buildEmbed({ title, description, fields = [], footerText }) {
	const embed = { title, description, fields };
	if (footerText) {
		embed.footer = { text: footerText };
	}
	return embed;
}
function getServerLinkIdQuery(serverLinkId) {
	const values = [];
	function addValue(value) {
		if (value === null || value === undefined) {
			return;
		}
		if (
			values.some(function valueMatches(existing) {
				return (
					typeof existing === typeof value &&
					String(existing) === String(value)
				);
			})
		) {
			return;
		}
		values.push(value);
	}

	addValue(sanitizeMongoObjectId(serverLinkId));

	if (serverLinkId !== null && serverLinkId !== undefined) {
		addValue(serverLinkId);
		addValue(String(serverLinkId));
	}

	if (values.length === 1) {
		return { $eq: values[0] };
	}

	return { $in: values };
}
export class InfoService {
	constructor({ mongo, platforms, botPrefix }) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.platforms = platforms;
		this.botPrefix = botPrefix;
		this.itemsPerPage = 10;
	}
	getBotPrefix(context) {
		return context.botPrefix ?? this.botPrefix;
	}
	async handleHelp(context) {
		const botPrefix = this.getBotPrefix(context);
		const embed = buildEmbed({
			title: "DisFlux Sync - Help",
			description: "Synchronizes linked Discord and Fluxer servers.",
			fields: [
				...(context.platform === "discord"
					? [
							{
								name: "Discord commands",
								value: [
									"Slash commands and prefix commands both work here.",
									"Examples: `/setup` and `/link-channel`.",
								].join("\n"),
							},
						]
					: []),
				{
					name: "Setup",
					value: [
						formatInlineCode(`${botPrefix}setup <target-guild-id>`),
						"Starts the setup flow from the current server.",
						"",
						formatInlineCode(`${botPrefix}finish-setup <code>`),
						"Completes the setup flow in the target linked server.",
					].join("\n"),
				},
				{
					name: "Create links",
					value: [
						formatInlineCode(
							`${botPrefix}link-channel <priority: discord|fluxer> <discord-channel-id|auto> <fluxer-channel-id|auto> <sync-bots: yes|no> <sync-webhooks: yes|no>`,
						),
						"`priority` is the server to trust. `sync-bots` mirrors other bots; `sync-webhooks` mirrors webhook messages.",
						"",
						formatInlineCode(
							`${botPrefix}link-role <priority: discord|fluxer> <discord-role-id|auto> <fluxer-role-id|auto>`,
						),
						"`priority` is the server to trust for role metadata. One side can be `auto`.",
						"",
						formatInlineCode(
							`${botPrefix}link-user <priority: discord|fluxer> <discord-user-id> <fluxer-user-id>`,
						),
						"`priority` is the server to trust for nickname and role membership sync.",
					].join("\n"),
				},
				{
					name: "Remove links",
					value: [
						formatInlineCode(
							`${botPrefix}unlink-channel <platform: discord|fluxer> <channel-id>`,
						),
						"`platform` is the side where the channel ID belongs. Cached message mappings are removed too.",
						"",
						formatInlineCode(
							`${botPrefix}unlink-role <platform: discord|fluxer> <role-id>`,
						),
						"`platform` is the side where the role ID belongs.",
						"",
						formatInlineCode(
							`${botPrefix}unlink-user <platform: discord|fluxer> <user-id>`,
						),
						"`platform` is the side where the user ID belongs.",
					].join("\n"),
				},
				{
					name: "Lists",
					value: [
						formatInlineCode(`${botPrefix}list-channels [page]`),
						formatInlineCode(`${botPrefix}list-roles [page]`),
						formatInlineCode(`${botPrefix}list-users [page]`),
					].join("\n"),
				},
				{
					name: "Manual sync",
					value: [
						formatInlineCode(
							`${botPrefix}sync-user <platform: discord|fluxer> <user-id>`,
						),
						"Resyncs one linked user. `platform` is the side where the user ID belongs.",
						"",
						formatInlineCode(`${botPrefix}resync-users`),
						"Resyncs all linked users in this server pair.",
						"",
						formatInlineCode(`${botPrefix}resync-roles`),
						"Resyncs all linked role metadata from each link's priority server.",
						"",
						formatInlineCode(`${botPrefix}resync-channels`),
						"Resyncs all linked channel data and role permission overwrites from each link's priority server.",
					].join("\n"),
				},
				{
					name: "Prefix",
					value: [
						formatInlineCode(`${botPrefix}set-prefix <prefix>`),
						"Changes the shared prefix for the linked Discord and Fluxer servers.",
						"The prefix must be exactly one visible character.",
					].join("\n"),
				},
				{
					name: "Yes/no values",
					value: [
						"`sync-bots` and `sync-webhooks` accept `yes`, `no`, `true`, `false`, `1`, or `0`.",
						"",
						"Messages from DisFlux Sync itself are never mirrored.",
					].join("\n"),
				},
				{
					name: "Project",
					value: [
						"GitHub: https://github.com/CaptainRatax/DisFlux-Sync",
						"Author: https://github.com/CaptainRatax",
					].join("\n"),
				},
			],
			footerText: "DisFlux Sync",
		});
		await context.reply({ embeds: [embed] });
	}
	async handleListChannels(context, pageRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const page = parsePageNumber(pageRaw);
		if (!page) {
			await context.reply("Invalid page number.");
			return;
		}
		const links = await this.channelLinks
			.find({ serverLinkId: getServerLinkIdQuery(base.serverLink._id) })
			.toArray();
		if (links.length === 0) {
			await context.reply({
				embeds: [
					buildEmbed({
						title: "Linked channels",
						description:
							"There are no linked channels for this server pair.",
						footerText: "Page 1/1",
					}),
				],
			});
			return;
		}
		const totalPages = Math.max(
			1,
			Math.ceil(links.length / this.itemsPerPage),
		);
		if (page > totalPages) {
			await context.reply(
				`Page out of range. Valid pages: 1-${totalPages}.`,
			);
			return;
		}
		const pageItems = links.slice(
			(page - 1) * this.itemsPerPage,
			page * this.itemsPerPage,
		);
		const fields = [];
		for (const [index, link] of pageItems.entries()) {
			const [discordChannel, fluxerChannel] = await Promise.all([
				this.platforms.discord.fetchGuildChannel(
					base.serverLink.discordGuildId,
					link.discordChannelId,
				),
				this.platforms.fluxer.fetchGuildChannel(
					base.serverLink.fluxerGuildId,
					link.fluxerChannelId,
				),
			]);
			fields.push({
				name: `${(page - 1) * this.itemsPerPage + index + 1}. ${truncate(discordChannel?.name ?? "Unknown")} <-> ${truncate(fluxerChannel?.name ?? "Unknown")}`,
				value: [
					`Priority: \`${link.priority}\``,
					`Sync bots: \`${link.syncBotMessages ?? false}\``,
					`Sync webhooks: \`${link.syncWebhookMessages ?? false}\``,
					`Discord: \`${link.discordChannelId}\``,
					`Fluxer: \`${link.fluxerChannelId}\``,
				].join("\n"),
			});
		}
		await context.reply({
			embeds: [
				buildEmbed({
					title: "Linked channels",
					description: `Total linked channels: ${links.length}`,
					fields,
					footerText: `Page ${page}/${totalPages}`,
				}),
			],
		});
	}
	async handleListRoles(context, pageRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const page = parsePageNumber(pageRaw);
		if (!page) {
			await context.reply("Invalid page number.");
			return;
		}
		const links = await this.roleLinks
			.find({ serverLinkId: getServerLinkIdQuery(base.serverLink._id) })
			.toArray();
		if (links.length === 0) {
			await context.reply({
				embeds: [
					buildEmbed({
						title: "Linked roles",
						description:
							"There are no linked roles for this server pair.",
						footerText: "Page 1/1",
					}),
				],
			});
			return;
		}
		const totalPages = Math.max(
			1,
			Math.ceil(links.length / this.itemsPerPage),
		);
		if (page > totalPages) {
			await context.reply(
				`Page out of range. Valid pages: 1-${totalPages}.`,
			);
			return;
		}
		const pageItems = links.slice(
			(page - 1) * this.itemsPerPage,
			page * this.itemsPerPage,
		);
		const fields = [];
		for (const [index, link] of pageItems.entries()) {
			const [discordRole, fluxerRole] = await Promise.all([
				this.platforms.discord.fetchGuildRole(
					base.serverLink.discordGuildId,
					link.discordRoleId,
				),
				this.platforms.fluxer.fetchGuildRole(
					base.serverLink.fluxerGuildId,
					link.fluxerRoleId,
				),
			]);
			fields.push({
				name: `${(page - 1) * this.itemsPerPage + index + 1}. ${truncate(discordRole?.name ?? "Unknown")} <-> ${truncate(fluxerRole?.name ?? "Unknown")}`,
				value: [
					`Priority: \`${link.priority}\``,
					`Discord: \`${link.discordRoleId}\``,
					`Fluxer: \`${link.fluxerRoleId}\``,
				].join("\n"),
			});
		}
		await context.reply({
			embeds: [
				buildEmbed({
					title: "Linked roles",
					description: `Total linked roles: ${links.length}`,
					fields,
					footerText: `Page ${page}/${totalPages}`,
				}),
			],
		});
	}
	async handleListUsers(context, pageRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const page = parsePageNumber(pageRaw);
		if (!page) {
			await context.reply("Invalid page number.");
			return;
		}
		const links = await this.userLinks
			.find({ serverLinkId: getServerLinkIdQuery(base.serverLink._id) })
			.toArray();
		if (links.length === 0) {
			await context.reply({
				embeds: [
					buildEmbed({
						title: "Linked users",
						description:
							"There are no linked users for this server pair.",
						footerText: "Page 1/1",
					}),
				],
			});
			return;
		}
		const totalPages = Math.max(
			1,
			Math.ceil(links.length / this.itemsPerPage),
		);
		if (page > totalPages) {
			await context.reply(
				`Page out of range. Valid pages: 1-${totalPages}.`,
			);
			return;
		}
		const pageItems = links.slice(
			(page - 1) * this.itemsPerPage,
			page * this.itemsPerPage,
		);
		const fields = [];
		for (const [index, link] of pageItems.entries()) {
			const [discordMember, fluxerMember, fluxerUserIsOwner] =
				await Promise.all([
					this.platforms.discord.fetchGuildMember(
						base.serverLink.discordGuildId,
						link.discordUserId,
					),
					this.platforms.fluxer.fetchGuildMember(
						base.serverLink.fluxerGuildId,
						link.fluxerUserId,
					),
					this.platforms.fluxer.isGuildOwner(
						base.serverLink.fluxerGuildId,
						link.fluxerUserId,
					),
				]);
			fields.push({
				name: `${(page - 1) * this.itemsPerPage + index + 1}. ${truncate(getDiscordMemberLabel(discordMember, link.discordUserId))} <-> ${truncate(getFluxerMemberLabel(fluxerMember, link.fluxerUserId))}`,
				value: [
					`Priority: \`${link.priority}\``,
					`Status: \`${fluxerUserIsOwner ? "sync disabled - Fluxer owner" : "active"}\``,
					`Discord: \`${link.discordUserId}\``,
					`Fluxer: \`${link.fluxerUserId}\``,
				].join("\n"),
			});
		}
		await context.reply({
			embeds: [
				buildEmbed({
					title: "Linked users",
					description: `Total linked users: ${links.length}`,
					fields,
					footerText: `Page ${page}/${totalPages}`,
				}),
			],
		});
	}
	async requireLinkedAdminContext(context) {
		if (!context.guildId) {
			await context.reply(
				"This command can only be used inside a server.",
			);
			return null;
		}
		const serverLink = await this.getServerLinkForContext(
			context.platform,
			context.guildId,
		);
		if (!serverLink) {
			await context.reply(
				"This server is not linked yet. Complete the setup first.",
			);
			return null;
		}
		const userIsAdmin = await this.platforms[
			context.platform
		].userHasAdministrator(context.guildId, context.userId);
		if (!userIsAdmin) {
			await context.reply(
				"Only server administrators can use this command.",
			);
			return null;
		}
		return { serverLink };
	}
	async getServerLinkForContext(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		return this.serverLinks.findOne({ [fieldName]: guildId });
	}
}
