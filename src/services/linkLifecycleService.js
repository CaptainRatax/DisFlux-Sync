// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
import {
	sanitizeMongoObjectId,
	sanitizePlatformId,
} from "../utils/sanitize.js";

const DEFAULT_DISPOSE_AFTER_DAYS = 30;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_DISABLE_GRACE_MS = 10 * 60 * 1000;

function getOtherPlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}
	if (platform === "fluxer") {
		return "discord";
	}
	throw new Error(`Unsupported platform: ${platform}`);
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

function getGuildIdForPlatform(serverLink, platform) {
	return serverLink?.[getGuildFieldName(platform)] ?? null;
}

function getChannelIdForPlatform(channelLink, platform) {
	return channelLink?.[getChannelFieldName(platform)] ?? null;
}

function getWebhookIdFieldName(platform) {
	return platform === "discord" ? "discordWebhookId" : "fluxerWebhookId";
}

function getWebhookTokenFieldName(platform) {
	return platform === "discord"
		? "discordWebhookToken"
		: "fluxerWebhookToken";
}

function getWebhookCredentials(channelLink, platform) {
	const webhookId = channelLink?.[getWebhookIdFieldName(platform)];
	const webhookToken = channelLink?.[getWebhookTokenFieldName(platform)];
	if (!webhookId || !webhookToken) {
		return null;
	}
	return { id: String(webhookId), token: String(webhookToken) };
}

function getAnnouncementChannelIdForPlatform(serverLink, platform) {
	return serverLink?.[getAnnouncementChannelFieldName(platform)] ?? null;
}

function getRoleIdForPlatform(roleLink, platform) {
	return roleLink?.[getRoleFieldName(platform)] ?? null;
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

function toValidDate(value) {
	if (!value) {
		return null;
	}

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return date;
}

function addDays(date, days) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isExpired(date, now, days) {
	const parsed = toValidDate(date);
	return Boolean(parsed && parsed.getTime() <= now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isPastDate(date, now) {
	const parsed = toValidDate(date);
	return Boolean(parsed && parsed.getTime() <= now.getTime());
}

function formatMarkdownTimestamp(value, style) {
	const date = toValidDate(value);
	if (!date) {
		return null;
	}
	return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function getMongoObjectId(value) {
	if (value && typeof value === "object" && "_id" in value) {
		return sanitizeMongoObjectId(value._id);
	}
	return sanitizeMongoObjectId(value);
}

function getServerLinkIdValues(serverLinkId) {
	const values = [];
	const objectId = sanitizeMongoObjectId(serverLinkId);

	function addValue(value) {
		if (value === null || value === undefined) {
			return;
		}
		if (
			values.some(
				(existing) =>
					typeof existing === typeof value &&
					String(existing) === String(value),
			)
		) {
			return;
		}
		values.push(value);
	}

	addValue(objectId);

	if (serverLinkId !== null && serverLinkId !== undefined) {
		addValue(serverLinkId);
		addValue(String(serverLinkId));
	}

	return values;
}

export function getServerLinkIdFilter(serverLinkId) {
	const values = getServerLinkIdValues(serverLinkId);
	if (values.length === 0) {
		return null;
	}
	if (values.length === 1) {
		return values[0];
	}
	return { $in: values };
}

export function isLinkEnabled(link) {
	return Boolean(link && !link.disabledAt && link.enabled !== false);
}

function buildAllowedMentions(platform) {
	if (platform === "discord") {
		return {
			parse: [],
			users: [],
			roles: [],
			repliedUser: false,
		};
	}

	return {
		parse: [],
		users: [],
		roles: [],
		replied_user: false,
	};
}

function buildChannelLinkRemovedNotice({
	deletedPlatform,
	deletedChannelId,
	removedMessageLinks,
}) {
	return [
		"Channel link removed.",
		`Reason: the linked ${formatPlatformLabel(deletedPlatform)} channel \`${deletedChannelId}\` was deleted.`,
		`Cached message mappings removed: \`${removedMessageLinks ?? 0}\``,
	].join("\n");
}

function buildRoleLinkRemovedNotice({ deletedPlatform, deletedRoleId }) {
	return [
		"Role link removed.",
		`Reason: the linked ${formatPlatformLabel(deletedPlatform)} role \`${deletedRoleId}\` was deleted.`,
	].join("\n");
}

function buildServerLinkDisabledNotice({
	missingPlatform,
	disposeAfter,
	disposeAfterDays,
	reason = "bot_removed",
}) {
	const exactDeadline = formatMarkdownTimestamp(disposeAfter, "F");
	const relativeDeadline = formatMarkdownTimestamp(disposeAfter, "R");
	const deadlineLine =
		exactDeadline && relativeDeadline
		? `Delete deadline: ${exactDeadline} (${relativeDeadline}).`
		: `Delete deadline: ${disposeAfterDays} days after the server link was disabled.`;
	const reasonLine =
		reason === "bot_removed"
			? `the bot was removed from the linked ${formatPlatformLabel(missingPlatform)} server.`
			: `the bot could not confirm access to the linked ${formatPlatformLabel(missingPlatform)} server after repeated checks.`;

	return [
		"Server link disabled.",
		`Reason: ${reasonLine}`,
		"All syncs for this server pair are now paused.",
		`If the bot is not back in both servers before the deadline, all saved link data for this server pair will be deleted.`,
		deadlineLine,
	].join("\n");
}

function appendMissingAnnouncementChannelNote(content, serverLink, platform) {
	const prefix =
		typeof serverLink?.prefix === "string" && serverLink.prefix.length > 0
			? serverLink.prefix
			: ".";
	return [
		content,
		"",
		`Note: no announcement channel is configured for the ${formatPlatformLabel(platform)} side of this server link.`,
		`Use \`${prefix}set-announcement-channel\` in the desired channel or \`${prefix}set-announcement-channel ${platform} <channel-id>\` to configure one.`,
	].join("\n");
}

function sortGuildChannels(channels) {
	return [...channels].sort((left, right) => {
		const leftPosition =
			left.rawPosition ?? left.position ?? left.position_overwrite ?? 0;
		const rightPosition =
			right.rawPosition ?? right.position ?? right.position_overwrite ?? 0;
		return leftPosition - rightPosition;
	});
}

export class LinkLifecycleService {
	constructor({
		mongo,
		platforms,
		disposeAfterDays = DEFAULT_DISPOSE_AFTER_DAYS,
		cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
		disableGraceMs = DEFAULT_DISABLE_GRACE_MS,
	}) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.messageLinks = mongo.collection("message_links");
		this.pendingUserLinks = mongo.collection("pending_user_links");
		this.pendingServerUnlinks = mongo.collection("pending_server_unlinks");
		this.pendingSetups = mongo.collection("pending_setups");
		this.platforms = platforms;
		this.disposeAfterDays = disposeAfterDays;
		this.cleanupIntervalMs = cleanupIntervalMs;
		this.disableGraceMs = disableGraceMs;
		this.cleanupTimer = null;
		this.bound = false;
	}

	async start() {
		this.bindEvents();

		if (!this.cleanupTimer) {
			this.cleanupTimer = setInterval(() => {
				this.runDisposalSweep().catch((error) => {
					logger.error("Link lifecycle disposal sweep failed", {
						error: error.message,
						stack: error.stack,
					});
				});
			}, this.cleanupIntervalMs);
			this.cleanupTimer.unref?.();
		}
	}

	stop() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	bindEvents() {
		if (this.bound) {
			return;
		}

		for (const platform of ["discord", "fluxer"]) {
			const client = this.platforms[platform];

			client.on("guildAvailable", async (event) => {
				await this.handleGuildAvailable(event);
			});
			client.on("guildUnavailable", async (event) => {
				await this.handleGuildUnavailable(event);
			});
			client.on("channelDelete", async (event) => {
				await this.handleChannelDeleted(event);
			});
			client.on("roleDelete", async (event) => {
				await this.handleRoleDeleted(event);
			});
			client.on("memberJoin", async (event) => {
				await this.handleMemberJoined(event);
			});
			client.on("memberLeave", async (event) => {
				await this.handleMemberLeft(event);
			});
		}

		this.bound = true;
	}

	async reconcileAll() {
		const serverLinks = await this.serverLinks.find({}).toArray();

		for (const serverLink of serverLinks) {
			const availability = await this.refreshServerLinkAvailability(
				serverLink,
				{ reason: "startup_reconcile", forceEnable: true },
			);

			if (availability.enabled) {
				await this.reconcileStructureLinks(availability.serverLink);
				await this.reconcileUserLinks(availability.serverLink, {
					forceEnable: true,
				});
			}
		}

		await this.runDisposalSweep();
	}

	async reconcileStructureLinks(serverLink) {
		if (!isLinkEnabled(serverLink)) {
			return;
		}

		const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
		if (!serverLinkIdFilter) {
			return;
		}

		const [channelLinks, roleLinks] = await Promise.all([
			this.channelLinks
				.find({ serverLinkId: serverLinkIdFilter })
				.toArray(),
			this.roleLinks.find({ serverLinkId: serverLinkIdFilter }).toArray(),
		]);

		for (const channelLink of channelLinks) {
			const [discordChannel, fluxerChannel] = await Promise.all([
				channelLink.discordChannelId
					? this.platforms.discord.fetchGuildChannel(
							serverLink.discordGuildId,
							channelLink.discordChannelId,
						)
					: Promise.resolve(null),
				channelLink.fluxerChannelId
					? this.platforms.fluxer.fetchGuildChannel(
							serverLink.fluxerGuildId,
							channelLink.fluxerChannelId,
						)
					: Promise.resolve(null),
			]);

			if (discordChannel && fluxerChannel) {
				continue;
			}

			const missingPlatform = !discordChannel ? "discord" : "fluxer";
			const missingChannelId = getChannelIdForPlatform(
				channelLink,
				missingPlatform,
			);
			const removed = await this.deleteChannelLinkData(serverLink, channelLink, {
				reason: "startup_missing_channel",
			});
			if ((removed.deletedChannelLinks ?? 0) > 0) {
				await this.sendAnnouncements(
					serverLink,
					buildChannelLinkRemovedNotice({
						deletedPlatform: missingPlatform,
						deletedChannelId: missingChannelId,
						removedMessageLinks: removed.deletedMessageLinks,
					}),
				);
			}
		}

		for (const roleLink of roleLinks) {
			const [discordRole, fluxerRole] = await Promise.all([
				roleLink.discordRoleId
					? this.platforms.discord.fetchGuildRole(
							serverLink.discordGuildId,
							roleLink.discordRoleId,
						)
					: Promise.resolve(null),
				roleLink.fluxerRoleId
					? this.platforms.fluxer.fetchGuildRole(
							serverLink.fluxerGuildId,
							roleLink.fluxerRoleId,
						)
					: Promise.resolve(null),
			]);

			if (discordRole && fluxerRole) {
				continue;
			}

			const missingPlatform = !discordRole ? "discord" : "fluxer";
			const missingRoleId = getRoleIdForPlatform(
				roleLink,
				missingPlatform,
			);
			const removed = await this.deleteRoleLinkData(serverLink, roleLink, {
				reason: "startup_missing_role",
			});
			if ((removed.deletedRoleLinks ?? 0) > 0) {
				await this.sendAnnouncements(
					serverLink,
					buildRoleLinkRemovedNotice({
						deletedPlatform: missingPlatform,
						deletedRoleId: missingRoleId,
					}),
				);
			}
		}
	}

	async reconcileUserLinks(serverLink, options = {}) {
		if (!isLinkEnabled(serverLink)) {
			return;
		}

		const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
		if (!serverLinkIdFilter) {
			return;
		}

		const userLinks = await this.userLinks
			.find({ serverLinkId: serverLinkIdFilter })
			.toArray();

		for (const userLink of userLinks) {
			await this.refreshUserLinkPresence(serverLink, userLink, {
				reason: "startup_reconcile",
				forceEnable: options.forceEnable ?? false,
			});
		}
	}

	async handleGuildAvailable(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			const availability = await this.refreshServerLinkAvailability(
				serverLink,
				{ reason: "guild_available" },
			);

			if (availability.enabled) {
				await this.reconcileStructureLinks(availability.serverLink);
				await this.reconcileUserLinks(availability.serverLink);
			}
		} catch (error) {
			logger.error("Guild availability handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleGuildUnavailable(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			if (event.unavailable || event.platform === "fluxer") {
				await this.trackMissingServerLink(serverLink, {
					platform: event.platform,
					reason: event.unavailable
						? "guild_unavailable"
						: "guild_unavailable_check",
					notificationTargetAvailable: true,
					verifyBeforeDisable: true,
				});
				return;
			}

			const disabledServerLink = await this.markServerLinkDisabled(
				serverLink,
				{
					platform: event.platform,
					reason: "bot_removed",
				},
			);
			if (!disabledServerLink.wasAlreadyDisabled) {
				await this.sendServerLinkDisabledAnnouncement(disabledServerLink, {
					missingPlatform: event.platform,
					reason: "bot_removed",
				});
			}
		} catch (error) {
			logger.error("Guild unavailability handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleMemberLeft(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			const userField = getUserFieldName(event.platform);
			const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
			if (!serverLinkIdFilter) {
				return;
			}

			const userLinks = await this.userLinks
				.find({
					serverLinkId: serverLinkIdFilter,
					[userField]: event.userId,
				})
				.toArray();

			for (const userLink of userLinks) {
				await this.markUserLinkDisabled(userLink, {
					platform: event.platform,
					reason: "member_left",
				});
			}
		} catch (error) {
			logger.error("Member leave handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				userId: event.userId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleMemberJoined(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			const userField = getUserFieldName(event.platform);
			const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
			if (!serverLinkIdFilter) {
				return;
			}

			const userLinks = await this.userLinks
				.find({
					serverLinkId: serverLinkIdFilter,
					[userField]: event.userId,
				})
				.toArray();

			for (const userLink of userLinks) {
				await this.refreshUserLinkPresence(serverLink, userLink, {
					reason: "member_joined",
				});
			}
		} catch (error) {
			logger.error("Member join handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				userId: event.userId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleChannelDeleted(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			const channelField = getChannelFieldName(event.platform);
			const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
			if (!serverLinkIdFilter) {
				return;
			}

			const channelLinks = await this.channelLinks
				.find({
					serverLinkId: serverLinkIdFilter,
					[channelField]: event.channelId,
				})
				.toArray();

			for (const channelLink of channelLinks) {
				const removed = await this.deleteChannelLinkData(
					serverLink,
					channelLink,
					{ reason: "linked_channel_deleted" },
				);
				if ((removed.deletedChannelLinks ?? 0) > 0) {
					await this.sendAnnouncements(
						serverLink,
						buildChannelLinkRemovedNotice({
							deletedPlatform: event.platform,
							deletedChannelId: event.channelId,
							removedMessageLinks: removed.deletedMessageLinks,
						}),
					);
				}
			}
		} catch (error) {
			logger.error("Channel deletion handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleRoleDeleted(event) {
		try {
			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}

			const roleField = getRoleFieldName(event.platform);
			const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
			if (!serverLinkIdFilter) {
				return;
			}

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: serverLinkIdFilter,
					[roleField]: event.roleId,
				})
				.toArray();

			for (const roleLink of roleLinks) {
				const removed = await this.deleteRoleLinkData(serverLink, roleLink, {
					reason: "linked_role_deleted",
				});
				if ((removed.deletedRoleLinks ?? 0) > 0) {
					await this.sendAnnouncements(
						serverLink,
						buildRoleLinkRemovedNotice({
							deletedPlatform: event.platform,
							deletedRoleId: event.roleId,
						}),
					);
				}
			}
		} catch (error) {
			logger.error("Role deletion handling failed", {
				platform: event.platform,
				guildId: event.guildId,
				roleId: event.roleId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async refreshServerLinkAvailability(serverLink, options = {}) {
		const [discordGuild, fluxerGuild] = await Promise.all([
			this.platforms.discord.fetchGuildSummary(serverLink.discordGuildId),
			this.platforms.fluxer.fetchGuildSummary(serverLink.fluxerGuildId),
		]);

		if (discordGuild && fluxerGuild) {
			const enabledServerLink = await this.markServerLinkEnabled(
				serverLink,
				{
					reason: options.reason ?? "guild_available",
					force: options.forceEnable ?? false,
				},
			);
			return { enabled: true, serverLink: enabledServerLink };
		}

		const missingPlatform = !discordGuild
			? "discord"
			: !fluxerGuild
				? "fluxer"
				: null;
		const notificationTargetAvailable =
			missingPlatform === "discord"
				? fluxerGuild
				: missingPlatform === "fluxer"
					? discordGuild
					: null;
		return this.trackMissingServerLink(serverLink, {
			platform: missingPlatform,
			reason: options.reason ?? "guild_missing",
			notificationTargetAvailable,
		});
	}

	async trackMissingServerLink(serverLink, options = {}) {
		if (!options.platform) {
			return { enabled: false, serverLink };
		}

		if (!isLinkEnabled(serverLink)) {
			const disabledServerLink = await this.markServerLinkDisabled(
				serverLink,
				{
					platform: options.platform,
					reason: options.reason ?? "guild_missing",
				},
			);
			return { enabled: false, serverLink: disabledServerLink };
		}

		const pendingServerLink =
			await this.markServerLinkAvailabilityMissing(serverLink, {
				platform: options.platform,
				reason: options.reason ?? "guild_missing",
			});

		if (!pendingServerLink.graceExpired) {
			return {
				enabled: false,
				pendingDisable: true,
				serverLink: pendingServerLink,
			};
		}

		if (options.verifyBeforeDisable) {
			const guildId = getGuildIdForPlatform(serverLink, options.platform);
			const guild = guildId
				? await this.platforms[options.platform].fetchGuildSummary(
						guildId,
					)
				: null;
			if (guild) {
				const enabledServerLink = await this.markServerLinkEnabled(
					pendingServerLink,
					{ reason: "availability_recovered_before_disable" },
				);
				return { enabled: true, serverLink: enabledServerLink };
			}
		}

		const disabledServerLink = await this.markServerLinkDisabled(
			pendingServerLink,
			{
				platform: options.platform,
				reason: options.reason ?? "guild_missing",
			},
		);
		if (
			options.notificationTargetAvailable &&
			!disabledServerLink.wasAlreadyDisabled
		) {
			await this.sendServerLinkDisabledAnnouncement(disabledServerLink, {
				missingPlatform: options.platform,
				reason:
					options.reason === "bot_removed"
						? "bot_removed"
						: "availability_confirmed_missing",
			});
		}

		return { enabled: false, serverLink: disabledServerLink };
	}

	async refreshUserLinkPresence(serverLink, userLink, options = {}) {
		if (!isLinkEnabled(serverLink)) {
			return { enabled: false, skippedDisabledServer: true, userLink };
		}

		const [discordMember, fluxerMember] = await Promise.all([
			this.platforms.discord.fetchGuildMember(
				serverLink.discordGuildId,
				userLink.discordUserId,
			),
			this.platforms.fluxer.fetchGuildMember(
				serverLink.fluxerGuildId,
				userLink.fluxerUserId,
			),
		]);

		if (discordMember && fluxerMember) {
			const enabledUserLink = await this.markUserLinkEnabled(userLink, {
				reason: options.reason ?? "member_present",
				force: options.forceEnable ?? false,
			});
			return { enabled: true, userLink: enabledUserLink };
		}

		const missingPlatform = !discordMember
			? "discord"
			: !fluxerMember
				? "fluxer"
				: null;
		const disabledUserLink = await this.markUserLinkDisabled(userLink, {
			platform: missingPlatform,
			reason: options.reason ?? "member_missing",
		});
		return {
			enabled: false,
			missingPlatform,
			userLink: disabledUserLink,
		};
	}

	async markServerLinkAvailabilityMissing(serverLink, options = {}) {
		const serverLinkId = getMongoObjectId(serverLink);
		if (!serverLinkId) {
			return serverLink;
		}

		const now = new Date();
		const existingMissingSince =
			serverLink.availabilityMissingPlatform === options.platform
				? toValidDate(serverLink.availabilityMissingSince)
				: null;
		const availabilityMissingSince = existingMissingSince ?? now;
		const availabilityMissingConfirmAfter = new Date(
			availabilityMissingSince.getTime() + this.disableGraceMs,
		);
		const set = {
			availabilityMissingPlatform: options.platform ?? null,
			availabilityMissingReason: options.reason ?? "guild_missing",
			availabilityMissingSince,
			availabilityMissingUpdatedAt: now,
			availabilityMissingConfirmAfter,
		};

		await this.serverLinks.updateOne(
			{ _id: serverLinkId },
			{ $set: set },
		);

		return {
			...serverLink,
			...set,
			graceExpired: isPastDate(availabilityMissingConfirmAfter, now),
		};
	}

	async markServerLinkDisabled(serverLink, options = {}) {
		const serverLinkId = getMongoObjectId(serverLink);
		if (!serverLinkId) {
			return serverLink;
		}

		const now = new Date();
		const existingDisabledAt = toValidDate(serverLink.disabledAt);
		const wasAlreadyDisabled = Boolean(existingDisabledAt);
		const disabledAt = existingDisabledAt ?? now;
		const set = {
			enabled: false,
			disabledByPlatform: options.platform ?? null,
			disabledReason: options.reason ?? "disabled",
			disabledUpdatedAt: now,
			disposeAfter: addDays(disabledAt, this.disposeAfterDays),
		};

		if (!existingDisabledAt) {
			set.disabledAt = disabledAt;
		}

		await this.serverLinks.updateOne(
			{ _id: serverLinkId },
			{
				$set: set,
				$unset: {
					availabilityMissingPlatform: "",
					availabilityMissingReason: "",
					availabilityMissingSince: "",
					availabilityMissingUpdatedAt: "",
					availabilityMissingConfirmAfter: "",
				},
			},
		);

		logger.info("Server link disabled", {
			serverLinkId: String(serverLinkId),
			discordGuildId: serverLink.discordGuildId,
			fluxerGuildId: serverLink.fluxerGuildId,
			disabledByPlatform: set.disabledByPlatform,
			reason: set.disabledReason,
			disabledAt: disabledAt.toISOString(),
		});

		return {
			...serverLink,
			...set,
			disabledAt,
			wasAlreadyDisabled,
		};
	}

	async markServerLinkEnabled(serverLink, options = {}) {
		const wasDisabled = !isLinkEnabled(serverLink);
		if (
			!wasDisabled &&
			!options.force &&
			!serverLink.availabilityMissingSince
		) {
			return serverLink;
		}

		const serverLinkId = getMongoObjectId(serverLink);
		if (!serverLinkId) {
			return serverLink;
		}

		const now = new Date();
		await this.serverLinks.updateOne(
			{ _id: serverLinkId },
			{
				$set: {
					enabled: true,
					enabledAt: now,
					enabledReason: options.reason ?? "enabled",
				},
				$unset: {
					disabledAt: "",
					disabledByPlatform: "",
					disabledReason: "",
					disabledUpdatedAt: "",
					disposeAfter: "",
					availabilityMissingPlatform: "",
					availabilityMissingReason: "",
					availabilityMissingSince: "",
					availabilityMissingUpdatedAt: "",
					availabilityMissingConfirmAfter: "",
				},
			},
		);

		if (wasDisabled) {
			logger.info("Server link enabled", {
				serverLinkId: String(serverLinkId),
				discordGuildId: serverLink.discordGuildId,
				fluxerGuildId: serverLink.fluxerGuildId,
				reason: options.reason ?? "enabled",
			});
		}

		const {
			disabledAt,
			disabledByPlatform,
			disabledReason,
			disabledUpdatedAt,
			disposeAfter,
			availabilityMissingPlatform,
			availabilityMissingReason,
			availabilityMissingSince,
			availabilityMissingUpdatedAt,
			availabilityMissingConfirmAfter,
			...enabledServerLink
		} = serverLink;
		return {
			...enabledServerLink,
			enabled: true,
			enabledAt: now,
			enabledReason: options.reason ?? "enabled",
		};
	}

	async markUserLinkDisabled(userLink, options = {}) {
		const userLinkId = getMongoObjectId(userLink);
		if (!userLinkId) {
			return userLink;
		}

		const now = new Date();
		const existingDisabledAt = toValidDate(userLink.disabledAt);
		const disabledAt = existingDisabledAt ?? now;
		const set = {
			enabled: false,
			disabledByPlatform: options.platform ?? null,
			disabledReason: options.reason ?? "disabled",
			disabledUpdatedAt: now,
			disposeAfter: addDays(disabledAt, this.disposeAfterDays),
		};

		if (!existingDisabledAt) {
			set.disabledAt = disabledAt;
		}

		await this.userLinks.updateOne({ _id: userLinkId }, { $set: set });

		logger.info("User link disabled", {
			userLinkId: String(userLinkId),
			serverLinkId: String(userLink.serverLinkId),
			discordUserId: userLink.discordUserId,
			fluxerUserId: userLink.fluxerUserId,
			disabledByPlatform: set.disabledByPlatform,
			reason: set.disabledReason,
			disabledAt: disabledAt.toISOString(),
		});

		return {
			...userLink,
			...set,
			disabledAt,
		};
	}

	async markUserLinkEnabled(userLink, options = {}) {
		const wasDisabled = !isLinkEnabled(userLink);
		if (!wasDisabled && !options.force) {
			return userLink;
		}

		const userLinkId = getMongoObjectId(userLink);
		if (!userLinkId) {
			return userLink;
		}

		const now = new Date();
		await this.userLinks.updateOne(
			{ _id: userLinkId },
			{
				$set: {
					enabled: true,
					enabledAt: now,
					enabledReason: options.reason ?? "enabled",
				},
				$unset: {
					disabledAt: "",
					disabledByPlatform: "",
					disabledReason: "",
					disabledUpdatedAt: "",
					disposeAfter: "",
				},
			},
		);

		if (wasDisabled) {
			logger.info("User link enabled", {
				userLinkId: String(userLinkId),
				serverLinkId: String(userLink.serverLinkId),
				discordUserId: userLink.discordUserId,
				fluxerUserId: userLink.fluxerUserId,
				reason: options.reason ?? "enabled",
			});
		}

		const {
			disabledAt,
			disabledByPlatform,
			disabledReason,
			disabledUpdatedAt,
			disposeAfter,
			...enabledUserLink
		} = userLink;
		return {
			...enabledUserLink,
			enabled: true,
			enabledAt: now,
			enabledReason: options.reason ?? "enabled",
		};
	}

	async runDisposalSweep() {
		const now = new Date();
		const pendingMissingServerLinks = await this.serverLinks
			.find({
				availabilityMissingSince: { $type: "date" },
				disabledAt: { $exists: false },
			})
			.toArray();

		for (const serverLink of pendingMissingServerLinks) {
			await this.refreshServerLinkAvailability(serverLink, {
				reason: "availability_grace_check",
			});
		}

		const disabledServerLinks = await this.serverLinks
			.find({ disabledAt: { $type: "date" } })
			.toArray();

		for (const serverLink of disabledServerLinks) {
			const availability = await this.refreshServerLinkAvailability(
				serverLink,
				{ reason: "disposal_check" },
			);
			if (availability.enabled) {
				continue;
			}

			const current = await this.serverLinks.findOne({
				_id: serverLink._id,
			});
			if (current && isExpired(current.disabledAt, now, this.disposeAfterDays)) {
				await this.deleteServerLinkData(current, {
					reason: "server_disabled_expired",
				});
			}
		}

		const disabledUserLinks = await this.userLinks
			.find({ disabledAt: { $type: "date" } })
			.toArray();

		for (const userLink of disabledUserLinks) {
			const serverLinkId = sanitizeMongoObjectId(userLink.serverLinkId);
			const serverLink = serverLinkId
				? await this.serverLinks.findOne({ _id: serverLinkId })
				: null;

			if (!serverLink) {
				await this.deleteUserLinkData(null, userLink, {
					reason: "orphan_user_link",
				});
				continue;
			}

			if (!isLinkEnabled(serverLink)) {
				continue;
			}

			const presence = await this.refreshUserLinkPresence(
				serverLink,
				userLink,
				{ reason: "disposal_check" },
			);
			if (presence.enabled) {
				continue;
			}

			const current = await this.userLinks.findOne({
				_id: userLink._id,
			});
			if (current && isExpired(current.disabledAt, now, this.disposeAfterDays)) {
				await this.deleteUserLinkData(serverLink, current, {
					reason: "user_disabled_expired",
				});
			}
		}
	}

	async deleteServerLinkData(serverLinkOrId, options = {}) {
		const serverLink =
			serverLinkOrId && typeof serverLinkOrId === "object"
				? serverLinkOrId
				: await this.serverLinks.findOne({
						_id: sanitizeMongoObjectId(serverLinkOrId),
					});
		const serverLinkId =
			getMongoObjectId(serverLinkOrId) ?? getMongoObjectId(serverLink);
		const serverLinkIdFilter = getServerLinkIdFilter(serverLinkId);
		if (!serverLinkId || !serverLinkIdFilter) {
			return {
				deletedServerLinks: 0,
				deletedChannelLinks: 0,
				deletedRoleLinks: 0,
				deletedUserLinks: 0,
				deletedMessageLinks: 0,
				deletedManagedWebhooks: 0,
				deletedPendingUserLinks: 0,
				deletedPendingServerUnlinks: 0,
				deletedPendingSetups: 0,
			};
		}

		const pendingSetupFilters = [];
		if (serverLink?.discordGuildId && serverLink?.fluxerGuildId) {
			pendingSetupFilters.push(
				{
					sourcePlatform: "discord",
					sourceGuildId: serverLink.discordGuildId,
					targetPlatform: "fluxer",
					targetGuildId: serverLink.fluxerGuildId,
				},
				{
					sourcePlatform: "fluxer",
					sourceGuildId: serverLink.fluxerGuildId,
					targetPlatform: "discord",
					targetGuildId: serverLink.discordGuildId,
				},
			);
		}

		const channelLinksForCleanup = await this.channelLinks
			.find({ serverLinkId: serverLinkIdFilter })
			.toArray();
		const deletedManagedWebhooks =
			await this.deleteManagedChannelWebhooksForLinks(
				channelLinksForCleanup,
			);

		const [
			messageResult,
			channelResult,
			roleResult,
			userResult,
			pendingUserResult,
			pendingServerUnlinkResult,
			pendingSetupResult,
			serverResult,
		] = await Promise.all([
			this.messageLinks.deleteMany({ serverLinkId: serverLinkIdFilter }),
			this.channelLinks.deleteMany({ serverLinkId: serverLinkIdFilter }),
			this.roleLinks.deleteMany({ serverLinkId: serverLinkIdFilter }),
			this.userLinks.deleteMany({ serverLinkId: serverLinkIdFilter }),
			this.pendingUserLinks.deleteMany({
				serverLinkId: serverLinkIdFilter,
			}),
			this.pendingServerUnlinks.deleteMany({
				serverLinkId: serverLinkIdFilter,
			}),
			pendingSetupFilters.length > 0
				? this.pendingSetups.deleteMany({ $or: pendingSetupFilters })
				: Promise.resolve({ deletedCount: 0 }),
			this.serverLinks.deleteOne({ _id: serverLinkId }),
		]);

		const result = {
			deletedServerLinks: serverResult.deletedCount ?? 0,
			deletedChannelLinks: channelResult.deletedCount ?? 0,
			deletedRoleLinks: roleResult.deletedCount ?? 0,
			deletedUserLinks: userResult.deletedCount ?? 0,
			deletedMessageLinks: messageResult.deletedCount ?? 0,
			deletedManagedWebhooks,
			deletedPendingUserLinks: pendingUserResult.deletedCount ?? 0,
			deletedPendingServerUnlinks:
				pendingServerUnlinkResult.deletedCount ?? 0,
			deletedPendingSetups: pendingSetupResult.deletedCount ?? 0,
		};

		logger.info("Server link data deleted", {
			serverLinkId: String(serverLinkId),
			discordGuildId: serverLink?.discordGuildId ?? null,
			fluxerGuildId: serverLink?.fluxerGuildId ?? null,
			reason: options.reason ?? "delete_server_link_data",
			...result,
		});

		return result;
	}

	async deleteManagedChannelWebhooksForLinks(channelLinks) {
		let deleted = 0;
		for (const channelLink of channelLinks ?? []) {
			deleted += await this.deleteManagedChannelWebhooks(channelLink);
		}
		return deleted;
	}

	async deleteManagedChannelWebhooks(channelLink) {
		const results = await Promise.all(
			["discord", "fluxer"].map(async (platform) => {
				const webhook = getWebhookCredentials(channelLink, platform);
				const client = this.platforms[platform];
				if (
					!webhook ||
					typeof client?.deleteGuildChannelWebhook !== "function"
				) {
					return false;
				}

				try {
					return await client.deleteGuildChannelWebhook(webhook);
				} catch (error) {
					logger.warn("Failed to delete managed bridge webhook", {
						platform,
						webhookId: webhook.id,
						channelLinkId: String(channelLink?._id ?? ""),
						error: error.message,
					});
					return false;
				}
			}),
		);
		return results.filter(Boolean).length;
	}

	async deleteChannelLinkData(serverLink, channelLink, options = {}) {
		const channelLinkId = getMongoObjectId(channelLink);
		if (!channelLinkId) {
			return {
				deletedChannelLinks: 0,
				deletedMessageLinks: 0,
				deletedManagedWebhooks: 0,
			};
		}

		const deletedManagedWebhooks =
			await this.deleteManagedChannelWebhooks(channelLink);

		const serverLinkIdFilter = getServerLinkIdFilter(
			serverLink?._id ?? channelLink.serverLinkId,
		);
		const messageLinkFilters = [
			channelLink.discordChannelId
				? { discordChannelId: channelLink.discordChannelId }
				: null,
			channelLink.fluxerChannelId
				? { fluxerChannelId: channelLink.fluxerChannelId }
				: null,
		].filter(Boolean);

		const [channelResult, messageResult] = await Promise.all([
			this.channelLinks.deleteOne({ _id: channelLinkId }),
			serverLinkIdFilter && messageLinkFilters.length > 0
				? this.messageLinks.deleteMany({
						serverLinkId: serverLinkIdFilter,
						$or: messageLinkFilters,
					})
				: Promise.resolve({ deletedCount: 0 }),
		]);

		const result = {
			deletedChannelLinks: channelResult.deletedCount ?? 0,
			deletedMessageLinks: messageResult.deletedCount ?? 0,
			deletedManagedWebhooks,
		};

		logger.info("Channel link data deleted", {
			channelLinkId: String(channelLinkId),
			serverLinkId: String(serverLink?._id ?? channelLink.serverLinkId),
			discordChannelId: channelLink.discordChannelId,
			fluxerChannelId: channelLink.fluxerChannelId,
			reason: options.reason ?? "delete_channel_link_data",
			...result,
		});

		return result;
	}

	async deleteRoleLinkData(serverLink, roleLink, options = {}) {
		const roleLinkId = getMongoObjectId(roleLink);
		if (!roleLinkId) {
			return { deletedRoleLinks: 0 };
		}

		const result = await this.roleLinks.deleteOne({ _id: roleLinkId });

		logger.info("Role link data deleted", {
			roleLinkId: String(roleLinkId),
			serverLinkId: String(serverLink?._id ?? roleLink.serverLinkId),
			discordRoleId: roleLink.discordRoleId,
			fluxerRoleId: roleLink.fluxerRoleId,
			reason: options.reason ?? "delete_role_link_data",
			deletedRoleLinks: result.deletedCount ?? 0,
		});

		return { deletedRoleLinks: result.deletedCount ?? 0 };
	}

	async deleteUserLinkData(serverLink, userLink, options = {}) {
		const userLinkId = getMongoObjectId(userLink);
		if (!userLinkId) {
			return { deletedUserLinks: 0 };
		}

		const result = await this.userLinks.deleteOne({ _id: userLinkId });

		logger.info("User link data deleted", {
			userLinkId: String(userLinkId),
			serverLinkId: String(serverLink?._id ?? userLink.serverLinkId),
			discordUserId: userLink.discordUserId,
			fluxerUserId: userLink.fluxerUserId,
			reason: options.reason ?? "delete_user_link_data",
			deletedUserLinks: result.deletedCount ?? 0,
		});

		return { deletedUserLinks: result.deletedCount ?? 0 };
	}

	async sendServerLinkDisabledAnnouncement(
		serverLink,
		{ missingPlatform, reason = "bot_removed" } = {},
	) {
		if (!missingPlatform) {
			return false;
		}

		const targetPlatform = getOtherPlatform(missingPlatform);
		return this.sendAnnouncement(
			serverLink,
			targetPlatform,
			buildServerLinkDisabledNotice({
				missingPlatform,
				disposeAfter: serverLink.disposeAfter,
				disposeAfterDays: this.disposeAfterDays,
				reason,
			}),
		);
	}

	async sendAnnouncements(
		serverLink,
		content,
		targetPlatforms = ["discord", "fluxer"],
	) {
		const results = await Promise.all(
			targetPlatforms.map((targetPlatform) =>
				this.sendAnnouncement(serverLink, targetPlatform, content),
			),
		);
		return results.some(Boolean);
	}

	async sendAnnouncement(serverLink, targetPlatform, content) {
		const channelId = getAnnouncementChannelIdForPlatform(
			serverLink,
			targetPlatform,
		);
		if (!channelId) {
			logger.warn("Announcement channel is not configured", {
				serverLinkId: String(serverLink?._id ?? ""),
				targetPlatform,
			});
			return this.sendAnnouncementFallback(
				serverLink,
				targetPlatform,
				appendMissingAnnouncementChannelNote(
					content,
					serverLink,
					targetPlatform,
				),
			);
		}

		const payload = {
			content,
			allowedMentions: buildAllowedMentions(targetPlatform),
		};

		try {
			const sent = await this.platforms[targetPlatform].sendGuildMessage(
				channelId,
				payload,
			);
			if (sent) {
				return true;
			}
		} catch (error) {
			logger.warn("Failed to send announcement", {
				serverLinkId: String(serverLink?._id ?? ""),
				targetPlatform,
				channelId,
				error: error.message,
			});
			return false;
		}

		logger.warn("Failed to send announcement", {
			serverLinkId: String(serverLink?._id ?? ""),
			targetPlatform,
			channelId,
		});
		return false;
	}

	async sendAnnouncementFallback(serverLink, targetPlatform, content) {
		const payload = {
			content,
			allowedMentions: buildAllowedMentions(targetPlatform),
		};
		const channelIds = await this.getAnnouncementFallbackChannelIds(
			serverLink,
			targetPlatform,
		);

		for (const channelId of channelIds) {
			if (
				!(await this.isAnnouncementFallbackChannel(
					targetPlatform,
					serverLink,
					channelId,
				))
			) {
				continue;
			}

			const sent = await this.platforms[targetPlatform].sendGuildMessage(
				channelId,
				payload,
			);
			if (sent) {
				return true;
			}
		}

		logger.warn("Failed to send announcement fallback", {
			serverLinkId: String(serverLink?._id ?? ""),
			targetPlatform,
			attemptedChannels: channelIds.length,
		});
		return false;
	}

	async getAnnouncementFallbackChannelIds(serverLink, targetPlatform) {
		const channelIds = [];
		const seen = new Set();

		function addChannelId(channelId) {
			const normalizedChannelId = sanitizePlatformId(channelId);
			if (!normalizedChannelId || seen.has(normalizedChannelId)) {
				return;
			}
			seen.add(normalizedChannelId);
			channelIds.push(normalizedChannelId);
		}

		const serverLinkIdFilter = getServerLinkIdFilter(serverLink?._id);
		const targetChannelField = getChannelFieldName(targetPlatform);
		if (serverLinkIdFilter) {
			const channelLinks = await this.channelLinks
				.find({ serverLinkId: serverLinkIdFilter })
				.sort({ createdAt: 1 })
				.toArray();
			for (const channelLink of channelLinks) {
				addChannelId(channelLink[targetChannelField]);
			}
		}

		const guildId = getGuildIdForPlatform(serverLink, targetPlatform);
		const client = this.platforms[targetPlatform];
		if (guildId && typeof client.fetchGuildChannels === "function") {
			const guildChannels = await client.fetchGuildChannels(guildId);
			for (const channel of sortGuildChannels(guildChannels ?? [])) {
				addChannelId(channel?.id);
			}
		}

		return channelIds;
	}

	async isAnnouncementFallbackChannel(
		targetPlatform,
		serverLink,
		channelId,
	) {
		const guildId = getGuildIdForPlatform(serverLink, targetPlatform);
		if (!guildId || !channelId) {
			return false;
		}

		const template =
			await this.platforms[targetPlatform].getGuildChannelTemplate(
				guildId,
				channelId,
			);
		return template?.kind === "text";
	}

	async findServerLink(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		const sanitizedGuildId = sanitizePlatformId(guildId);
		if (!sanitizedGuildId) {
			return null;
		}
		return this.serverLinks.findOne({
			[fieldName]: { $eq: sanitizedGuildId },
		});
	}
}
