// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
import { OperationGuard } from "../core/operationGuard.js";
import { isLinkEnabled } from "./linkLifecycleService.js";
import { sanitizeMongoObjectId } from "../utils/sanitize.js";

function getOppositePlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}

	if (platform === "fluxer") {
		return "discord";
	}

	throw new Error(`Unsupported platform: ${platform}`);
}

function getGuildIdForPlatform(serverLink, platform) {
	return platform === "discord"
		? serverLink.discordGuildId
		: serverLink.fluxerGuildId;
}

function getChannelIdForPlatform(channelLink, platform) {
	return platform === "discord"
		? channelLink.discordChannelId
		: channelLink.fluxerChannelId;
}

function getRoleIdForPlatform(roleLink, platform) {
	return platform === "discord"
		? roleLink.discordRoleId
		: roleLink.fluxerRoleId;
}

function getUserIdForPlatform(userLink, platform) {
	return platform === "discord"
		? userLink.discordUserId
		: userLink.fluxerUserId;
}

function getChannelFieldForPlatform(platform) {
	return platform === "discord" ? "discordChannelId" : "fluxerChannelId";
}

function isSupportedPlatform(platform) {
	return platform === "discord" || platform === "fluxer";
}

function normalizeNullableString(value) {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

function normalizeRoleTemplate(template) {
	return {
		name: String(template?.name ?? ""),
		color: Number(template?.color ?? 0),
		permissions: String(template?.permissions ?? "0"),
		hoist: Boolean(template?.hoist),
		mentionable: Boolean(template?.mentionable),
	};
}

function roleTemplatesEqual(left, right) {
	const a = normalizeRoleTemplate(left);
	const b = normalizeRoleTemplate(right);

	return (
		a.name === b.name &&
		a.color === b.color &&
		a.permissions === b.permissions &&
		a.hoist === b.hoist &&
		a.mentionable === b.mentionable
	);
}

function normalizeOverwriteType(type) {
	if (type === "role" || type === 0 || type === "0") {
		return "role";
	}

	if (type === "member" || type === 1 || type === "1") {
		return "member";
	}

	return null;
}

function normalizePermissionOverwrite(overwrite) {
	const id = overwrite?.id ? String(overwrite.id) : null;
	const type = normalizeOverwriteType(overwrite?.type);

	if (!id || !type) {
		return null;
	}

	return {
		id,
		type,
		allow: String(overwrite?.allow ?? "0"),
		deny: String(overwrite?.deny ?? "0"),
	};
}

function normalizePermissionOverwrites(overwrites = []) {
	const byKey = new Map();

	for (const rawOverwrite of overwrites ?? []) {
		const overwrite = normalizePermissionOverwrite(rawOverwrite);
		if (!overwrite) {
			continue;
		}

		byKey.set(`${overwrite.type}:${overwrite.id}`, overwrite);
	}

	return [...byKey.values()].sort((left, right) => {
		if (left.type !== right.type) {
			return left.type.localeCompare(right.type);
		}

		return left.id.localeCompare(right.id);
	});
}

function normalizeChannelTemplate(template) {
	const kind = String(template?.kind ?? "unknown");
	const normalized = {
		kind,
		name: String(template?.name ?? ""),
		parentId: normalizeNullableString(template?.parentId),
		permissionOverwrites: normalizePermissionOverwrites(
			template?.permissionOverwrites,
		),
	};

	if (kind === "text") {
		normalized.topic = normalizeNullableString(template?.topic);
		normalized.nsfw = Boolean(template?.nsfw);
		normalized.rateLimitPerUser = Number(
			template?.rateLimitPerUser ?? 0,
		);
	}

	if (kind === "voice") {
		normalized.bitrate =
			template?.bitrate === null || template?.bitrate === undefined
				? null
				: Number(template.bitrate);
		normalized.userLimit = Number(template?.userLimit ?? 0);
	}

	return normalized;
}

function channelTemplatesEqual(left, right) {
	return (
		JSON.stringify(normalizeChannelTemplate(left)) ===
		JSON.stringify(normalizeChannelTemplate(right))
	);
}

function normalizeNick(value) {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

function normalizeMemberSnapshot(snapshot) {
	if (
		!snapshot ||
		!snapshot.roleIds ||
		typeof snapshot.roleIds[Symbol.iterator] !== "function"
	) {
		return null;
	}

	return {
		userId: snapshot.userId ?? null,
		nick: snapshot.nick ?? null,
		roleIds: new Set(snapshot.roleIds ?? []),
	};
}

function getServerLinkIdValues(serverLinkId) {
	const values = [];
	const objectId = sanitizeMongoObjectId(serverLinkId);

	if (objectId) {
		values.push(objectId);
	}

	if (serverLinkId !== null && serverLinkId !== undefined) {
		const stringId = String(serverLinkId);
		if (stringId) {
			values.push(stringId);
		}
	}

	return values;
}

function getServerLinkIdFilter(serverLinkId) {
	const values = getServerLinkIdValues(serverLinkId);

	if (values.length === 1) {
		return values[0];
	}

	return { $in: values };
}

function createRoleMembershipSummary() {
	return {
		checked: 0,
		differences: 0,
		changed: 0,
		skippedUnmanageableRoles: 0,
		failed: 0,
	};
}

function createRoleMetadataSyncResult() {
	return {
		differences: 0,
		changed: 0,
		skippedDisabled: 0,
		skippedUnsupported: 0,
		skippedMissingSource: 0,
		skippedMissingTarget: 0,
		skippedUnmanageable: 0,
		failed: 0,
	};
}

function createRoleMetadataSummary() {
	return {
		checked: 0,
		...createRoleMetadataSyncResult(),
	};
}

function createChannelMetadataSyncResult() {
	return {
		differences: 0,
		changed: 0,
		skippedDisabled: 0,
		skippedUnsupported: 0,
		skippedMissingIds: 0,
		skippedMissingSource: 0,
		skippedMissingTarget: 0,
		skippedTypeMismatch: 0,
		skippedUnmanageable: 0,
		failed: 0,
	};
}

function createChannelMetadataSummary() {
	return {
		checked: 0,
		roleLinksUsed: 0,
		...createChannelMetadataSyncResult(),
	};
}

function addSyncResult(summary, result) {
	if (!result) {
		return;
	}

	for (const [key, value] of Object.entries(result)) {
		if (typeof summary[key] === "number") {
			summary[key] += Number(value) || 0;
		}
	}
}

export class SyncService {
	constructor({ mongo, platforms, lifecycleService = null }) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.platforms = platforms;
		this.lifecycleService = lifecycleService;
		this.guard = new OperationGuard(8000);
	}

	async start() {
		this.bindEvents();
		await this.reconcileAll();
	}

	bindEvents() {
		this.platforms.discord.on("roleUpdate", async (event) => {
			await this.handleLiveRoleUpdate(event);
		});

		this.platforms.fluxer.on("roleUpdate", async (event) => {
			await this.handleLiveRoleUpdate(event);
		});

		this.platforms.discord.on("channelUpdate", async (event) => {
			await this.handleLiveChannelUpdate(event);
		});

		this.platforms.fluxer.on("channelUpdate", async (event) => {
			await this.handleLiveChannelUpdate(event);
		});

		this.platforms.discord.on("memberUpdate", async (event) => {
			await this.handleLiveMemberUpdate(event);
		});

		this.platforms.fluxer.on("memberUpdate", async (event) => {
			await this.handleLiveMemberUpdate(event);
		});
	}

	async reconcileAll() {
		const serverLinks = await this.serverLinks.find({}).toArray();
		let enabledServerLinkCount = 0;

		for (const serverLink of serverLinks) {
			if (!isLinkEnabled(serverLink)) {
				continue;
			}
			enabledServerLinkCount += 1;
			await this.reconcileServerLink(serverLink);
		}

		logger.info("Initial reconciliation finished", {
			serverLinkCount: serverLinks.length,
			enabledServerLinkCount,
		});
	}

	async reconcileServerLink(serverLink) {
		if (!isLinkEnabled(serverLink)) {
			return;
		}

		const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);

		const roleLinks = await this.roleLinks
			.find({
				serverLinkId: serverLinkIdFilter,
			})
			.toArray();

		const channelLinks = await this.channelLinks
			.find({
				serverLinkId: serverLinkIdFilter,
			})
			.toArray();

		const userLinks = await this.userLinks
			.find({
				serverLinkId: serverLinkIdFilter,
			})
			.toArray();

		for (const roleLink of roleLinks) {
			await this.syncRoleMetadata(
				serverLink,
				roleLink,
				roleLink.priority,
			);
		}

		for (const channelLink of channelLinks) {
			await this.syncLinkedChannel(serverLink, channelLink, roleLinks);
		}

		for (const userLink of userLinks) {
			await this.syncLinkedUser(serverLink, userLink, roleLinks);
		}
	}

	async resyncLinkedRoles(serverLink) {
		const summary = createRoleMetadataSummary();
		if (!isLinkEnabled(serverLink)) {
			summary.skippedDisabled += 1;
			return summary;
		}

		const roleLinks = await this.roleLinks
			.find({
				serverLinkId: getServerLinkIdFilter(serverLink._id),
			})
			.toArray();
		summary.checked = roleLinks.length;

		for (const roleLink of roleLinks) {
			addSyncResult(
				summary,
				await this.syncRoleMetadata(
					serverLink,
					roleLink,
					roleLink.priority,
				),
			);
		}

		return summary;
	}

	async resyncLinkedChannels(serverLink) {
		const summary = createChannelMetadataSummary();
		if (!isLinkEnabled(serverLink)) {
			summary.skippedDisabled += 1;
			return summary;
		}

		const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);
		const roleLinks = await this.roleLinks
			.find({
				serverLinkId: serverLinkIdFilter,
			})
			.toArray();
		const channelLinks = await this.channelLinks
			.find({
				serverLinkId: serverLinkIdFilter,
			})
			.toArray();
		summary.checked = channelLinks.length;
		summary.roleLinksUsed = roleLinks.length;

		for (const channelLink of channelLinks) {
			addSyncResult(
				summary,
				await this.syncLinkedChannel(
					serverLink,
					channelLink,
					roleLinks,
				),
			);
		}

		return summary;
	}

	async syncLinkedUser(serverLink, userLink, roleLinks = null) {
		const linkedRoleLinks =
			roleLinks ??
			(await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
				})
				.toArray());

		if (!isLinkEnabled(serverLink)) {
			return {
				roleLinkCount: linkedRoleLinks.length,
				membershipSummary: createRoleMembershipSummary(),
				skipped: true,
				skippedDisabledServer: true,
			};
		}

		if (!isLinkEnabled(userLink)) {
			const presence =
				await this.lifecycleService?.refreshUserLinkPresence(
					serverLink,
					userLink,
					{ reason: "user_sync_presence_check" },
				);

			if (!presence?.enabled) {
				return {
					roleLinkCount: linkedRoleLinks.length,
					membershipSummary: createRoleMembershipSummary(),
					skipped: true,
					skippedDisabledUser: true,
				};
			}

			userLink = presence.userLink ?? userLink;
		}

		if (await this.isFluxerOwnerLinkedUser(serverLink, userLink)) {
			return {
				roleLinkCount: linkedRoleLinks.length,
				membershipSummary: createRoleMembershipSummary(),
				skipped: true,
				skippedFluxerOwner: true,
			};
		}

		const snapshots = await this.fetchUserSnapshots(serverLink, userLink);

		if (!snapshots) {
			return {
				roleLinkCount: linkedRoleLinks.length,
				membershipSummary: createRoleMembershipSummary(),
				skipped: true,
			};
		}

		await this.syncNickname(
			serverLink,
			userLink,
			userLink.priority,
			snapshots,
		);
		const membershipSummary = await this.syncRoleMemberships(
			serverLink,
			userLink,
			linkedRoleLinks,
			() => userLink.priority,
			snapshots,
		);

		return {
			roleLinkCount: linkedRoleLinks.length,
			membershipSummary,
		};
	}

	async syncLinkedRoleAcrossUsers(serverLink, roleLink) {
		if (!isLinkEnabled(serverLink)) {
			return;
		}

		await this.syncRoleMetadata(serverLink, roleLink, roleLink.priority);

		const roleLinks = await this.roleLinks
			.find({
				serverLinkId: getServerLinkIdFilter(serverLink._id),
			})
			.toArray();

		const userLinks = await this.userLinks
			.find({
				serverLinkId: getServerLinkIdFilter(serverLink._id),
			})
			.toArray();

		for (const userLink of userLinks) {
			if (!isLinkEnabled(userLink)) {
				continue;
			}

			if (await this.isFluxerOwnerLinkedUser(serverLink, userLink)) {
				continue;
			}

			const snapshots = await this.fetchUserSnapshots(serverLink, userLink);
			if (!snapshots) {
				continue;
			}

			await this.syncRoleMemberships(
				serverLink,
				userLink,
				[roleLink],
				() => userLink.priority,
				snapshots,
			);
		}

		const channelLinks = await this.channelLinks
			.find({
				serverLinkId: getServerLinkIdFilter(serverLink._id),
			})
			.toArray();

		for (const channelLink of channelLinks) {
			await this.syncLinkedChannel(serverLink, channelLink, roleLinks);
		}
	}

	async syncLinkedChannel(
		serverLink,
		channelLink,
		roleLinks = null,
		sourcePlatformOverride = null,
	) {
		const result = createChannelMetadataSyncResult();
		if (!isLinkEnabled(serverLink)) {
			result.skippedDisabled += 1;
			return result;
		}

		const sourcePlatform = sourcePlatformOverride ?? channelLink.priority;
		if (!isSupportedPlatform(sourcePlatform)) {
			logger.warn("Skipped channel sync with unsupported source platform", {
				sourcePlatform,
				channelLinkId: String(channelLink._id),
			});
			result.skippedUnsupported += 1;
			return result;
		}

		const targetPlatform = getOppositePlatform(sourcePlatform);

		const sourceGuildId = getGuildIdForPlatform(serverLink, sourcePlatform);
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);

		const sourceChannelId = getChannelIdForPlatform(
			channelLink,
			sourcePlatform,
		);
		const targetChannelId = getChannelIdForPlatform(
			channelLink,
			targetPlatform,
		);

		if (!sourceChannelId || !targetChannelId) {
			logger.warn("Skipped channel sync with missing channel ID", {
				sourcePlatform,
				targetPlatform,
				sourceGuildId,
				targetGuildId,
				sourceChannelId,
				targetChannelId,
			});
			result.skippedMissingIds += 1;
			return result;
		}

		const sourceTemplate = await this.platforms[
			sourcePlatform
		].getGuildChannelTemplate(sourceGuildId, sourceChannelId);

		if (!sourceTemplate) {
			logger.warn("Source channel not found during sync", {
				sourcePlatform,
				sourceGuildId,
				sourceChannelId,
			});
			result.skippedMissingSource += 1;
			return result;
		}

		const targetTemplate = await this.platforms[
			targetPlatform
		].getGuildChannelTemplate(targetGuildId, targetChannelId);

		if (!targetTemplate) {
			logger.warn("Target channel not found during sync", {
				targetPlatform,
				targetGuildId,
				targetChannelId,
			});
			result.skippedMissingTarget += 1;
			return result;
		}

		if (sourceTemplate.kind !== targetTemplate.kind) {
			logger.warn("Skipped channel sync because channel types differ", {
				sourcePlatform,
				targetPlatform,
				sourceGuildId,
				targetGuildId,
				sourceChannelId,
				targetChannelId,
				sourceKind: sourceTemplate.kind,
				targetKind: targetTemplate.kind,
			});
			result.skippedTypeMismatch += 1;
			return result;
		}

		const linkedRoleLinks =
			roleLinks ??
			(await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
				})
				.toArray());

		const mappedParentId = await this.mapTargetParentId(
			serverLink,
			sourcePlatform,
			targetPlatform,
			sourceTemplate.parentId,
			targetTemplate.parentId,
		);

		const mappedTemplate = {
			...sourceTemplate,
			parentId: mappedParentId,
			permissionOverwrites: this.buildTargetPermissionOverwrites(
				serverLink,
				linkedRoleLinks,
				sourceTemplate,
				targetTemplate,
				sourcePlatform,
				targetPlatform,
			),
		};

		if (channelTemplatesEqual(mappedTemplate, targetTemplate)) {
			return result;
		}

		result.differences += 1;

		const canManageTarget = await this.platforms[
			targetPlatform
		].canManageChannel(targetGuildId, targetChannelId);

		if (!canManageTarget) {
			logger.warn("Target channel is not manageable", {
				targetPlatform,
				targetGuildId,
				targetChannelId,
			});
			result.skippedUnmanageable += 1;
			return result;
		}

		this.guard.mark(
			targetPlatform,
			"channel",
			targetGuildId,
			targetChannelId,
		);

		const updated = await this.platforms[
			targetPlatform
		].updateGuildChannelFromTemplate(
			targetGuildId,
			targetChannelId,
			mappedTemplate,
		);

		if (!updated) {
			result.failed += 1;
			logger.warn("Failed to update target channel", {
				targetPlatform,
				targetGuildId,
				targetChannelId,
			});
			return result;
		}

		result.changed += 1;
		return result;
	}

	async mapTargetParentId(
		serverLink,
		sourcePlatform,
		targetPlatform,
		sourceParentId,
		targetParentId,
	) {
		if (!sourceParentId) {
			return null;
		}

		const sourceField = getChannelFieldForPlatform(sourcePlatform);
		const targetField = getChannelFieldForPlatform(targetPlatform);
		const parentLink = await this.channelLinks.findOne({
			serverLinkId: getServerLinkIdFilter(serverLink._id),
			[sourceField]: sourceParentId,
		});

		return parentLink?.[targetField] ?? targetParentId ?? null;
	}

	buildTargetPermissionOverwrites(
		serverLink,
		roleLinks,
		sourceTemplate,
		targetTemplate,
		sourcePlatform,
		targetPlatform,
	) {
		const sourceGuildId = getGuildIdForPlatform(serverLink, sourcePlatform);
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);
		const sourceToTargetRoleIds = new Map();
		const controlledTargetRoleIds = new Set([targetGuildId]);

		for (const roleLink of roleLinks) {
			const sourceRoleId = getRoleIdForPlatform(roleLink, sourcePlatform);
			const targetRoleId = getRoleIdForPlatform(roleLink, targetPlatform);

			if (!sourceRoleId || !targetRoleId) {
				continue;
			}

			sourceToTargetRoleIds.set(sourceRoleId, targetRoleId);
			controlledTargetRoleIds.add(targetRoleId);
		}

		const mappedSourceOverwrites = [];
		for (const overwrite of normalizePermissionOverwrites(
			sourceTemplate.permissionOverwrites,
		)) {
			if (overwrite.type !== "role") {
				continue;
			}

			const targetRoleId =
				overwrite.id === sourceGuildId
					? targetGuildId
					: sourceToTargetRoleIds.get(overwrite.id);

			if (!targetRoleId) {
				continue;
			}

			mappedSourceOverwrites.push({
				...overwrite,
				id: targetRoleId,
				type: "role",
			});
		}

		const preservedTargetOverwrites = normalizePermissionOverwrites(
			targetTemplate.permissionOverwrites,
		).filter((overwrite) => {
			if (overwrite.type !== "role") {
				return true;
			}

			return !controlledTargetRoleIds.has(overwrite.id);
		});

		return normalizePermissionOverwrites([
			...preservedTargetOverwrites,
			...mappedSourceOverwrites,
		]);
	}

	async handleLiveRoleUpdate(event) {
		try {
			if (
				this.guard.shouldSkip(
					event.platform,
					"role",
					event.guildId,
					event.roleId,
				)
			) {
				return;
			}

			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}
			if (!isLinkEnabled(serverLink)) {
				return;
			}

			const roleField =
				event.platform === "discord" ? "discordRoleId" : "fluxerRoleId";

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
					[roleField]: event.roleId,
				})
				.toArray();

			for (const roleLink of roleLinks) {
				await this.syncRoleMetadata(
					serverLink,
					roleLink,
					event.platform,
				);
			}
		} catch (error) {
			logger.error("Live role sync failed", {
				platform: event.platform,
				guildId: event.guildId,
				roleId: event.roleId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleLiveChannelUpdate(event) {
		try {
			if (
				this.guard.shouldSkip(
					event.platform,
					"channel",
					event.guildId,
					event.channelId,
				)
			) {
				return;
			}

			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}
			if (!isLinkEnabled(serverLink)) {
				return;
			}

			const channelField = getChannelFieldForPlatform(event.platform);
			const channelLinks = await this.channelLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
					[channelField]: event.channelId,
				})
				.toArray();

			if (channelLinks.length === 0) {
				return;
			}

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
				})
				.toArray();

			for (const channelLink of channelLinks) {
				await this.syncLinkedChannel(
					serverLink,
					channelLink,
					roleLinks,
					event.platform,
				);
			}
		} catch (error) {
			logger.error("Live channel sync failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async handleLiveMemberUpdate(event) {
		try {
			if (
				this.guard.shouldSkip(
					event.platform,
					"member",
					event.guildId,
					event.userId,
				)
			) {
				return;
			}

			const serverLink = await this.findServerLink(
				event.platform,
				event.guildId,
			);
			if (!serverLink) {
				return;
			}
			if (!isLinkEnabled(serverLink)) {
				return;
			}

			const userField =
				event.platform === "discord" ? "discordUserId" : "fluxerUserId";

			const userLinks = await this.userLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
					[userField]: event.userId,
				})
				.toArray();

			if (userLinks.length === 0) {
				return;
			}

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
				})
				.toArray();

			for (let userLink of userLinks) {
				if (!isLinkEnabled(userLink)) {
					const presence =
						await this.lifecycleService?.refreshUserLinkPresence(
							serverLink,
							userLink,
							{ reason: "member_update_presence_check" },
						);

					if (!presence?.enabled) {
						continue;
					}

					userLink = presence.userLink ?? userLink;
				}

				if (await this.isFluxerOwnerLinkedUser(serverLink, userLink)) {
					continue;
				}

				const snapshots = await this.fetchUserSnapshots(
					serverLink,
					userLink,
				);

				if (!snapshots) {
					continue;
				}

				const sourceEventSnapshot = normalizeMemberSnapshot(
					event.snapshot,
				);
				if (sourceEventSnapshot) {
					snapshots[event.platform] = {
						...snapshots[event.platform],
						userId:
							sourceEventSnapshot.userId ??
							snapshots[event.platform].userId,
						roleIds: sourceEventSnapshot.roleIds,
					};
				}

				await this.syncNickname(
					serverLink,
					userLink,
					event.platform,
					snapshots,
				);
				await this.syncRoleMemberships(
					serverLink,
					userLink,
					roleLinks,
					() => event.platform,
					snapshots,
				);
			}
		} catch (error) {
			logger.error("Live member sync failed", {
				platform: event.platform,
				guildId: event.guildId,
				userId: event.userId,
				error: error.message,
				stack: error.stack,
			});
		}
	}

	async syncRoleMetadata(serverLink, roleLink, sourcePlatform) {
		const result = createRoleMetadataSyncResult();
		if (!isLinkEnabled(serverLink)) {
			result.skippedDisabled += 1;
			return result;
		}

		if (!isSupportedPlatform(sourcePlatform)) {
			logger.warn("Skipped role sync with unsupported source platform", {
				sourcePlatform,
				roleLinkId: String(roleLink._id),
			});
			result.skippedUnsupported += 1;
			return result;
		}

		const targetPlatform = getOppositePlatform(sourcePlatform);

		const sourceGuildId = getGuildIdForPlatform(serverLink, sourcePlatform);
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);

		const sourceRoleId = getRoleIdForPlatform(roleLink, sourcePlatform);
		const targetRoleId = getRoleIdForPlatform(roleLink, targetPlatform);

		const sourceTemplate = await this.platforms[
			sourcePlatform
		].getGuildRoleTemplate(sourceGuildId, sourceRoleId);

		if (!sourceTemplate) {
			logger.warn("Source role not found during sync", {
				sourcePlatform,
				sourceGuildId,
				sourceRoleId,
			});
			result.skippedMissingSource += 1;
			return result;
		}

		const targetTemplate = await this.platforms[
			targetPlatform
		].getGuildRoleTemplate(targetGuildId, targetRoleId);

		if (!targetTemplate) {
			logger.warn("Target role not found during sync", {
				targetPlatform,
				targetGuildId,
				targetRoleId,
			});
			result.skippedMissingTarget += 1;
			return result;
		}

		if (roleTemplatesEqual(sourceTemplate, targetTemplate)) {
			return result;
		}

		result.differences += 1;

		const canManageTarget = await this.platforms[
			targetPlatform
		].canManageRole(targetGuildId, targetRoleId);

		if (!canManageTarget) {
			logger.warn("Target role is not manageable", {
				targetPlatform,
				targetGuildId,
				targetRoleId,
			});
			result.skippedUnmanageable += 1;
			return result;
		}

		this.guard.mark(targetPlatform, "role", targetGuildId, targetRoleId);

		const updated = await this.platforms[
			targetPlatform
		].updateGuildRoleFromTemplate(
			targetGuildId,
			targetRoleId,
			sourceTemplate,
		);

		if (!updated) {
			result.failed += 1;
			logger.warn("Failed to update target role", {
				targetPlatform,
				targetGuildId,
				targetRoleId,
			});
			return result;
		}

		result.changed += 1;
		return result;
	}

	async syncNickname(serverLink, userLink, sourcePlatform, snapshots) {
		const targetPlatform = getOppositePlatform(sourcePlatform);

		const sourceGuildId = getGuildIdForPlatform(serverLink, sourcePlatform);
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);

		const sourceUserId = getUserIdForPlatform(userLink, sourcePlatform);
		const targetUserId = getUserIdForPlatform(userLink, targetPlatform);

		const sourceSnapshot = snapshots[sourcePlatform];
		const targetSnapshot = snapshots[targetPlatform];

		if (!sourceSnapshot || !targetSnapshot) {
			return;
		}

		const sourceNick = normalizeNick(sourceSnapshot.nick);
		const targetNick = normalizeNick(targetSnapshot.nick);

		if (sourceNick === targetNick) {
			return;
		}

		const canManageTarget = await this.platforms[
			targetPlatform
		].canManageMember(targetGuildId, targetUserId);

		if (!canManageTarget) {
			logger.warn("Target member is not manageable for nickname sync", {
				targetPlatform,
				targetGuildId,
				targetUserId,
				sourceGuildId,
				sourceUserId,
			});
			return;
		}

		this.guard.mark(targetPlatform, "member", targetGuildId, targetUserId);

		const updated = await this.platforms[targetPlatform].setMemberNickname(
			targetGuildId,
			targetUserId,
			sourceNick,
		);

		if (!updated) {
			logger.warn("Failed to update target nickname", {
				targetPlatform,
				targetGuildId,
				targetUserId,
			});
			return;
		}

		targetSnapshot.nick = sourceNick;
	}

	async syncRoleMemberships(
		serverLink,
		userLink,
		roleLinks,
		sourcePlatformResolver,
		snapshots,
	) {
		const discordSnapshot = snapshots.discord;
		const fluxerSnapshot = snapshots.fluxer;
		const summary = createRoleMembershipSummary();

		if (!discordSnapshot || !fluxerSnapshot) {
			return summary;
		}

		for (const roleLink of roleLinks) {
			summary.checked += 1;

			const sourcePlatform = sourcePlatformResolver(roleLink);
			const targetPlatform = getOppositePlatform(sourcePlatform);

			const sourceGuildId = getGuildIdForPlatform(
				serverLink,
				sourcePlatform,
			);
			const targetGuildId = getGuildIdForPlatform(
				serverLink,
				targetPlatform,
			);

			const sourceUserId = getUserIdForPlatform(userLink, sourcePlatform);
			const targetUserId = getUserIdForPlatform(userLink, targetPlatform);

			const sourceRoleId = getRoleIdForPlatform(roleLink, sourcePlatform);
			const targetRoleId = getRoleIdForPlatform(roleLink, targetPlatform);

			const sourceSnapshot = snapshots[sourcePlatform];
			const targetSnapshot = snapshots[targetPlatform];

			if (!sourceSnapshot || !targetSnapshot) {
				continue;
			}

			const sourceHasRole = sourceSnapshot.roleIds.has(sourceRoleId);
			const targetHasRole = targetSnapshot.roleIds.has(targetRoleId);

			if (sourceHasRole === targetHasRole) {
				continue;
			}

			summary.differences += 1;

			const targetCanManageRole = await this.platforms[
				targetPlatform
			].canManageRole(targetGuildId, targetRoleId);

			if (!targetCanManageRole) {
				summary.skippedUnmanageableRoles += 1;
				logger.warn("Target role is not manageable for membership sync", {
					sourcePlatform,
					targetPlatform,
					sourceGuildId,
					targetGuildId,
					sourceUserId,
					targetUserId,
					sourceRoleId,
					targetRoleId,
					action: sourceHasRole ? "add" : "remove",
				});
				continue;
			}

			this.guard.mark(
				targetPlatform,
				"member",
				targetGuildId,
				targetUserId,
			);

			let changed = false;

			if (sourceHasRole) {
				changed = await this.platforms[targetPlatform].addMemberRole(
					targetGuildId,
					targetUserId,
					targetRoleId,
				);

				if (changed) {
					targetSnapshot.roleIds.add(targetRoleId);
					summary.changed += 1;
				}
			} else {
				changed = await this.platforms[targetPlatform].removeMemberRole(
					targetGuildId,
					targetUserId,
					targetRoleId,
				);

				if (changed) {
					targetSnapshot.roleIds.delete(targetRoleId);
					summary.changed += 1;
				}
			}

			if (!changed) {
				summary.failed += 1;
				logger.warn("Failed to sync linked role membership", {
					sourcePlatform,
					targetPlatform,
					sourceGuildId,
					targetGuildId,
					sourceUserId,
					targetUserId,
					sourceRoleId,
					targetRoleId,
				});
			}
		}

		return summary;
	}

	async fetchUserSnapshots(serverLink, userLink) {
		const [discordSnapshot, fluxerSnapshot] = await Promise.all([
			this.platforms.discord.getGuildMemberSnapshot(
				serverLink.discordGuildId,
				userLink.discordUserId,
			),
			this.platforms.fluxer.getGuildMemberSnapshot(
				serverLink.fluxerGuildId,
				userLink.fluxerUserId,
			),
		]);

		if (!discordSnapshot || !fluxerSnapshot) {
			const missingPlatform = !discordSnapshot
				? "discord"
				: !fluxerSnapshot
					? "fluxer"
					: null;

			await this.lifecycleService?.markUserLinkDisabled(userLink, {
				platform: missingPlatform,
				reason: "member_snapshot_missing",
			});

			logger.warn("User snapshot fetch failed during sync", {
				discordGuildId: serverLink.discordGuildId,
				fluxerGuildId: serverLink.fluxerGuildId,
				discordUserId: userLink.discordUserId,
				fluxerUserId: userLink.fluxerUserId,
			});

			return null;
		}

		if (!isLinkEnabled(userLink)) {
			await this.lifecycleService?.markUserLinkEnabled(userLink, {
				reason: "member_snapshot_present",
			});
		}

		return {
			discord: discordSnapshot,
			fluxer: fluxerSnapshot,
		};
	}

	async isFluxerOwnerLinkedUser(serverLink, userLink) {
		const isOwner = await this.platforms.fluxer.isGuildOwner(
			serverLink.fluxerGuildId,
			userLink.fluxerUserId,
		);

		if (isOwner) {
			logger.warn("Skipped linked user sync because Fluxer owner cannot be synchronized", {
				serverLinkId: String(serverLink._id),
				discordGuildId: serverLink.discordGuildId,
				fluxerGuildId: serverLink.fluxerGuildId,
				discordUserId: userLink.discordUserId,
				fluxerUserId: userLink.fluxerUserId,
			});
		}

		return isOwner;
	}

	async findServerLink(platform, guildId) {
		const fieldName =
			platform === "discord" ? "discordGuildId" : "fluxerGuildId";
		return this.serverLinks.findOne({ [fieldName]: guildId });
	}
}
