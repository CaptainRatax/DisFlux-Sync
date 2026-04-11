// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
import { OperationGuard } from "../core/operationGuard.js";
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
		const serverLinkIdFilter = getServerLinkIdFilter(serverLink._id);

		const roleLinks = await this.roleLinks
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

		for (const userLink of userLinks) {
			await this.syncLinkedUser(serverLink, userLink, roleLinks);
		}
	}

	async syncLinkedUser(serverLink, userLink, roleLinks = null) {
		const linkedRoleLinks =
			roleLinks ??
			(await this.roleLinks
				.find({
					serverLinkId: getServerLinkIdFilter(serverLink._id),
				})
				.toArray());

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
		await this.syncRoleMetadata(serverLink, roleLink, roleLink.priority);

		const userLinks = await this.userLinks
			.find({
				serverLinkId: getServerLinkIdFilter(serverLink._id),
			})
			.toArray();

		for (const userLink of userLinks) {
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

			for (const userLink of userLinks) {
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
