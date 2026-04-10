// DisFLux Sync - DisFLux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { ChannelType, PermissionsBitField } from "discord.js";
function normalizeId(value) {
	const normalized = String(value ?? "").trim();
	if (!normalized) {
		return null;
	}
	if (["auto", "null", "none", "-"].includes(normalized.toLowerCase())) {
		return null;
	}
	return normalized;
}
function normalizeRequiredId(value) {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}
function normalizePriority(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "discord" || normalized === "fluxer") {
		return normalized;
	}
	return null;
}
function normalizeBooleanOption(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (["yes", "true", "1", "on"].includes(normalized)) {
		return true;
	}
	if (["no", "false", "0", "off"].includes(normalized)) {
		return false;
	}
	return null;
}
function getGuildFieldName(platform) {
	if (platform === "discord") {
		return "discordGuildId";
	}
	if (platform === "fluxer") {
		return "fluxerGuildId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function formatChannelTypeLabel(kind) {
	if (kind === "text") {
		return "text";
	}
	if (kind === "voice") {
		return "voice";
	}
	if (kind === "category") {
		return "category";
	}
	return "unknown";
}
export class LinkService {
	constructor({ mongo, platforms, botPrefix }) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.platforms = platforms;
		this.botPrefix = botPrefix;
	}
	async handleLinkChannel(
		context,
		priorityRaw,
		discordChannelRaw,
		fluxerChannelRaw,
		syncBotsRaw,
		syncWebhooksRaw,
	) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const priority = normalizePriority(priorityRaw);
		const syncBotMessages = normalizeBooleanOption(syncBotsRaw);
		const syncWebhookMessages = normalizeBooleanOption(syncWebhooksRaw);
		if (
			!priority ||
			syncBotMessages === null ||
			syncWebhookMessages === null
		) {
			await context.reply(
				`Usage: ${this.botPrefix}link-channel <discord|fluxer> <discord-channel-id|auto> <fluxer-channel-id|auto> <yes|no> <yes|no>`,
			);
			return;
		}
		let discordChannelId = normalizeId(discordChannelRaw);
		let fluxerChannelId = normalizeId(fluxerChannelRaw);
		if (!discordChannelId && !fluxerChannelId) {
			await context.reply(
				"You must provide at least one channel ID. The other side can be `auto`.",
			);
			return;
		}
		let discordChannel = null;
		let fluxerChannel = null;
		if (discordChannelId) {
			discordChannel = await this.platforms.discord.fetchGuildChannel(
				base.serverLink.discordGuildId,
				discordChannelId,
			);
			if (!discordChannel) {
				await context.reply(
					"That Discord channel does not exist in the linked Discord server.",
				);
				return;
			}
			if (
				!(await this.platforms.discord.isSupportedGuildChannelType(
					discordChannel,
				))
			) {
				await context.reply(
					"Only text, voice, and category channels are supported for automatic linking right now.",
				);
				return;
			}
		}
		if (fluxerChannelId) {
			fluxerChannel = await this.platforms.fluxer.fetchGuildChannel(
				base.serverLink.fluxerGuildId,
				fluxerChannelId,
			);
			if (!fluxerChannel) {
				await context.reply(
					"That Fluxer channel does not exist in the linked Fluxer server.",
				);
				return;
			}
			if (
				!(await this.platforms.fluxer.isSupportedGuildChannelType(
					fluxerChannel,
				))
			) {
				await context.reply(
					"Only text, voice, and category channels are supported for automatic linking right now.",
				);
				return;
			}
		}
		if (!fluxerChannelId) {
			const template =
				await this.platforms.discord.getGuildChannelTemplate(
					base.serverLink.discordGuildId,
					discordChannelId,
				);
			if (!template) {
				await context.reply(
					"I could not build a channel template from the Discord channel.",
				);
				return;
			}
			const mappedParentId = template.parentId
				? await this.findLinkedChannelId(
						base.serverLink._id,
						"discord",
						template.parentId,
						"fluxer",
					)
				: null;
			const created =
				await this.platforms.fluxer.createGuildChannelFromTemplate(
					base.serverLink.fluxerGuildId,
					{ ...template, parentId: mappedParentId },
				);
			if (!created) {
				await context.reply(
					"Failed to create the matching channel in Fluxer.",
				);
				return;
			}
			fluxerChannelId = created.id;
			fluxerChannel = created;
		}
		if (!discordChannelId) {
			const template =
				await this.platforms.fluxer.getGuildChannelTemplate(
					base.serverLink.fluxerGuildId,
					fluxerChannelId,
				);
			if (!template) {
				await context.reply(
					"I could not build a channel template from the Fluxer channel.",
				);
				return;
			}
			const mappedParentId = template.parentId
				? await this.findLinkedChannelId(
						base.serverLink._id,
						"fluxer",
						template.parentId,
						"discord",
					)
				: null;
			const created =
				await this.platforms.discord.createGuildChannelFromTemplate(
					base.serverLink.discordGuildId,
					{ ...template, parentId: mappedParentId },
				);
			if (!created) {
				await context.reply(
					"Failed to create the matching channel in Discord.",
				);
				return;
			}
			discordChannelId = created.id;
			discordChannel = created;
		}
		const existingDiscordSide = await this.channelLinks.findOne({
			serverLinkId: base.serverLink._id,
			discordChannelId,
		});
		const existingFluxerSide = await this.channelLinks.findOne({
			serverLinkId: base.serverLink._id,
			fluxerChannelId,
		});
		if (
			existingDiscordSide &&
			existingFluxerSide &&
			String(existingDiscordSide._id) !== String(existingFluxerSide._id)
		) {
			await context.reply(
				"Those channels are already linked to different channels.",
			);
			return;
		}
		const existing = existingDiscordSide ?? existingFluxerSide ?? null;
		if (existing) {
			if (
				existing.discordChannelId !== discordChannelId ||
				existing.fluxerChannelId !== fluxerChannelId
			) {
				await context.reply(
					"One of those channels is already linked to a different channel.",
				);
				return;
			}
			await this.channelLinks.updateOne(
				{ _id: existing._id },
				{ $set: { priority, syncBotMessages, syncWebhookMessages } },
			);
			await context.reply(
				[
					"Channel link updated successfully.",
					`Priority: \`${priority}\``,
					`Sync bots: \`${syncBotMessages}\``,
					`Sync webhooks: \`${syncWebhookMessages}\``,
					`Discord channel ID: \`${discordChannelId}\``,
					`Fluxer channel ID: \`${fluxerChannelId}\``,
				].join("\n"),
			);
			return;
		}
		await this.channelLinks.insertOne({
			serverLinkId: base.serverLink._id,
			discordChannelId,
			fluxerChannelId,
			priority,
			syncBotMessages,
			syncWebhookMessages,
			createdAt: new Date(),
		});
		const discordTemplate =
			await this.platforms.discord.getGuildChannelTemplate(
				base.serverLink.discordGuildId,
				discordChannelId,
			);
		const kind = discordTemplate?.kind ?? "unknown";
		await context.reply(
			[
				"Channel link created successfully.",
				`Type: \`${formatChannelTypeLabel(kind)}\``,
				`Priority: \`${priority}\``,
				`Sync bots: \`${syncBotMessages}\``,
				`Sync webhooks: \`${syncWebhookMessages}\``,
				`Discord channel ID: \`${discordChannelId}\``,
				`Fluxer channel ID: \`${fluxerChannelId}\``,
			].join("\n"),
		);
	}
	async handleLinkRole(context, priorityRaw, discordRoleRaw, fluxerRoleRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const priority = normalizePriority(priorityRaw);
		if (!priority) {
			await context.reply(
				`Usage: ${this.botPrefix}link-role <discord|fluxer> <discord-role-id|auto> <fluxer-role-id|auto>`,
			);
			return;
		}
		let discordRoleId = normalizeId(discordRoleRaw);
		let fluxerRoleId = normalizeId(fluxerRoleRaw);
		if (!discordRoleId && !fluxerRoleId) {
			await context.reply(
				"You must provide at least one role ID. The other side can be `auto`.",
			);
			return;
		}
		let discordRole = null;
		let fluxerRole = null;
		if (discordRoleId) {
			discordRole = await this.platforms.discord.fetchGuildRole(
				base.serverLink.discordGuildId,
				discordRoleId,
			);
			if (!discordRole) {
				await context.reply(
					"That Discord role does not exist in the linked Discord server.",
				);
				return;
			}
			const manageable = await this.platforms.discord.canManageRole(
				base.serverLink.discordGuildId,
				discordRoleId,
			);
			if (!manageable) {
				await context.reply(
					"I cannot safely manage that Discord role. Make sure it is not managed and is below the bot in the role hierarchy.",
				);
				return;
			}
			const existing = await this.roleLinks.findOne({
				serverLinkId: base.serverLink._id,
				discordRoleId,
			});
			if (existing) {
				await context.reply("That Discord role is already linked.");
				return;
			}
		}
		if (fluxerRoleId) {
			fluxerRole = await this.platforms.fluxer.fetchGuildRole(
				base.serverLink.fluxerGuildId,
				fluxerRoleId,
			);
			if (!fluxerRole) {
				await context.reply(
					"That Fluxer role does not exist in the linked Fluxer server.",
				);
				return;
			}
			const manageable = await this.platforms.fluxer.canManageRole(
				base.serverLink.fluxerGuildId,
				fluxerRoleId,
			);
			if (!manageable) {
				await context.reply(
					"I cannot safely manage that Fluxer role. Make sure it is below the bot in the role hierarchy.",
				);
				return;
			}
			const existing = await this.roleLinks.findOne({
				serverLinkId: base.serverLink._id,
				fluxerRoleId,
			});
			if (existing) {
				await context.reply("That Fluxer role is already linked.");
				return;
			}
		}
		if (!fluxerRoleId) {
			const template = await this.platforms.discord.getGuildRoleTemplate(
				base.serverLink.discordGuildId,
				discordRoleId,
			);
			if (!template) {
				await context.reply(
					"I could not build a role template from the Discord role.",
				);
				return;
			}
			const created =
				await this.platforms.fluxer.createGuildRoleFromTemplate(
					base.serverLink.fluxerGuildId,
					template,
				);
			if (!created) {
				await context.reply(
					"Failed to create the matching role in Fluxer.",
				);
				return;
			}
			fluxerRoleId = created.id;
		}
		if (!discordRoleId) {
			const template = await this.platforms.fluxer.getGuildRoleTemplate(
				base.serverLink.fluxerGuildId,
				fluxerRoleId,
			);
			if (!template) {
				await context.reply(
					"I could not build a role template from the Fluxer role.",
				);
				return;
			}
			const created =
				await this.platforms.discord.createGuildRoleFromTemplate(
					base.serverLink.discordGuildId,
					template,
				);
			if (!created) {
				await context.reply(
					"Failed to create the matching role in Discord.",
				);
				return;
			}
			discordRoleId = created.id;
		}
		await this.roleLinks.insertOne({
			serverLinkId: base.serverLink._id,
			discordRoleId,
			fluxerRoleId,
			priority,
			createdAt: new Date(),
		});
		await context.reply(
			[
				"Role link created successfully.",
				`Priority: \`${priority}\``,
				`Discord role ID: \`${discordRoleId}\``,
				`Fluxer role ID: \`${fluxerRoleId}\``,
			].join("\n"),
		);
	}
	async handleLinkUser(context, priorityRaw, discordUserRaw, fluxerUserRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const priority = normalizePriority(priorityRaw);
		if (!priority) {
			await context.reply(
				`Usage: ${this.botPrefix}link-user <discord|fluxer> <discord-user-id> <fluxer-user-id>`,
			);
			return;
		}
		const discordUserId = normalizeRequiredId(discordUserRaw);
		const fluxerUserId = normalizeRequiredId(fluxerUserRaw);
		if (!discordUserId || !fluxerUserId) {
			await context.reply(
				`Usage: ${this.botPrefix}link-user <discord|fluxer> <discord-user-id> <fluxer-user-id>`,
			);
			return;
		}
		const discordMember = await this.platforms.discord.fetchGuildMember(
			base.serverLink.discordGuildId,
			discordUserId,
		);
		if (!discordMember) {
			await context.reply(
				"That Discord user is not in the linked Discord server.",
			);
			return;
		}
		const fluxerMember = await this.platforms.fluxer.fetchGuildMember(
			base.serverLink.fluxerGuildId,
			fluxerUserId,
		);
		if (!fluxerMember) {
			await context.reply(
				"That Fluxer user is not in the linked Fluxer server.",
			);
			return;
		}
		const existingDiscordSide = await this.userLinks.findOne({
			serverLinkId: base.serverLink._id,
			discordUserId,
		});
		if (existingDiscordSide) {
			await context.reply("That Discord user is already linked.");
			return;
		}
		const existingFluxerSide = await this.userLinks.findOne({
			serverLinkId: base.serverLink._id,
			fluxerUserId,
		});
		if (existingFluxerSide) {
			await context.reply("That Fluxer user is already linked.");
			return;
		}
		await this.userLinks.insertOne({
			serverLinkId: base.serverLink._id,
			discordUserId,
			fluxerUserId,
			priority,
			createdAt: new Date(),
		});
		await context.reply(
			[
				"User link created successfully.",
				`Priority: \`${priority}\``,
				`Discord user ID: \`${discordUserId}\``,
				`Fluxer user ID: \`${fluxerUserId}\``,
			].join("\n"),
		);
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
		const botIsAdmin = await this.platforms[
			context.platform
		].botHasAdministrator(context.guildId);
		if (!botIsAdmin) {
			await context.reply(
				"I need administrator permissions in this server before this command can be used.",
			);
			return null;
		}
		return { serverLink };
	}
	async getServerLinkForContext(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		return this.serverLinks.findOne({ [fieldName]: guildId });
	}
	async findLinkedChannelId(
		serverLinkId,
		sourcePlatform,
		sourceChannelId,
		targetPlatform,
	) {
		if (!sourceChannelId) {
			return null;
		}
		const sourceField =
			sourcePlatform === "discord"
				? "discordChannelId"
				: "fluxerChannelId";
		const targetField =
			targetPlatform === "discord"
				? "discordChannelId"
				: "fluxerChannelId";
		const link = await this.channelLinks.findOne({
			serverLinkId,
			[sourceField]: sourceChannelId,
		});
		return link?.[targetField] ?? null;
	}
}
