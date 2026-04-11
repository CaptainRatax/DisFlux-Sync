// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import {
	sanitizeMongoObjectId,
	sanitizePlatformId,
} from "../utils/sanitize.js";
function normalizeId(value) {
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const normalized = String(value).trim();
	if (["auto", "null", "none", "-"].includes(normalized.toLowerCase())) {
		return null;
	}

	return sanitizePlatformId(normalized);
}
function normalizeRequiredId(value) {
	return sanitizePlatformId(value);
}
function normalizePriority(value) {
	return normalizePlatform(value);
}
function normalizePlatform(value) {
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
function getChannelFieldName(platform) {
	if (platform === "discord") {
		return "discordChannelId";
	}
	if (platform === "fluxer") {
		return "fluxerChannelId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function getRoleFieldName(platform) {
	if (platform === "discord") {
		return "discordRoleId";
	}
	if (platform === "fluxer") {
		return "fluxerRoleId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function getUserFieldName(platform) {
	if (platform === "discord") {
		return "discordUserId";
	}
	if (platform === "fluxer") {
		return "fluxerUserId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function formatPlatformLabel(platform) {
	if (platform === "discord") {
		return "Discord";
	}
	if (platform === "fluxer") {
		return "Fluxer";
	}
	return "Unknown";
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
function formatUserSyncResultLines(syncResult) {
	if (!syncResult) {
		return [];
	}

	const membershipSummary = syncResult.membershipSummary ?? {};

	return [
		...(syncResult.skippedFluxerOwner
			? ["Sync skipped: `Fluxer owner cannot be synchronized`"]
			: []),
		`Member snapshots fetched: \`${!syncResult.skipped}\``,
		`Linked roles checked: \`${syncResult.roleLinkCount}\``,
		`Role membership differences: \`${membershipSummary.differences ?? 0}\``,
		`Role membership changes applied: \`${membershipSummary.changed ?? 0}\``,
		`Role membership changes failed: \`${membershipSummary.failed ?? 0}\``,
		`Role permission skips: \`${membershipSummary.skippedUnmanageableRoles ?? 0}\``,
	];
}
export class LinkService {
	constructor({ mongo, platforms, botPrefix, syncService = null }) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.messageLinks = mongo.collection("message_links");
		this.platforms = platforms;
		this.botPrefix = botPrefix;
		this.syncService = syncService;
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
						base.serverLinkId,
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
			fluxerChannelId = normalizeRequiredId(created.id);
			if (!fluxerChannelId) {
				await context.reply(
					"Fluxer returned an invalid ID for the created channel.",
				);
				return;
			}
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
						base.serverLinkId,
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
			discordChannelId = normalizeRequiredId(created.id);
			if (!discordChannelId) {
				await context.reply(
					"Discord returned an invalid ID for the created channel.",
				);
				return;
			}
			discordChannel = created;
		}
		const existingDiscordSide = await this.channelLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			discordChannelId: { $eq: discordChannelId },
		});
		const existingFluxerSide = await this.channelLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			fluxerChannelId: { $eq: fluxerChannelId },
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
			serverLinkId: base.serverLinkId,
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
				serverLinkId: getServerLinkIdQuery(base.serverLinkId),
				discordRoleId: { $eq: discordRoleId },
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
				serverLinkId: getServerLinkIdQuery(base.serverLinkId),
				fluxerRoleId: { $eq: fluxerRoleId },
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
			fluxerRoleId = normalizeRequiredId(created.id);
			if (!fluxerRoleId) {
				await context.reply(
					"Fluxer returned an invalid ID for the created role.",
				);
				return;
			}
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
			discordRoleId = normalizeRequiredId(created.id);
			if (!discordRoleId) {
				await context.reply(
					"Discord returned an invalid ID for the created role.",
				);
				return;
			}
		}
		const roleLink = {
			serverLinkId: base.serverLinkId,
			discordRoleId,
			fluxerRoleId,
			priority,
			createdAt: new Date(),
		};
		const result = await this.roleLinks.insertOne(roleLink);
		roleLink._id = result.insertedId;

		if (this.syncService) {
			await this.syncService.syncLinkedRoleAcrossUsers(
				base.serverLink,
				roleLink,
			);
		}

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
		const fluxerUserIsOwner = await this.platforms.fluxer.isGuildOwner(
			base.serverLink.fluxerGuildId,
			fluxerUserId,
		);
		if (fluxerUserIsOwner) {
			await context.reply(
				"Fluxer does not allow anyone to manage the server owner, so that Fluxer owner's data cannot be synchronized. You can still sync a Discord owner if the linked Fluxer user is not the Fluxer owner.",
			);
			return;
		}
		const existingDiscordSide = await this.userLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			discordUserId: { $eq: discordUserId },
		});
		if (existingDiscordSide) {
			await context.reply("That Discord user is already linked.");
			return;
		}
		const existingFluxerSide = await this.userLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			fluxerUserId: { $eq: fluxerUserId },
		});
		if (existingFluxerSide) {
			await context.reply("That Fluxer user is already linked.");
			return;
		}
		const userLink = {
			serverLinkId: base.serverLinkId,
			discordUserId,
			fluxerUserId,
			priority,
			createdAt: new Date(),
		};
		const result = await this.userLinks.insertOne(userLink);
		userLink._id = result.insertedId;

		const syncResult = this.syncService
			? await this.syncService.syncLinkedUser(base.serverLink, userLink)
			: null;

		await context.reply(
			[
				"User link created successfully.",
				`Priority: \`${priority}\``,
				`Discord user ID: \`${discordUserId}\``,
				`Fluxer user ID: \`${fluxerUserId}\``,
				...formatUserSyncResultLines(syncResult),
			].join("\n"),
		);
	}
	async handleSyncUser(context, platformRaw, userRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const platform = normalizePlatform(platformRaw);
		const userId = normalizeId(userRaw);
		if (!platform || !userId) {
			await context.reply(
				`Usage: ${this.botPrefix}sync-user <discord|fluxer> <user-id>`,
			);
			return;
		}
		if (!this.syncService) {
			await context.reply("Sync service is not available.");
			return;
		}
		const fieldName = getUserFieldName(platform);
		const userLink = await this.userLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			[fieldName]: { $eq: userId },
		});
		if (!userLink) {
			await context.reply(
				`No user link found for that ${formatPlatformLabel(platform)} user.`,
			);
			return;
		}
		const syncResult = await this.syncService.syncLinkedUser(
			base.serverLink,
			userLink,
		);
		await context.reply(
			[
				"User sync completed.",
				`Discord user ID: \`${userLink.discordUserId}\``,
				`Fluxer user ID: \`${userLink.fluxerUserId}\``,
				...formatUserSyncResultLines(syncResult),
			].join("\n"),
		);
	}
	async handleResyncUsers(context) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		if (!this.syncService) {
			await context.reply("Sync service is not available.");
			return;
		}
		const userLinks = await this.userLinks
			.find({ serverLinkId: getServerLinkIdQuery(base.serverLinkId) })
			.toArray();
		if (userLinks.length === 0) {
			await context.reply(
				"There are no linked users for this server pair.",
			);
			return;
		}
		let skippedFluxerOwners = 0;
		const totals = {
			roleLinksChecked: 0,
			differences: 0,
			changed: 0,
			failed: 0,
			permissionSkips: 0,
		};
		for (const userLink of userLinks) {
			const syncResult = await this.syncService.syncLinkedUser(
				base.serverLink,
				userLink,
			);
			const summary = syncResult?.membershipSummary ?? {};
			if (syncResult?.skippedFluxerOwner) {
				skippedFluxerOwners += 1;
			}
			totals.roleLinksChecked += syncResult?.roleLinkCount ?? 0;
			totals.differences += summary.differences ?? 0;
			totals.changed += summary.changed ?? 0;
			totals.failed += summary.failed ?? 0;
			totals.permissionSkips += summary.skippedUnmanageableRoles ?? 0;
		}
		await context.reply(
			[
				"User resync completed.",
				`Users checked: \`${userLinks.length}\``,
				`Fluxer owners skipped: \`${skippedFluxerOwners}\``,
				`Linked roles checked: \`${totals.roleLinksChecked}\``,
				`Role membership differences: \`${totals.differences}\``,
				`Role membership changes applied: \`${totals.changed}\``,
				`Role membership changes failed: \`${totals.failed}\``,
				`Role permission skips: \`${totals.permissionSkips}\``,
			].join("\n"),
		);
	}
	async handleUnlinkChannel(context, platformRaw, channelRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const platform = normalizePlatform(platformRaw);
		const channelId = normalizeId(channelRaw);
		if (!platform || !channelId) {
			await context.reply(
				`Usage: ${this.botPrefix}unlink-channel <discord|fluxer> <channel-id>`,
			);
			return;
		}
		const fieldName = getChannelFieldName(platform);
		const link = await this.channelLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			[fieldName]: { $eq: channelId },
		});
		if (!link) {
			await context.reply(
				`No channel link found for that ${formatPlatformLabel(platform)} channel.`,
			);
			return;
		}
		await this.channelLinks.deleteOne({ _id: link._id });
		const linkedDiscordChannelId = normalizeRequiredId(
			link.discordChannelId,
		);
		const linkedFluxerChannelId = normalizeRequiredId(
			link.fluxerChannelId,
		);
		const messageLinkFilters = [
			linkedDiscordChannelId
				? { discordChannelId: { $eq: linkedDiscordChannelId } }
				: null,
			linkedFluxerChannelId
				? { fluxerChannelId: { $eq: linkedFluxerChannelId } }
				: null,
		].filter(Boolean);
		const removedMessageLinks =
			messageLinkFilters.length > 0
				? await this.messageLinks.deleteMany({
						serverLinkId: getServerLinkIdQuery(base.serverLinkId),
						$or: messageLinkFilters,
					})
				: { deletedCount: 0 };
		await context.reply(
			[
				"Channel link removed successfully.",
				`Discord channel ID: \`${link.discordChannelId}\``,
				`Fluxer channel ID: \`${link.fluxerChannelId}\``,
				`Cached message mappings removed: \`${removedMessageLinks.deletedCount ?? 0}\``,
			].join("\n"),
		);
	}
	async handleUnlinkRole(context, platformRaw, roleRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const platform = normalizePlatform(platformRaw);
		const roleId = normalizeId(roleRaw);
		if (!platform || !roleId) {
			await context.reply(
				`Usage: ${this.botPrefix}unlink-role <discord|fluxer> <role-id>`,
			);
			return;
		}
		const fieldName = getRoleFieldName(platform);
		const link = await this.roleLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			[fieldName]: { $eq: roleId },
		});
		if (!link) {
			await context.reply(
				`No role link found for that ${formatPlatformLabel(platform)} role.`,
			);
			return;
		}
		await this.roleLinks.deleteOne({ _id: link._id });
		await context.reply(
			[
				"Role link removed successfully.",
				`Discord role ID: \`${link.discordRoleId}\``,
				`Fluxer role ID: \`${link.fluxerRoleId}\``,
			].join("\n"),
		);
	}
	async handleUnlinkUser(context, platformRaw, userRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		const platform = normalizePlatform(platformRaw);
		const userId = normalizeId(userRaw);
		if (!platform || !userId) {
			await context.reply(
				`Usage: ${this.botPrefix}unlink-user <discord|fluxer> <user-id>`,
			);
			return;
		}
		const fieldName = getUserFieldName(platform);
		const link = await this.userLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			[fieldName]: { $eq: userId },
		});
		if (!link) {
			await context.reply(
				`No user link found for that ${formatPlatformLabel(platform)} user.`,
			);
			return;
		}
		await this.userLinks.deleteOne({ _id: link._id });
		await context.reply(
			[
				"User link removed successfully.",
				`Discord user ID: \`${link.discordUserId}\``,
				`Fluxer user ID: \`${link.fluxerUserId}\``,
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
		const serverLinkId = sanitizeMongoObjectId(serverLink._id);
		if (!serverLinkId) {
			await context.reply("The saved server link is invalid.");
			return null;
		}
		serverLink._id = serverLinkId;
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
		return { serverLink, serverLinkId };
	}
	async getServerLinkForContext(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		const sanitizedGuildId = normalizeRequiredId(guildId);
		if (!sanitizedGuildId) {
			return null;
		}
		return this.serverLinks.findOne({
			[fieldName]: { $eq: sanitizedGuildId },
		});
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
		const sanitizedServerLinkId = sanitizeMongoObjectId(serverLinkId);
		const sanitizedSourceChannelId = normalizeRequiredId(sourceChannelId);
		if (!sanitizedServerLinkId || !sanitizedSourceChannelId) {
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
			serverLinkId: getServerLinkIdQuery(sanitizedServerLinkId),
			[sourceField]: { $eq: sanitizedSourceChannelId },
		});
		return link?.[targetField] ?? null;
	}
}
