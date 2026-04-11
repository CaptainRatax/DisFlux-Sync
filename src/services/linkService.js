// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { createHash } from "node:crypto";

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

function formatRoleMetadataSummaryLines(summary) {
	return [
		`Roles checked: \`${summary?.checked ?? 0}\``,
		`Role metadata differences: \`${summary?.differences ?? 0}\``,
		`Role metadata changes applied: \`${summary?.changed ?? 0}\``,
		`Role metadata changes failed: \`${summary?.failed ?? 0}\``,
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
		userLinkCodeLength = 10,
		userLinkCodeTtlMinutes = 15,
	}) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.messageLinks = mongo.collection("message_links");
		this.pendingUserLinks = mongo.collection("pending_user_links");
		this.platforms = platforms;
		this.botPrefix = botPrefix;
		this.syncService = syncService;
		this.userLinkCodeLength = Math.max(10, userLinkCodeLength);
		this.userLinkCodeTtlMinutes = userLinkCodeTtlMinutes;
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

		const userLink = {
			serverLinkId,
			discordUserId,
			fluxerUserId,
			priority: pending.priority,
			createdAt: new Date(),
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
		await this.userLinks.deleteOne({ _id: link._id });
		await context.reply(
			[
				"User link removed successfully.",
				`Discord user ID: \`${link.discordUserId}\``,
				`Fluxer user ID: \`${link.fluxerUserId}\``,
			].join("\n"),
		);
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
