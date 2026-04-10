// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
import { OperationGuard } from "../core/operationGuard.js";

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

function normalizeNick(value) {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

export class SyncService {
	constructor({ mongo, platforms }) {
		this.serverLinks = mongo.collection("server_links");
		this.roleLinks = mongo.collection("role_links");
		this.userLinks = mongo.collection("user_links");
		this.platforms = platforms;
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

		this.platforms.discord.on("memberUpdate", async (event) => {
			await this.handleLiveMemberUpdate(event);
		});

		this.platforms.fluxer.on("memberUpdate", async (event) => {
			await this.handleLiveMemberUpdate(event);
		});
	}

	async reconcileAll() {
		const serverLinks = await this.serverLinks.find({}).toArray();

		for (const serverLink of serverLinks) {
			await this.reconcileServerLink(serverLink);
		}

		logger.info("Initial reconciliation finished", {
			serverLinkCount: serverLinks.length,
		});
	}

	async reconcileServerLink(serverLink) {
		const roleLinks = await this.roleLinks
			.find({
				serverLinkId: serverLink._id,
			})
			.toArray();

		const userLinks = await this.userLinks
			.find({
				serverLinkId: serverLink._id,
			})
			.toArray();

		for (const roleLink of roleLinks) {
			await this.syncRoleMetadata(
				serverLink,
				roleLink,
				roleLink.priority,
			);
		}

		for (const userLink of userLinks) {
			const snapshots = await this.fetchUserSnapshots(
				serverLink,
				userLink,
			);

			if (!snapshots) {
				continue;
			}

			await this.syncNickname(
				serverLink,
				userLink,
				userLink.priority,
				snapshots,
			);
			await this.syncRoleMemberships(
				serverLink,
				userLink,
				roleLinks,
				(roleLink) => roleLink.priority,
				snapshots,
			);
		}
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

			const roleField =
				event.platform === "discord" ? "discordRoleId" : "fluxerRoleId";

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: serverLink._id,
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

			const userField =
				event.platform === "discord" ? "discordUserId" : "fluxerUserId";

			const userLinks = await this.userLinks
				.find({
					serverLinkId: serverLink._id,
					[userField]: event.userId,
				})
				.toArray();

			if (userLinks.length === 0) {
				return;
			}

			const roleLinks = await this.roleLinks
				.find({
					serverLinkId: serverLink._id,
				})
				.toArray();

			for (const userLink of userLinks) {
				const snapshots = await this.fetchUserSnapshots(
					serverLink,
					userLink,
				);

				if (!snapshots) {
					continue;
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
			return;
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
			return;
		}

		if (roleTemplatesEqual(sourceTemplate, targetTemplate)) {
			return;
		}

		const canManageTarget = await this.platforms[
			targetPlatform
		].canManageRole(targetGuildId, targetRoleId);

		if (!canManageTarget) {
			logger.warn("Target role is not manageable", {
				targetPlatform,
				targetGuildId,
				targetRoleId,
			});
			return;
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
			logger.warn("Failed to update target role", {
				targetPlatform,
				targetGuildId,
				targetRoleId,
			});
		}
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

		if (!discordSnapshot || !fluxerSnapshot) {
			return;
		}

		const manageableCache = new Map();

		for (const roleLink of roleLinks) {
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

			if (
				!sourceSnapshot.roleIds.has(sourceRoleId) &&
				!targetSnapshot.roleIds.has(targetRoleId)
			) {
				continue;
			}

			const targetCanManageRole = await this.platforms[
				targetPlatform
			].canManageRole(targetGuildId, targetRoleId);

			if (!targetCanManageRole) {
				continue;
			}

			const manageableKey = `${targetPlatform}:${targetGuildId}:${targetUserId}`;
			let targetCanManageMember = manageableCache.get(manageableKey);

			if (targetCanManageMember === undefined) {
				targetCanManageMember = await this.platforms[
					targetPlatform
				].canManageMember(targetGuildId, targetUserId);

				manageableCache.set(manageableKey, targetCanManageMember);
			}

			if (!targetCanManageMember) {
				continue;
			}

			const sourceHasRole = sourceSnapshot.roleIds.has(sourceRoleId);
			const targetHasRole = targetSnapshot.roleIds.has(targetRoleId);

			if (sourceHasRole === targetHasRole) {
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
				}
			} else {
				changed = await this.platforms[targetPlatform].removeMemberRole(
					targetGuildId,
					targetUserId,
					targetRoleId,
				);

				if (changed) {
					targetSnapshot.roleIds.delete(targetRoleId);
				}
			}

			if (!changed) {
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
	}

	async fetchUserSnapshots(serverLink, userLink) {
		const discordSnapshot =
			await this.platforms.discord.getGuildMemberSnapshot(
				serverLink.discordGuildId,
				userLink.discordUserId,
			);

		const fluxerSnapshot =
			await this.platforms.fluxer.getGuildMemberSnapshot(
				serverLink.fluxerGuildId,
				userLink.fluxerUserId,
			);

		if (!discordSnapshot || !fluxerSnapshot) {
			logger.warn("User snapshot fetch failed during sync", {
				discordGuildId: serverLink.discordGuildId,
				fluxerGuildId: serverLink.fluxerGuildId,
				discordUserId: userLink.discordUserId,
				fluxerUserId: userLink.fluxerUserId,
			});

			return null;
		}

		return {
			discord: discordSnapshot,
			fluxer: fluxerSnapshot,
		};
	}

	async findServerLink(platform, guildId) {
		const fieldName =
			platform === "discord" ? "discordGuildId" : "fluxerGuildId";
		return this.serverLinks.findOne({ [fieldName]: guildId });
	}
}
