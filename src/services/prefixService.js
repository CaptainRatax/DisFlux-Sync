// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { sanitizePlatformId } from "../utils/sanitize.js";
import {
	formatInlineCode,
	normalizeBotPrefix,
	resolveBotPrefix,
} from "../utils/prefix.js";

function getGuildFieldName(platform) {
	if (platform === "discord") {
		return "discordGuildId";
	}
	if (platform === "fluxer") {
		return "fluxerGuildId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export class PrefixService {
	constructor({ mongo, platforms, defaultPrefix }) {
		this.serverLinks = mongo.collection("server_links");
		this.platforms = platforms;
		this.defaultPrefix = resolveBotPrefix(defaultPrefix);
		this.cache = new Map();
		this.cacheTtlMs = 60 * 1000;
	}

	async getPrefixForContext(context) {
		const platform = context.platform;
		const guildId = sanitizePlatformId(context.guildId);
		if (!guildId) {
			return this.defaultPrefix;
		}

		const cacheKey = this.getCacheKey(platform, guildId);
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.prefix;
		}

		const serverLink = await this.getServerLinkForContext(
			platform,
			guildId,
		);
		if (!serverLink) {
			this.setCachedPrefix(platform, guildId, this.defaultPrefix);
			return this.defaultPrefix;
		}

		const prefix = resolveBotPrefix(serverLink.prefix, this.defaultPrefix);
		this.cacheServerLinkPrefix(serverLink, prefix);
		return prefix;
	}

	async handleSetPrefix(context, prefixRaw) {
		if (!context.guildId) {
			await context.reply(
				"This command can only be used inside a server.",
			);
			return;
		}

		const prefix = normalizeBotPrefix(prefixRaw);
		if (!prefix) {
			await context.reply(
				`Usage: ${formatInlineCode(`${context.botPrefix ?? this.defaultPrefix}set-prefix <prefix>`)}\nThe prefix must be exactly one visible character.`,
			);
			return;
		}

		const guildId = sanitizePlatformId(context.guildId);
		const userId = sanitizePlatformId(context.userId);
		if (!guildId || !userId) {
			await context.reply("That server or user ID is invalid.");
			return;
		}

		const serverLink = await this.getServerLinkForContext(
			context.platform,
			guildId,
		);
		if (!serverLink) {
			await context.reply(
				"This server is not linked yet. Complete the setup first before changing the shared prefix.",
			);
			return;
		}

		const userIsAdmin = await this.platforms[
			context.platform
		].userHasAdministrator(guildId, userId);
		if (!userIsAdmin) {
			await context.reply(
				"Only server administrators can use this command.",
			);
			return;
		}

		await this.serverLinks.updateOne(
			{ _id: serverLink._id },
			{
				$set: {
					prefix,
					prefixUpdatedAt: new Date(),
					prefixUpdatedByPlatform: context.platform,
					prefixUpdatedByUserId: userId,
				},
			},
		);

		this.cacheServerLinkPrefix(serverLink, prefix);
		context.botPrefix = prefix;

		await context.reply(
			[
				"Prefix updated successfully.",
				`New prefix: ${formatInlineCode(prefix)}`,
				"This prefix now applies to the linked Discord and Fluxer servers.",
			].join("\n"),
		);
	}

	async getServerLinkForContext(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		const sanitizedGuildId = sanitizePlatformId(guildId);
		if (!sanitizedGuildId) {
			return null;
		}
		return this.serverLinks.findOne({
			[fieldName]: { $eq: sanitizedGuildId },
		});
	}

	cacheServerLinkPrefix(serverLink, prefix) {
		const resolvedPrefix = resolveBotPrefix(prefix, this.defaultPrefix);
		if (serverLink.discordGuildId) {
			this.setCachedPrefix(
				"discord",
				serverLink.discordGuildId,
				resolvedPrefix,
			);
		}
		if (serverLink.fluxerGuildId) {
			this.setCachedPrefix(
				"fluxer",
				serverLink.fluxerGuildId,
				resolvedPrefix,
			);
		}
	}

	setCachedPrefix(platform, guildId, prefix) {
		const sanitizedGuildId = sanitizePlatformId(guildId);
		if (!sanitizedGuildId) {
			return;
		}
		this.cache.set(this.getCacheKey(platform, sanitizedGuildId), {
			prefix: resolveBotPrefix(prefix, this.defaultPrefix),
			expiresAt: Date.now() + this.cacheTtlMs,
		});
	}

	getCacheKey(platform, guildId) {
		return `${platform}:${guildId}`;
	}
}
