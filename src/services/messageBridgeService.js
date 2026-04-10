// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
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
function getChannelIdFromMessageLink(messageLink, platform) {
	return platform === "discord"
		? messageLink.discordChannelId
		: messageLink.fluxerChannelId;
}
function getMessageIdForPlatform(messageLink, platform) {
	return platform === "discord"
		? messageLink.discordMessageId
		: messageLink.fluxerMessageId;
}
function escapeMarkdown(value) {
	return String(value ?? "").replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");
}
function unique(values) {
	return [...new Set(values.filter(Boolean))];
}
function extractIds(regex, text) {
	const ids = new Set();
	for (const match of String(text ?? "").matchAll(regex)) {
		if (match[1]) {
			ids.add(match[1]);
		}
	}
	return [...ids];
}
function buildDiscordAllowedMentions({ userIds, roleIds, mentionEveryone }) {
	return {
		repliedUser: false,
		parse: mentionEveryone ? ["everyone"] : [],
		users: unique(userIds),
		roles: unique(roleIds),
	};
}
function buildFluxerAllowedMentions({ userIds, roleIds, mentionEveryone }) {
	const uniqueUserIds = unique(userIds);
	const uniqueRoleIds = unique(roleIds);
	if (
		mentionEveryone &&
		uniqueUserIds.length === 0 &&
		uniqueRoleIds.length === 0
	) {
		return { replied_user: false, parse: ["everyone"] };
	}
	return {
		replied_user: false,
		...(uniqueUserIds.length > 0 ? { users: uniqueUserIds } : {}),
		...(uniqueRoleIds.length > 0 ? { roles: uniqueRoleIds } : {}),
	};
}
function normalizeEmbedField(field) {
	if (!field?.name && !field?.value) {
		return null;
	}
	return {
		name: String(field.name ?? ""),
		value: String(field.value ?? ""),
		inline: Boolean(field.inline),
	};
}
function normalizeEmbedAuthor(author) {
	if (!author?.name) {
		return null;
	}
	return {
		name: String(author.name),
		...(author.url ? { url: author.url } : {}),
		...(author.icon_url ? { icon_url: author.icon_url } : {}),
		...(author.iconURL ? { icon_url: author.iconURL } : {}),
	};
}
function normalizeEmbedFooter(footer) {
	if (!footer?.text) {
		return null;
	}
	return {
		text: String(footer.text),
		...(footer.icon_url ? { icon_url: footer.icon_url } : {}),
		...(footer.iconURL ? { icon_url: footer.iconURL } : {}),
	};
}
function normalizeEmbedMedia(media) {
	if (!media?.url) {
		return null;
	}
	return { url: media.url };
}
function normalizeEmbedsForBridge(embeds = []) {
	const result = [];
	for (const embed of embeds) {
		const normalized = {
			...(embed.title ? { title: String(embed.title) } : {}),
			...(embed.description
				? { description: String(embed.description) }
				: {}),
			...(embed.url ? { url: embed.url } : {}),
			...(typeof embed.color === "number" ? { color: embed.color } : {}),
			...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
		};
		const author = normalizeEmbedAuthor(embed.author);
		if (author) {
			normalized.author = author;
		}
		const footer = normalizeEmbedFooter(embed.footer);
		if (footer) {
			normalized.footer = footer;
		}
		const image = normalizeEmbedMedia(embed.image);
		if (image) {
			normalized.image = image;
		}
		const thumbnail = normalizeEmbedMedia(embed.thumbnail);
		if (thumbnail) {
			normalized.thumbnail = thumbnail;
		}
		const fields = (embed.fields ?? [])
			.map(normalizeEmbedField)
			.filter(Boolean);
		if (fields.length > 0) {
			normalized.fields = fields;
		}
		if (Object.keys(normalized).length > 0) {
			result.push(normalized);
		}
	}
	return result.slice(0, 10);
}
async function downloadRemoteFile(file) {
	if (!file?.url) {
		return null;
	}
	const response = await fetch(file.url);
	if (!response.ok) {
		return null;
	}
	const arrayBuffer = await response.arrayBuffer();
	return {
		name: file.filename ?? "file",
		description: file.description ?? null,
		contentType:
			file.contentType ??
			response.headers.get("content-type") ??
			"application/octet-stream",
		buffer: Buffer.from(arrayBuffer),
		originalUrl: file.url,
	};
}
export class MessageBridgeService {
	constructor({ mongo, platforms }) {
		this.serverLinks = mongo.collection("server_links");
		this.channelLinks = mongo.collection("channel_links");
		this.userLinks = mongo.collection("user_links");
		this.roleLinks = mongo.collection("role_links");
		this.messageLinks = mongo.collection("message_links");
		this.platforms = platforms;
	}
	async start() {
		this.bindEvents();
	}
	bindEvents() {
		this.platforms.discord.on("message", async (event) => {
			await this.handleIncomingMessageCreate(event);
		});
		this.platforms.fluxer.on("message", async (event) => {
			await this.handleIncomingMessageCreate(event);
		});
		this.platforms.discord.on("messageUpdate", async (event) => {
			await this.handleIncomingMessageUpdate(event);
		});
		this.platforms.fluxer.on("messageUpdate", async (event) => {
			await this.handleIncomingMessageUpdate(event);
		});
		this.platforms.discord.on("messageDelete", async (event) => {
			await this.handleIncomingMessageDelete(event);
		});
		this.platforms.fluxer.on("messageDelete", async (event) => {
			await this.handleIncomingMessageDelete(event);
		});
		this.platforms.discord.on("messageReactionAdd", async (event) => {
			await this.handleIncomingReactionAdd(event);
		});
		this.platforms.fluxer.on("messageReactionAdd", async (event) => {
			await this.handleIncomingReactionAdd(event);
		});
		this.platforms.discord.on("messageReactionRemove", async (event) => {
			await this.handleIncomingReactionRemove(event);
		});
		this.platforms.fluxer.on("messageReactionRemove", async (event) => {
			await this.handleIncomingReactionRemove(event);
		});
		this.platforms.discord.on("messageReactionRemoveAll", async (event) => {
			await this.handleIncomingReactionRemoveAll(event);
		});
		this.platforms.fluxer.on("messageReactionRemoveAll", async (event) => {
			await this.handleIncomingReactionRemoveAll(event);
		});
		this.platforms.discord.on(
			"messageReactionRemoveEmoji",
			async (event) => {
				await this.handleIncomingReactionRemoveEmoji(event);
			},
		);
		this.platforms.fluxer.on(
			"messageReactionRemoveEmoji",
			async (event) => {
				await this.handleIncomingReactionRemoveEmoji(event);
			},
		);
	}
	async handleIncomingMessageCreate(event) {
		try {
			if (!event.guildId || !event.channelId || !event.messageId) {
				return;
			}
			if (event.isSelfMessage) {
				return;
			}
			const sourcePlatform = event.platform;
			const targetPlatform = getOppositePlatform(sourcePlatform);
			const sourceChannelField =
				sourcePlatform === "discord"
					? "discordChannelId"
					: "fluxerChannelId";
			const channelLink = await this.channelLinks.findOne({
				[sourceChannelField]: event.channelId,
			});
			if (!channelLink) {
				return;
			}
			if (event.isWebhookMessage && !channelLink.syncWebhookMessages) {
				return;
			}
			if (
				event.isBotAuthor &&
				!event.isWebhookMessage &&
				!channelLink.syncBotMessages
			) {
				return;
			}
			const serverLink = await this.serverLinks.findOne({
				_id: channelLink.serverLinkId,
			});
			if (!serverLink) {
				return;
			}
			const targetChannelId = getChannelIdForPlatform(
				channelLink,
				targetPlatform,
			);
			if (!targetChannelId) {
				return;
			}
			const transformed = await this.buildOutgoingPayload(
				serverLink,
				event,
				{ includeReference: true, includeFiles: true },
			);
			if (!transformed) {
				return;
			}
			let sentMessage = await this.platforms[
				targetPlatform
			].sendGuildMessage(targetChannelId, transformed);
			if (!sentMessage?.id && transformed.files?.length) {
				const fallbackContent = [
					transformed.content,
					"",
					...transformed.files
						.map((file) => file.originalUrl)
						.filter(Boolean),
				].join("\n");
				sentMessage = await this.platforms[
					targetPlatform
				].sendGuildMessage(targetChannelId, {
					...transformed,
					content: fallbackContent,
					files: [],
				});
			}
			if (!sentMessage?.id) {
				logger.warn("Failed to mirror message", {
					sourcePlatform,
					targetPlatform,
					sourceChannelId: event.channelId,
					targetChannelId,
					sourceMessageId: event.messageId,
				});
				return;
			}
			await this.storeMessageLink({
				serverLinkId: serverLink._id,
				discordChannelId: channelLink.discordChannelId,
				fluxerChannelId: channelLink.fluxerChannelId,
				sourcePlatform,
				sourceMessageId: event.messageId,
				targetMessageId: sentMessage.id,
			});
		} catch (error) {
			logger.error("Message create bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingMessageUpdate(event) {
		try {
			if (!event.messageId) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const serverLink = await this.serverLinks.findOne({
				_id: messageLink.serverLinkId,
			});
			if (!serverLink) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			const transformed = await this.buildOutgoingPayload(
				serverLink,
				event,
				{ includeReference: false, includeFiles: false },
			);
			if (!transformed) {
				return;
			}
			const edited = await this.platforms[
				targetPlatform
			].editGuildMessage(targetChannelId, targetMessageId, transformed);
			if (!edited) {
				logger.warn("Failed to mirror message edit", {
					sourcePlatform: event.platform,
					targetPlatform,
					sourceMessageId: event.messageId,
					targetMessageId,
				});
			}
		} catch (error) {
			logger.error("Message update bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingMessageDelete(event) {
		try {
			if (!event.messageId) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			await this.platforms[targetPlatform].deleteGuildMessage(
				targetChannelId,
				targetMessageId,
			);
			await this.messageLinks.deleteOne({ _id: messageLink._id });
		} catch (error) {
			logger.error("Message delete bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingReactionAdd(event) {
		try {
			if (!event.messageId || !event.emoji) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			await this.platforms[targetPlatform].addReactionToMessage(
				targetChannelId,
				targetMessageId,
				event.emoji,
			);
		} catch (error) {
			logger.error("Reaction add bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				emoji: event.emoji,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingReactionRemove(event) {
		try {
			if (!event.messageId || !event.emoji) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			await this.platforms[targetPlatform].removeOwnReactionFromMessage(
				targetChannelId,
				targetMessageId,
				event.emoji,
			);
		} catch (error) {
			logger.error("Reaction remove bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				emoji: event.emoji,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingReactionRemoveAll(event) {
		try {
			if (!event.messageId) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			await this.platforms[targetPlatform].removeAllReactionsFromMessage(
				targetChannelId,
				targetMessageId,
			);
		} catch (error) {
			logger.error("Reaction remove all bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async handleIncomingReactionRemoveEmoji(event) {
		try {
			if (!event.messageId || !event.emoji) {
				return;
			}
			const messageLink = await this.findMessageLink(
				event.platform,
				event.messageId,
			);
			if (
				!messageLink ||
				!messageLink.sourcePlatform ||
				messageLink.sourcePlatform !== event.platform
			) {
				return;
			}
			const targetPlatform = getOppositePlatform(event.platform);
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			await this.platforms[targetPlatform].removeAllReactionsWithEmoji(
				targetChannelId,
				targetMessageId,
				event.emoji,
			);
		} catch (error) {
			logger.error("Reaction remove emoji bridge failed", {
				platform: event.platform,
				guildId: event.guildId,
				channelId: event.channelId,
				messageId: event.messageId,
				emoji: event.emoji,
				error: error.message,
				stack: error.stack,
			});
		}
	}
	async buildOutgoingPayload(serverLink, event, options = {}) {
		const includeReference = Boolean(options.includeReference);
		const includeFiles = Boolean(options.includeFiles);
		const sourcePlatform = event.platform;
		const targetPlatform = getOppositePlatform(sourcePlatform);
		const mappings = await this.loadMappings(serverLink._id);
		const userMap = new Map();
		for (const link of mappings.userLinks) {
			userMap.set(
				link[
					sourcePlatform === "discord"
						? "discordUserId"
						: "fluxerUserId"
				],
				link[
					targetPlatform === "discord"
						? "discordUserId"
						: "fluxerUserId"
				],
			);
		}
		const roleMap = new Map();
		for (const link of mappings.roleLinks) {
			roleMap.set(
				link[
					sourcePlatform === "discord"
						? "discordRoleId"
						: "fluxerRoleId"
				],
				link[
					targetPlatform === "discord"
						? "discordRoleId"
						: "fluxerRoleId"
				],
			);
		}
		const channelMap = new Map();
		for (const link of mappings.channelLinks) {
			channelMap.set(
				link[
					sourcePlatform === "discord"
						? "discordChannelId"
						: "fluxerChannelId"
				],
				link[
					targetPlatform === "discord"
						? "discordChannelId"
						: "fluxerChannelId"
				],
			);
		}
		let content = String(event.content ?? "");
		let mentionEveryone = Boolean(event.mentionEveryone);
		const mappedUserIds = [];
		const mappedRoleIds = [];
		const unmappedRoleIds = extractIds(/<@&(\d+)>/g, content).filter(
			(id) => !roleMap.has(id),
		);
		const unmappedChannelIds = extractIds(/<#(\d+)>/g, content).filter(
			(id) => !channelMap.has(id),
		);
		const roleNameFallbacks = await this.fetchRoleNameFallbacks(
			sourcePlatform,
			getGuildIdForPlatform(serverLink, sourcePlatform),
			unmappedRoleIds,
		);
		const channelNameFallbacks = await this.fetchChannelNameFallbacks(
			sourcePlatform,
			getGuildIdForPlatform(serverLink, sourcePlatform),
			unmappedChannelIds,
		);
		content = content.replace(/<@!?(\d+)>/g, (match, userId) => {
			const targetUserId = userMap.get(userId);
			if (targetUserId) {
				mappedUserIds.push(targetUserId);
				return `<@${targetUserId}>`;
			}
			const label = event.userMentionLabels?.[userId] ?? "unknown-user";
			return `@${label}`;
		});
		content = content.replace(/<@&(\d+)>/g, (match, roleId) => {
			const targetRoleId = roleMap.get(roleId);
			if (targetRoleId) {
				mappedRoleIds.push(targetRoleId);
				return `<@&${targetRoleId}>`;
			}
			return `@${roleNameFallbacks.get(roleId) ?? "unknown-role"}`;
		});
		content = content.replace(/<#(\d+)>/g, (match, sourceChannelId) => {
			const targetChannelId = channelMap.get(sourceChannelId);
			if (targetChannelId) {
				return `<#${targetChannelId}>`;
			}
			return `#${channelNameFallbacks.get(sourceChannelId) ?? "unknown-channel"}`;
		});
		if (
			targetPlatform === "fluxer" &&
			mentionEveryone &&
			(mappedUserIds.length > 0 || mappedRoleIds.length > 0)
		) {
			content = content
				.replace(/@everyone/g, "@\u200beveryone")
				.replace(/@here/g, "@\u200bhere");
			mentionEveryone = false;
		}
		const embeds = normalizeEmbedsForBridge(event.embeds ?? []);
		const files = includeFiles
			? (
					await Promise.all(
						(event.attachments ?? []).map(downloadRemoteFile),
					)
				).filter(Boolean)
			: [];
		const bodyLines = [];
		if (content.trim()) {
			bodyLines.push(content.trim());
		}
		if (
			bodyLines.length === 0 &&
			embeds.length === 0 &&
			files.length === 0
		) {
			bodyLines.push("[Unsupported message content]");
		}
		const finalContent = [
			`**${escapeMarkdown(event.displayName ?? "Unknown User")}**`,
			...bodyLines,
		].join("\n");
		let reference = null;
		if (includeReference) {
			reference = await this.resolveReplyReference(
				serverLink._id,
				sourcePlatform,
				event.referenceMessageId,
			);
		}
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);
		return {
			content: finalContent,
			embeds,
			files,
			messageReference: reference
				? {
						messageId: getMessageIdForPlatform(
							reference,
							targetPlatform,
						),
						channelId: getChannelIdFromMessageLink(
							reference,
							targetPlatform,
						),
						guildId: targetGuildId,
					}
				: null,
			allowedMentions:
				targetPlatform === "discord"
					? buildDiscordAllowedMentions({
							userIds: mappedUserIds,
							roleIds: mappedRoleIds,
							mentionEveryone,
						})
					: buildFluxerAllowedMentions({
							userIds: mappedUserIds,
							roleIds: mappedRoleIds,
							mentionEveryone,
						}),
		};
	}
	async loadMappings(serverLinkId) {
		const [channelLinks, roleLinks, userLinks] = await Promise.all([
			this.channelLinks.find({ serverLinkId }).toArray(),
			this.roleLinks.find({ serverLinkId }).toArray(),
			this.userLinks.find({ serverLinkId }).toArray(),
		]);
		return { channelLinks, roleLinks, userLinks };
	}
	async fetchRoleNameFallbacks(platform, guildId, roleIds) {
		const result = new Map();
		for (const roleId of unique(roleIds)) {
			const role = await this.platforms[platform].fetchGuildRole(
				guildId,
				roleId,
			);
			if (role?.name) {
				result.set(roleId, role.name);
			}
		}
		return result;
	}
	async fetchChannelNameFallbacks(platform, guildId, channelIds) {
		const result = new Map();
		for (const channelId of unique(channelIds)) {
			const channel = await this.platforms[platform].fetchGuildChannel(
				guildId,
				channelId,
			);
			if (channel?.name) {
				result.set(channelId, channel.name);
			}
		}
		return result;
	}
	async resolveReplyReference(serverLinkId, sourcePlatform, sourceMessageId) {
		if (!sourceMessageId) {
			return null;
		}
		const sourceField =
			sourcePlatform === "discord"
				? "discordMessageId"
				: "fluxerMessageId";
		return this.messageLinks.findOne({
			serverLinkId,
			[sourceField]: sourceMessageId,
		});
	}
	async findMessageLink(platform, messageId) {
		const fieldName =
			platform === "discord" ? "discordMessageId" : "fluxerMessageId";
		return this.messageLinks.findOne({ [fieldName]: messageId });
	}
	async storeMessageLink({
		serverLinkId,
		discordChannelId,
		fluxerChannelId,
		sourcePlatform,
		sourceMessageId,
		targetMessageId,
	}) {
		const document = {
			serverLinkId,
			discordChannelId,
			fluxerChannelId,
			sourcePlatform,
			createdAt: new Date(),
		};
		if (sourcePlatform === "discord") {
			document.discordMessageId = sourceMessageId;
			document.fluxerMessageId = targetMessageId;
		} else {
			document.fluxerMessageId = sourceMessageId;
			document.discordMessageId = targetMessageId;
		}
		try {
			await this.messageLinks.insertOne(document);
		} catch (error) {
			logger.warn("Failed to store message link", {
				serverLinkId: String(serverLinkId),
				sourcePlatform,
				sourceMessageId,
				targetMessageId,
				error: error.message,
			});
		}
	}
}
