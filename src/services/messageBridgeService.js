// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "../core/logger.js";
import {
	getServerLinkIdFilter,
	isLinkEnabled,
} from "./linkLifecycleService.js";
import {
	sanitizeMongoObjectId,
	sanitizePlatformId,
} from "../utils/sanitize.js";
import { downloadRemoteFile } from "./messageBridge/attachments.js";
import { normalizeEmbedsForBridge } from "./messageBridge/embeds.js";
import {
	escapeMarkdown,
	getWebhookAvatarUrl,
	getWebhookUsername,
} from "./messageBridge/identity.js";
import {
	buildDiscordAllowedMentions,
	buildFluxerAllowedMentions,
	extractIds,
	unique,
} from "./messageBridge/mentions.js";
import {
	getChannelIdForPlatform,
	getChannelIdFromMessageLink,
	getGuildIdForPlatform,
	getMessageIdForPlatform,
	getOppositePlatform,
	getWebhookCredentials,
	getWebhookIdFieldName,
	getWebhookTokenFieldName,
	isManagedWebhookMessage,
} from "./messageBridge/platform.js";
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
			const sourceChannelId = sanitizePlatformId(event.channelId);
			const sourceMessageId = sanitizePlatformId(event.messageId);
			if (!event.guildId || !sourceChannelId || !sourceMessageId) {
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
				[sourceChannelField]: { $eq: sourceChannelId },
			});
			if (!channelLink) {
				return;
			}
			if (isManagedWebhookMessage(channelLink, event)) {
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
			const serverLinkId = sanitizeMongoObjectId(
				channelLink.serverLinkId,
			);
			if (!serverLinkId) {
				return;
			}
			const serverLink = await this.serverLinks.findOne({
				_id: { $eq: serverLinkId },
			});
			if (!isLinkEnabled(serverLink)) {
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
			const outgoing = await this.attachTargetWebhook(
				serverLink,
				channelLink,
				targetPlatform,
				targetChannelId,
				transformed,
			);
			let sentMessage = await this.platforms[
				targetPlatform
			].sendGuildMessage(targetChannelId, outgoing);
			if (!sentMessage?.id && outgoing.files?.length) {
				const contentWithAttachmentUrls = [
					outgoing.content,
					"",
					...outgoing.files
						.map((file) => file.originalUrl)
						.filter(Boolean),
				].join("\n");
				const fallbackContentWithAttachmentUrls = [
					outgoing.fallbackContent ?? outgoing.content,
					"",
					...outgoing.files
						.map((file) => file.originalUrl)
						.filter(Boolean),
				].join("\n");
				sentMessage = await this.platforms[
					targetPlatform
				].sendGuildMessage(targetChannelId, {
					...outgoing,
					content: contentWithAttachmentUrls,
					fallbackContent: fallbackContentWithAttachmentUrls,
					files: [],
				});
			}
			if (!sentMessage?.id) {
				logger.warn("Failed to mirror message", {
					sourcePlatform,
					targetPlatform,
					sourceChannelId,
					targetChannelId,
					sourceMessageId,
				});
				return;
			}
			await this.storeMessageLink({
				serverLinkId: serverLink._id,
				discordChannelId: channelLink.discordChannelId,
				fluxerChannelId: channelLink.fluxerChannelId,
				sourcePlatform,
				sourceMessageId,
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
			const targetPlatform = getOppositePlatform(event.platform);
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
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
				{ includeReference: true, includeFiles: false },
			);
			if (!transformed) {
				return;
			}
			const channelLink =
				await this.findChannelLinkForMessageLink(messageLink);
			const outgoing = this.attachExistingWebhook(
				channelLink,
				targetPlatform,
				transformed,
			);
			const edited = await this.platforms[
				targetPlatform
			].editGuildMessage(targetChannelId, targetMessageId, outgoing);
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
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
			const targetChannelId = getChannelIdFromMessageLink(
				messageLink,
				targetPlatform,
			);
			const targetMessageId = getMessageIdForPlatform(
				messageLink,
				targetPlatform,
			);
			const channelLink =
				await this.findChannelLinkForMessageLink(messageLink);
			await this.platforms[targetPlatform].deleteGuildMessage(
				targetChannelId,
				targetMessageId,
				{
					webhook: getWebhookCredentials(
						channelLink,
						targetPlatform,
					),
				},
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
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
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
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
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
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
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
			const serverLink = await this.getEnabledServerLink(
				messageLink.serverLinkId,
			);
			if (!serverLink) {
				return;
			}
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
			...bodyLines,
		].join("\n");
		const fallbackContent = [
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
			fallbackContent,
			embeds,
			files,
			webhookIdentity: {
				username: getWebhookUsername(event.displayName),
				avatarUrl: getWebhookAvatarUrl(event.avatarUrl),
			},
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
		const serverLinkIdFilter = getServerLinkIdFilter(serverLinkId);
		if (!serverLinkIdFilter) {
			return { channelLinks: [], roleLinks: [], userLinks: [] };
		}
		const [channelLinks, roleLinks, userLinks] = await Promise.all([
			this.channelLinks.find({ serverLinkId: serverLinkIdFilter }).toArray(),
			this.roleLinks.find({ serverLinkId: serverLinkIdFilter }).toArray(),
			this.userLinks.find({ serverLinkId: serverLinkIdFilter }).toArray(),
		]);
		return {
			channelLinks,
			roleLinks,
			userLinks: userLinks.filter(isLinkEnabled),
		};
	}
	async attachTargetWebhook(
		serverLink,
		channelLink,
		targetPlatform,
		targetChannelId,
		payload,
	) {
		const targetGuildId = getGuildIdForPlatform(serverLink, targetPlatform);
		const webhook = await this.platforms[
			targetPlatform
		].ensureGuildChannelWebhook(
			targetGuildId,
			targetChannelId,
			getWebhookCredentials(channelLink, targetPlatform),
		);
		if (!webhook?.id || !webhook?.token) {
			return payload;
		}

		await this.storeChannelWebhookCredentials(
			channelLink,
			targetPlatform,
			webhook,
		);
		return { ...payload, webhook };
	}
	attachExistingWebhook(channelLink, targetPlatform, payload) {
		const webhook = getWebhookCredentials(channelLink, targetPlatform);
		return webhook ? { ...payload, webhook } : payload;
	}
	async storeChannelWebhookCredentials(channelLink, platform, webhook) {
		if (!channelLink?._id || !webhook?.id || !webhook?.token) {
			return;
		}
		const webhookIdField = getWebhookIdFieldName(platform);
		const webhookTokenField = getWebhookTokenFieldName(platform);
		if (
			channelLink[webhookIdField] === webhook.id &&
			channelLink[webhookTokenField] === webhook.token
		) {
			return;
		}

		await this.channelLinks.updateOne(
			{ _id: channelLink._id },
			{
				$set: {
					[webhookIdField]: webhook.id,
					[webhookTokenField]: webhook.token,
				},
			},
		);
		channelLink[webhookIdField] = webhook.id;
		channelLink[webhookTokenField] = webhook.token;
	}
	async findChannelLinkForMessageLink(messageLink) {
		const serverLinkIdFilter = getServerLinkIdFilter(
			messageLink?.serverLinkId,
		);
		if (
			!serverLinkIdFilter ||
			!messageLink?.discordChannelId ||
			!messageLink?.fluxerChannelId
		) {
			return null;
		}
		return this.channelLinks.findOne({
			serverLinkId: serverLinkIdFilter,
			discordChannelId: { $eq: messageLink.discordChannelId },
			fluxerChannelId: { $eq: messageLink.fluxerChannelId },
		});
	}
	async getEnabledServerLink(serverLinkId) {
		const sanitizedServerLinkId = sanitizeMongoObjectId(serverLinkId);
		if (!sanitizedServerLinkId) {
			return null;
		}
		const serverLink = await this.serverLinks.findOne({
			_id: { $eq: sanitizedServerLinkId },
		});
		return isLinkEnabled(serverLink) ? serverLink : null;
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
		const serverLinkIdFilter = getServerLinkIdFilter(serverLinkId);
		const sanitizedSourceMessageId =
			sanitizePlatformId(sourceMessageId);
		if (!serverLinkIdFilter || !sanitizedSourceMessageId) {
			return null;
		}
		const sourceField =
			sourcePlatform === "discord"
				? "discordMessageId"
				: "fluxerMessageId";
		return this.messageLinks.findOne({
			serverLinkId: serverLinkIdFilter,
			[sourceField]: { $eq: sanitizedSourceMessageId },
		});
	}
	async findMessageLink(platform, messageId) {
		const sanitizedMessageId = sanitizePlatformId(messageId);
		if (!sanitizedMessageId) {
			return null;
		}
		const fieldName =
			platform === "discord" ? "discordMessageId" : "fluxerMessageId";
		return this.messageLinks.findOne({
			[fieldName]: { $eq: sanitizedMessageId },
		});
	}
	async storeMessageLink({
		serverLinkId,
		discordChannelId,
		fluxerChannelId,
		sourcePlatform,
		sourceMessageId,
		targetMessageId,
	}) {
		const sanitizedServerLinkId = sanitizeMongoObjectId(serverLinkId);
		const sanitizedDiscordChannelId =
			sanitizePlatformId(discordChannelId);
		const sanitizedFluxerChannelId = sanitizePlatformId(fluxerChannelId);
		const sanitizedSourceMessageId =
			sanitizePlatformId(sourceMessageId);
		const sanitizedTargetMessageId =
			sanitizePlatformId(targetMessageId);
		if (
			!sanitizedServerLinkId ||
			!sanitizedDiscordChannelId ||
			!sanitizedFluxerChannelId ||
			!sanitizedSourceMessageId ||
			!sanitizedTargetMessageId ||
			(sourcePlatform !== "discord" && sourcePlatform !== "fluxer")
		) {
			logger.warn("Skipped storing unsafe message link", {
				serverLinkId: String(serverLinkId),
				sourcePlatform,
				sourceMessageId,
				targetMessageId,
			});
			return;
		}
		const document = {
			serverLinkId: sanitizedServerLinkId,
			discordChannelId: sanitizedDiscordChannelId,
			fluxerChannelId: sanitizedFluxerChannelId,
			sourcePlatform,
			createdAt: new Date(),
		};
		if (sourcePlatform === "discord") {
			document.discordMessageId = sanitizedSourceMessageId;
			document.fluxerMessageId = sanitizedTargetMessageId;
		} else {
			document.fluxerMessageId = sanitizedSourceMessageId;
			document.discordMessageId = sanitizedTargetMessageId;
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
