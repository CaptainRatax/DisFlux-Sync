// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { createHash } from "node:crypto";

import { isLinkEnabled } from "./linkLifecycleService.js";
import {
	generateSetupCode,
	formatSetupCode,
} from "../utils/setupCode.js";
import {
	sanitizeMongoObjectId,
	sanitizePlatformId,
	sanitizeSetupCode,
} from "../utils/sanitize.js";
import { formatInlineCode } from "../utils/prefix.js";
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
function hashSetupCode(code) {
	return createHash("sha256").update(String(code), "utf8").digest("hex");
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
function getOtherPlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}
	if (platform === "fluxer") {
		return "discord";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}
function getGuildIdForPlatform(serverLink, platform) {
	if (platform === "discord") {
		return serverLink.discordGuildId;
	}
	if (platform === "fluxer") {
		return serverLink.fluxerGuildId;
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
function getAnnouncementChannelFieldName(platform) {
	if (platform === "discord") {
		return "discordAnnouncementChannelId";
	}
	if (platform === "fluxer") {
		return "fluxerAnnouncementChannelId";
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
		...(syncResult.skippedDisabledServer
			? ["Sync skipped: `server link is disabled`"]
			: []),
		...(syncResult.skippedDisabledUser
			? ["Sync skipped: `user link is disabled`"]
			: []),
		`Member snapshots fetched: \`${!syncResult.skipped}\``,
		`Linked roles checked: \`${syncResult.roleLinkCount}\``,
		`Role membership differences: \`${membershipSummary.differences ?? 0}\``,
		`Role membership changes applied: \`${membershipSummary.changed ?? 0}\``,
		`Role membership changes failed: \`${membershipSummary.failed ?? 0}\``,
		`Role permission skips: \`${membershipSummary.skippedUnmanageableRoles ?? 0}\``,
	];
}

function formatRoleMetadataSummaryLines(summary) {
	return [
		`Roles checked: \`${summary?.checked ?? 0}\``,
		`Role metadata differences: \`${summary?.differences ?? 0}\``,
		`Role metadata changes applied: \`${summary?.changed ?? 0}\``,
		`Role metadata changes failed: \`${summary?.failed ?? 0}\``,
		`Disabled server skips: \`${summary?.skippedDisabled ?? 0}\``,
		`Unsupported priorities skipped: \`${summary?.skippedUnsupported ?? 0}\``,
		`Missing source roles skipped: \`${summary?.skippedMissingSource ?? 0}\``,
		`Missing target roles skipped: \`${summary?.skippedMissingTarget ?? 0}\``,
		`Unmanageable target roles skipped: \`${summary?.skippedUnmanageable ?? 0}\``,
	];
}

function formatChannelMetadataSummaryLines(summary) {
	return [
		`Channels checked: \`${summary?.checked ?? 0}\``,
		`Linked roles used for permission mapping: \`${summary?.roleLinksUsed ?? 0}\``,
		`Channel data or permission differences: \`${summary?.differences ?? 0}\``,
		`Channel changes applied: \`${summary?.changed ?? 0}\``,
		`Channel changes failed: \`${summary?.failed ?? 0}\``,
		`Disabled server skips: \`${summary?.skippedDisabled ?? 0}\``,
		`Unsupported priorities skipped: \`${summary?.skippedUnsupported ?? 0}\``,
		`Missing channel IDs skipped: \`${summary?.skippedMissingIds ?? 0}\``,
		`Missing source channels skipped: \`${summary?.skippedMissingSource ?? 0}\``,
		`Missing target channels skipped: \`${summary?.skippedMissingTarget ?? 0}\``,
		`Type mismatches skipped: \`${summary?.skippedTypeMismatch ?? 0}\``,
		`Unmanageable target channels skipped: \`${summary?.skippedUnmanageable ?? 0}\``,
	];
}

export class LinkService {
	constructor({
		mongo,
		platforms,
		botPrefix,
		syncService = null,
		lifecycleService = null,
		userLinkCodeLength = 10,
		userLinkCodeTtlMinutes = 15,
		serverUnlinkCodeLength = 10,
		serverUnlinkCodeTtlMinutes = 15,
	}) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.messageLinks = mongo.collection("message_links");
		this.pendingUserLinks = mongo.collection("pending_user_links");
		this.pendingServerUnlinks = mongo.collection("pending_server_unlinks");
		this.platforms = platforms;
		this.botPrefix = botPrefix;
		this.syncService = syncService;
		this.lifecycleService = lifecycleService;
		this.userLinkCodeLength = Math.max(10, userLinkCodeLength);
		this.userLinkCodeTtlMinutes = userLinkCodeTtlMinutes;
		this.serverUnlinkCodeLength = Math.max(
			10,
			serverUnlinkCodeLength,
		);
		this.serverUnlinkCodeTtlMinutes = serverUnlinkCodeTtlMinutes;
	}
	getBotPrefix(context) {
		return context.botPrefix ?? this.botPrefix;
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
				`Usage: ${this.getBotPrefix(context)}link-channel <priority: discord|fluxer> <discord-channel-id|auto> <fluxer-channel-id|auto> <sync-bots: yes|no> <sync-webhooks: yes|no>`,
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
					{
						...template,
						parentId: mappedParentId,
						permissionOverwrites: undefined,
					},
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
					{
						...template,
						parentId: mappedParentId,
						permissionOverwrites: undefined,
					},
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
			if (this.syncService) {
				await this.syncService.syncLinkedChannel(base.serverLink, {
					...existing,
					priority,
					syncBotMessages,
					syncWebhookMessages,
				});
			}
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
		const channelLink = {
			serverLinkId: base.serverLinkId,
			discordChannelId,
			fluxerChannelId,
			priority,
			syncBotMessages,
			syncWebhookMessages,
			createdAt: new Date(),
		};
		const result = await this.channelLinks.insertOne(channelLink);
		channelLink._id = result.insertedId;

		if (this.syncService) {
			await this.syncService.syncLinkedChannel(
				base.serverLink,
				channelLink,
			);
		}

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
				`Usage: ${this.getBotPrefix(context)}link-role <priority: discord|fluxer> <discord-role-id|auto> <fluxer-role-id|auto>`,
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
				`Usage: ${this.getBotPrefix(context)}link-user <priority: discord|fluxer> <discord-user-id> <fluxer-user-id>`,
			);
			return;
		}
		const discordUserId = normalizeRequiredId(discordUserRaw);
		const fluxerUserId = normalizeRequiredId(fluxerUserRaw);
		if (!discordUserId || !fluxerUserId) {
			await context.reply(
				`Usage: ${this.getBotPrefix(context)}link-user <priority: discord|fluxer> <discord-user-id> <fluxer-user-id>`,
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
		const now = new Date();
		const userLink = {
			serverLinkId: base.serverLinkId,
			discordUserId,
			fluxerUserId,
			priority,
			enabled: true,
			enabledAt: now,
			enabledReason: "link_user_created",
			createdAt: now,
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
	async handleLinkMe(context, codeRaw) {
		const hasCode =
			codeRaw !== undefined &&
			codeRaw !== null &&
			String(codeRaw).trim() !== "";

		if (!hasCode) {
			await this.handleStartLinkMe(context);
			return;
		}

		const code = sanitizeSetupCode(codeRaw, this.userLinkCodeLength);
		if (!code) {
			await context.reply(
				`Usage: ${this.getBotPrefix(context)}link-me [code]`,
			);
			return;
		}

		await this.handleFinishLinkMe(context, code);
	}
	async handleStartLinkMe(context) {
		const base = await this.requireLinkedMemberContext(context);
		if (!base) {
			return;
		}

		const sourcePlatform = context.platform;
		const targetPlatform = getOtherPlatform(sourcePlatform);
		const sourceGuildId = getGuildIdForPlatform(
			base.serverLink,
			sourcePlatform,
		);
		const targetGuildId = getGuildIdForPlatform(
			base.serverLink,
			targetPlatform,
		);
		const sourceUserId = normalizeRequiredId(context.userId);

		if (!sourceGuildId || !targetGuildId || !sourceUserId) {
			await context.reply("This server link or user ID is invalid.");
			return;
		}

		if (
			sourcePlatform === "fluxer" &&
			(await this.platforms.fluxer.isGuildOwner(
				sourceGuildId,
				sourceUserId,
			))
		) {
			await context.reply(
				"Fluxer does not allow anyone to manage the server owner, so the Fluxer owner's data cannot be synchronized. No user link code was created.",
			);
			return;
		}

		const sourceUserField = getUserFieldName(sourcePlatform);
		const existingSourceSide = await this.userLinks.findOne({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			[sourceUserField]: { $eq: sourceUserId },
		});
		if (existingSourceSide) {
			await context.reply(
				`Your ${formatPlatformLabel(sourcePlatform)} account is already linked for this server pair.`,
			);
			return;
		}

		const sourceClient = this.platforms[sourcePlatform];
		if (typeof sourceClient.sendDirectMessage !== "function") {
			await context.reply(
				"I cannot send direct messages on this platform, so no link code was created.",
			);
			return;
		}

		await this.pendingUserLinks.deleteMany({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
			sourcePlatform: { $eq: sourcePlatform },
			sourceUserId: { $eq: sourceUserId },
		});

		const code = await this.createUniqueUserLinkCode();
		const formattedCode = formatSetupCode(code);
		const now = new Date();
		const expiresAt = new Date(
			now.getTime() + this.userLinkCodeTtlMinutes * 60 * 1000,
		);
		const pendingUserLink = {
			codeHash: hashSetupCode(code),
			serverLinkId: base.serverLinkId,
			discordGuildId: base.serverLink.discordGuildId,
			fluxerGuildId: base.serverLink.fluxerGuildId,
			sourcePlatform,
			sourceGuildId,
			sourceUserId,
			targetPlatform,
			targetGuildId,
			priority: "discord",
			createdAt: now,
			expiresAt,
		};

		let insertResult = null;
		try {
			insertResult =
				await this.pendingUserLinks.insertOne(pendingUserLink);
		} catch (error) {
			if (error?.code === 11000) {
				await context.reply(
					"A user link code is already pending for you. Try again in a moment.",
				);
				return;
			}
			throw error;
		}

		let dmSent = false;
		try {
			dmSent = await sourceClient.sendDirectMessage(
				sourceUserId,
				[
					`Your DisFlux Sync user link code is: \`${formattedCode}\``,
					`Run ${formatInlineCode(`${this.getBotPrefix(context)}link-me ${formattedCode}`)} inside the linked ${formatPlatformLabel(targetPlatform)} server.`,
					`This code expires in ${this.userLinkCodeTtlMinutes} minutes and can only be used once.`,
					"Do not share it with anyone.",
				].join("\n"),
			);
		} catch {
			dmSent = false;
		}

		if (!dmSent) {
			await this.pendingUserLinks.deleteOne({
				_id: insertResult.insertedId,
			});
			await context.reply(
				"I could not send you a DM, so no link code was kept. Enable DMs from this server and try again.",
			);
			return;
		}

		await context.reply(
			[
				"I sent you a DM with your user link code.",
				`Run ${formatInlineCode(`${this.getBotPrefix(context)}link-me <code>`)} inside the linked ${formatPlatformLabel(targetPlatform)} server to finish linking your user.`,
				`The code expires in ${this.userLinkCodeTtlMinutes} minutes and can only be used once.`,
			].join("\n"),
		);
	}
	async handleFinishLinkMe(context, code) {
		const pending = await this.consumePendingUserLinkCode(code);
		if (!pending) {
			await context.reply("That user link code is invalid or has expired.");
			return;
		}

		if (!context.guildId) {
			await context.reply(
				"This command can only be used inside a server. The user link code was discarded.",
			);
			return;
		}

		const currentGuildId = normalizeRequiredId(context.guildId);
		const currentUserId = normalizeRequiredId(context.userId);
		if (!currentGuildId || !currentUserId) {
			await context.reply(
				"This server or user ID is invalid. The user link code was discarded.",
			);
			return;
		}

		if (context.platform !== pending.targetPlatform) {
			await context.reply(
				`This user link code must be completed from ${formatPlatformLabel(pending.targetPlatform)}. The code was discarded.`,
			);
			return;
		}

		if (currentGuildId !== pending.targetGuildId) {
			await context.reply(
				"This user link code is not meant for this server. The code was discarded.",
			);
			return;
		}

		const serverLink = await this.getServerLinkForContext(
			context.platform,
			currentGuildId,
		);
		const serverLinkId = sanitizeMongoObjectId(serverLink?._id);
		if (
			!serverLink ||
			!serverLinkId ||
			String(serverLinkId) !== String(pending.serverLinkId)
		) {
			await context.reply(
				"The saved server link is no longer available. The user link code was discarded.",
			);
			return;
		}
		serverLink._id = serverLinkId;
		if (!isLinkEnabled(serverLink)) {
			await context.reply(
				"The saved server link is disabled because the bot is missing from one of the linked servers. The user link code was discarded.",
			);
			return;
		}

		const sourceMember = await this.platforms[
			pending.sourcePlatform
		].fetchGuildMember(pending.sourceGuildId, pending.sourceUserId);
		if (!sourceMember) {
			await context.reply(
				"The original account is no longer in the linked source server. The user link code was discarded.",
			);
			return;
		}

		const targetMember = await this.platforms[
			context.platform
		].fetchGuildMember(currentGuildId, currentUserId);
		if (!targetMember) {
			await context.reply(
				"I could not verify your account in this server. The user link code was discarded.",
			);
			return;
		}

		const discordUserId =
			pending.sourcePlatform === "discord"
				? pending.sourceUserId
				: currentUserId;
		const fluxerUserId =
			pending.sourcePlatform === "fluxer"
				? pending.sourceUserId
				: currentUserId;

		if (!discordUserId || !fluxerUserId) {
			await context.reply(
				"The user link code contains invalid user IDs and was discarded.",
			);
			return;
		}

		const fluxerUserIsOwner = await this.platforms.fluxer.isGuildOwner(
			serverLink.fluxerGuildId,
			fluxerUserId,
		);
		if (fluxerUserIsOwner) {
			await context.reply(
				"Fluxer does not allow anyone to manage the server owner, so that Fluxer owner's data cannot be synchronized. The user link code was discarded.",
			);
			return;
		}

		const serverLinkFilter = getServerLinkIdQuery(serverLinkId);
		const existingDiscordSide = await this.userLinks.findOne({
			serverLinkId: serverLinkFilter,
			discordUserId: { $eq: discordUserId },
		});
		const existingFluxerSide = await this.userLinks.findOne({
			serverLinkId: serverLinkFilter,
			fluxerUserId: { $eq: fluxerUserId },
		});
		if (existingDiscordSide || existingFluxerSide) {
			const sameLink =
				existingDiscordSide &&
				existingFluxerSide &&
				String(existingDiscordSide._id) ===
					String(existingFluxerSide._id) &&
				existingDiscordSide.discordUserId === discordUserId &&
				existingDiscordSide.fluxerUserId === fluxerUserId;
			await context.reply(
				sameLink
					? "Those accounts are already linked. The user link code was discarded."
					: "One of those accounts is already linked to a different account. The user link code was discarded.",
			);
			return;
		}

		const now = new Date();
		const userLink = {
			serverLinkId,
			discordUserId,
			fluxerUserId,
			priority: pending.priority,
			enabled: true,
			enabledAt: now,
			enabledReason: "link_me_completed",
			createdAt: now,
		};

		try {
			const result = await this.userLinks.insertOne(userLink);
			userLink._id = result.insertedId;
		} catch (error) {
			if (error?.code === 11000) {
				await context.reply(
					"One of those accounts was linked before I could save this link. The user link code was discarded.",
				);
				return;
			}
			throw error;
		}

		const syncResult = this.syncService
			? await this.syncService.syncLinkedUser(serverLink, userLink)
			: null;

		await context.reply(
			[
				"User link created successfully.",
				`Priority: \`${pending.priority}\``,
				`Discord user ID: \`${discordUserId}\``,
				`Fluxer user ID: \`${fluxerUserId}\``,
				...formatUserSyncResultLines(syncResult),
			].join("\n"),
		);
	}
	async handleSetAnnouncementChannel(context, platformRaw, channelRaw) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}

		const hasPlatformArg =
			platformRaw !== undefined &&
			platformRaw !== null &&
			String(platformRaw).trim() !== "";
		const hasChannelArg =
			channelRaw !== undefined &&
			channelRaw !== null &&
			String(channelRaw).trim() !== "";
		const usage = `Usage: ${this.getBotPrefix(context)}set-announcement-channel [channel-id] or ${this.getBotPrefix(context)}set-announcement-channel <platform: discord|fluxer> <channel-id>`;

		let platform = context.platform;
		let channelId = normalizeRequiredId(context.channelId);

		if (hasPlatformArg && hasChannelArg) {
			platform = normalizePlatform(platformRaw);
			channelId = normalizeRequiredId(channelRaw);
		} else if (hasPlatformArg) {
			const requestedPlatform = normalizePlatform(platformRaw);
			if (requestedPlatform) {
				platform = requestedPlatform;
				if (platform !== context.platform) {
					await context.reply(
						`Provide a channel ID when setting the ${formatPlatformLabel(platform)} announcement channel from ${formatPlatformLabel(context.platform)}.`,
					);
					return;
				}
			} else {
				channelId = normalizeRequiredId(platformRaw);
			}
		} else if (hasChannelArg) {
			channelId = normalizeRequiredId(channelRaw);
		}

		if (!platform || !channelId) {
			await context.reply(usage);
			return;
		}

		const guildId = getGuildIdForPlatform(base.serverLink, platform);
		if (!guildId) {
			await context.reply(
				`The linked ${formatPlatformLabel(platform)} server ID is invalid.`,
			);
			return;
		}

		const client = this.platforms[platform];
		const channel = await client.fetchGuildChannel(guildId, channelId);
		if (!channel) {
			await context.reply(
				`That ${formatPlatformLabel(platform)} channel does not exist in the linked ${formatPlatformLabel(platform)} server.`,
			);
			return;
		}

		const template = await client.getGuildChannelTemplate(
			guildId,
			channelId,
		);
		if (template?.kind !== "text") {
			await context.reply("The announcement channel must be a text channel.");
			return;
		}

		const fieldName = getAnnouncementChannelFieldName(platform);
		const now = new Date();
		await this.serverLinks.updateOne(
			{ _id: base.serverLinkId },
			{
				$set: {
					[fieldName]: channelId,
					announcementChannelsUpdatedAt: now,
					announcementChannelsUpdatedByPlatform: context.platform,
					announcementChannelsUpdatedByUserId:
						normalizeRequiredId(context.userId) ?? null,
					announcementChannelsUpdatedReason:
						"manual_set_announcement_channel",
				},
			},
		);

		await context.reply(
			[
				"Announcement channel updated successfully.",
				`Platform: \`${platform}\``,
				`Channel ID: \`${channelId}\``,
			].join("\n"),
		);
	}
	async handleUnlinkServer(context, codeRaw) {
		const hasCode =
			codeRaw !== undefined &&
			codeRaw !== null &&
			String(codeRaw).trim() !== "";

		if (!hasCode) {
			await this.handleStartUnlinkServer(context);
			return;
		}

		const code = sanitizeSetupCode(
			codeRaw,
			this.serverUnlinkCodeLength,
		);
		if (!code) {
			await context.reply(
				`Usage: ${this.getBotPrefix(context)}unlink-server [code]`,
			);
			return;
		}

		await this.handleFinishUnlinkServer(context, code);
	}
	async handleStartUnlinkServer(context) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		if (!this.lifecycleService) {
			await context.reply("Link lifecycle service is not available.");
			return;
		}

		const sourcePlatform = context.platform;
		const targetPlatform = getOtherPlatform(sourcePlatform);
		const sourceGuildId = getGuildIdForPlatform(
			base.serverLink,
			sourcePlatform,
		);
		const targetGuildId = getGuildIdForPlatform(
			base.serverLink,
			targetPlatform,
		);
		const sourceUserId = normalizeRequiredId(context.userId);

		if (!sourceGuildId || !targetGuildId || !sourceUserId) {
			await context.reply("This server link or user ID is invalid.");
			return;
		}

		const sourceClient = this.platforms[sourcePlatform];
		if (typeof sourceClient.sendDirectMessage !== "function") {
			await context.reply(
				"I cannot send direct messages on this platform, so no unlink confirmation code was created.",
			);
			return;
		}

		await this.pendingServerUnlinks.deleteMany({
			serverLinkId: getServerLinkIdQuery(base.serverLinkId),
		});

		const code = await this.createUniqueServerUnlinkCode();
		const formattedCode = formatSetupCode(code);
		const now = new Date();
		const expiresAt = new Date(
			now.getTime() + this.serverUnlinkCodeTtlMinutes * 60 * 1000,
		);
		const pendingServerUnlink = {
			codeHash: hashSetupCode(code),
			serverLinkId: base.serverLinkId,
			discordGuildId: base.serverLink.discordGuildId,
			fluxerGuildId: base.serverLink.fluxerGuildId,
			sourcePlatform,
			sourceGuildId,
			sourceUserId,
			targetPlatform,
			targetGuildId,
			createdAt: now,
			expiresAt,
		};

		let insertResult = null;
		try {
			insertResult =
				await this.pendingServerUnlinks.insertOne(
					pendingServerUnlink,
				);
		} catch (error) {
			if (error?.code === 11000) {
				await context.reply(
					"An unlink confirmation code is already pending for this server pair. Try again in a moment.",
				);
				return;
			}
			throw error;
		}

		let dmSent = false;
		try {
			dmSent = await sourceClient.sendDirectMessage(
				sourceUserId,
				[
					`Your DisFlux Sync server unlink confirmation code is: \`${formattedCode}\``,
					`Run ${formatInlineCode(`${this.getBotPrefix(context)}unlink-server ${formattedCode}`)} inside the linked ${formatPlatformLabel(targetPlatform)} server to permanently delete this server link.`,
					"Any administrator in that linked server can run the confirmation command.",
					`This code expires in ${this.serverUnlinkCodeTtlMinutes} minutes and can only be used once.`,
					"This action deletes the server link, channel links, role links, user links, cached message mappings, and pending link codes. It cannot be undone.",
				].join("\n"),
			);
		} catch {
			dmSent = false;
		}

		if (!dmSent) {
			await this.pendingServerUnlinks.deleteOne({
				_id: insertResult.insertedId,
			});
			await context.reply(
				"I could not send you a DM, so no unlink confirmation code was kept. Enable DMs from this server and try again.",
			);
			return;
		}

		await context.reply(
			[
				"I sent you a DM with a server unlink confirmation code.",
				"Warning: this action is irreversible. If confirmed from the linked server, all data for this server link will be deleted.",
				`Run ${formatInlineCode(`${this.getBotPrefix(context)}unlink-server <code>`)} inside the linked ${formatPlatformLabel(targetPlatform)} server to confirm.`,
				`The code expires in ${this.serverUnlinkCodeTtlMinutes} minutes and can only be used once.`,
			].join("\n"),
		);
	}
	async handleFinishUnlinkServer(context, code) {
		if (!this.lifecycleService) {
			await context.reply("Link lifecycle service is not available.");
			return;
		}

		const pending = await this.pendingServerUnlinks.findOne({
			codeHash: { $eq: hashSetupCode(code) },
			expiresAt: { $gt: new Date() },
		});
		if (!pending) {
			await context.reply(
				"That server unlink code is invalid or has expired.",
			);
			return;
		}

		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}

		const currentGuildId = normalizeRequiredId(context.guildId);
		if (!currentGuildId) {
			await context.reply("This server ID is invalid.");
			return;
		}

		if (
			context.platform !== pending.targetPlatform ||
			currentGuildId !== pending.targetGuildId ||
			String(base.serverLinkId) !== String(pending.serverLinkId)
		) {
			await context.reply(
				"This server unlink code must be confirmed by an administrator in the other linked server.",
			);
			return;
		}

		const claimed = await this.pendingServerUnlinks.deleteOne({
			_id: pending._id,
			codeHash: { $eq: pending.codeHash },
		});
		if ((claimed.deletedCount ?? 0) === 0) {
			await context.reply(
				"That server unlink code was already used or expired.",
			);
			return;
		}

		const result = await this.lifecycleService.deleteServerLinkData(
			base.serverLink,
			{ reason: "manual_unlink_server" },
		);

		await context.reply(
			[
				"Server link removed permanently.",
				`Server links removed: \`${result.deletedServerLinks ?? 0}\``,
				`Channel links removed: \`${result.deletedChannelLinks ?? 0}\``,
				`Role links removed: \`${result.deletedRoleLinks ?? 0}\``,
				`User links removed: \`${result.deletedUserLinks ?? 0}\``,
				`Cached message mappings removed: \`${result.deletedMessageLinks ?? 0}\``,
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
				`Usage: ${this.getBotPrefix(context)}sync-user <platform: discord|fluxer> <user-id>`,
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
	async handleResyncRoles(context) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		if (!this.syncService) {
			await context.reply("Sync service is not available.");
			return;
		}
		const summary = await this.syncService.resyncLinkedRoles(
			base.serverLink,
		);
		if (summary.skippedDisabled > 0) {
			await context.reply(
				"Role resync skipped because this server link is disabled.",
			);
			return;
		}
		if (summary.checked === 0) {
			await context.reply(
				"There are no linked roles for this server pair.",
			);
			return;
		}
		await context.reply(
			[
				"Role resync completed.",
				...formatRoleMetadataSummaryLines(summary),
			].join("\n"),
		);
	}
	async handleResyncChannels(context) {
		const base = await this.requireLinkedAdminContext(context);
		if (!base) {
			return;
		}
		if (!this.syncService) {
			await context.reply("Sync service is not available.");
			return;
		}
		const summary = await this.syncService.resyncLinkedChannels(
			base.serverLink,
		);
		if (summary.skippedDisabled > 0) {
			await context.reply(
				"Channel resync skipped because this server link is disabled.",
			);
			return;
		}
		if (summary.checked === 0) {
			await context.reply(
				"There are no linked channels for this server pair.",
			);
			return;
		}
		await context.reply(
			[
				"Channel resync completed.",
				...formatChannelMetadataSummaryLines(summary),
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
				`Usage: ${this.getBotPrefix(context)}unlink-channel <platform: discord|fluxer> <channel-id>`,
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
		const removed = this.lifecycleService
			? await this.lifecycleService.deleteChannelLinkData(
					base.serverLink,
					link,
					{ reason: "manual_unlink_channel" },
				)
			: await this.deleteChannelLinkDataFallback(base.serverLinkId, link);
		await context.reply(
			[
				"Channel link removed successfully.",
				`Discord channel ID: \`${link.discordChannelId}\``,
				`Fluxer channel ID: \`${link.fluxerChannelId}\``,
				`Cached message mappings removed: \`${removed.deletedMessageLinks ?? 0}\``,
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
				`Usage: ${this.getBotPrefix(context)}unlink-role <platform: discord|fluxer> <role-id>`,
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
		if (this.lifecycleService) {
			await this.lifecycleService.deleteRoleLinkData(
				base.serverLink,
				link,
				{ reason: "manual_unlink_role" },
			);
		} else {
			await this.roleLinks.deleteOne({ _id: link._id });
		}
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
				`Usage: ${this.getBotPrefix(context)}unlink-user <platform: discord|fluxer> <user-id>`,
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
		if (this.lifecycleService) {
			await this.lifecycleService.deleteUserLinkData(
				base.serverLink,
				link,
				{ reason: "manual_unlink_user" },
			);
		} else {
			await this.userLinks.deleteOne({ _id: link._id });
		}
		await context.reply(
			[
				"User link removed successfully.",
				`Discord user ID: \`${link.discordUserId}\``,
				`Fluxer user ID: \`${link.fluxerUserId}\``,
			].join("\n"),
		);
	}
	async deleteChannelLinkDataFallback(serverLinkId, link) {
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
						serverLinkId: getServerLinkIdQuery(serverLinkId),
						$or: messageLinkFilters,
					})
				: { deletedCount: 0 };

		return {
			deletedChannelLinks: 1,
			deletedMessageLinks: removedMessageLinks.deletedCount ?? 0,
		};
	}
	async requireLinkedMemberContext(context) {
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
		if (!isLinkEnabled(serverLink)) {
			await context.reply(
				"This server link is disabled because the bot is missing from one of the linked servers. Add the bot back to both servers before using link commands.",
			);
			return null;
		}

		const guildId = normalizeRequiredId(context.guildId);
		const userId = normalizeRequiredId(context.userId);
		if (!guildId || !userId) {
			await context.reply("This server or user ID is invalid.");
			return null;
		}

		const member = await this.platforms[
			context.platform
		].fetchGuildMember(guildId, userId);
		if (!member) {
			await context.reply(
				"I could not verify your account in this server.",
			);
			return null;
		}

		return { serverLink, serverLinkId };
	}
	async consumePendingUserLinkCode(code) {
		const result = await this.pendingUserLinks.findOneAndDelete({
			codeHash: { $eq: hashSetupCode(code) },
			expiresAt: { $gt: new Date() },
		});
		return result;
	}
	async createUniqueUserLinkCode() {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const code = sanitizeSetupCode(
				generateSetupCode(this.userLinkCodeLength),
				this.userLinkCodeLength,
			);
			if (!code) {
				continue;
			}
			const existing = await this.pendingUserLinks.findOne({
				codeHash: { $eq: hashSetupCode(code) },
			});

			if (!existing) {
				return code;
			}
		}

		throw new Error("Failed to generate a unique user link code.");
	}
	async createUniqueServerUnlinkCode() {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const code = sanitizeSetupCode(
				generateSetupCode(this.serverUnlinkCodeLength),
				this.serverUnlinkCodeLength,
			);
			if (!code) {
				continue;
			}
			const existing = await this.pendingServerUnlinks.findOne({
				codeHash: { $eq: hashSetupCode(code) },
			});

			if (!existing) {
				return code;
			}
		}

		throw new Error(
			"Failed to generate a unique server unlink confirmation code.",
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
		if (!isLinkEnabled(serverLink)) {
			await context.reply(
				"This server link is disabled because the bot is missing from one of the linked servers. Add the bot back to both servers before using link commands.",
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
