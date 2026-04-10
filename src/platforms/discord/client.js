// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { EventEmitter } from "node:events";
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Partials,
	PermissionsBitField,
} from "discord.js";
import { logger } from "../../core/logger.js";
function getUserDisplayName(user, member) {
	return (
		member?.displayName ??
		user?.globalName ??
		user?.username ??
		"Unknown User"
	);
}
function getUnicodeEmojiFromReaction(reaction) {
	if (!reaction?.emoji) {
		return null;
	}
	if (reaction.emoji.id) {
		return null;
	}
	return reaction.emoji.name ?? null;
}
function mapDiscordEmbeds(message) {
	return message.embeds.map((embed) => embed.toJSON());
}
function mapDiscordAttachments(message) {
	return [...message.attachments.values()].map((attachment) => ({
		url: attachment.url,
		filename: attachment.name ?? "file",
		contentType: attachment.contentType ?? "application/octet-stream",
		description: attachment.description ?? null,
		size: attachment.size ?? 0,
	}));
}
function normalizeReplyPayload(payload) {
	if (typeof payload === "string") {
		return { content: payload };
	}
	return payload ?? {};
}
export class DiscordPlatform extends EventEmitter {
	constructor(token) {
		super();
		this.token = token;
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.MessageContent,
			],
			partials: [Partials.Channel, Partials.Message, Partials.Reaction],
		});
	}
	async start() {
		this.registerCoreEvents();
		await this.client.login(this.token);
	}
	registerCoreEvents() {
		this.client.once(Events.ClientReady, (client) => {
			logger.info("Discord client ready", {
				userId: client.user.id,
				tag: client.user.tag,
			});
		});
		this.client.on(Events.MessageCreate, async (message) => {
			if (!message.inGuild()) {
				return;
			}
			if (message.system) {
				return;
			}
			this.emit("message", this.buildMessageEventPayload(message));
		});
		this.client.on(
			Events.MessageUpdate,
			async (_oldMessage, newMessage) => {
				const message = newMessage.partial
					? await newMessage.fetch().catch(() => null)
					: newMessage;
				if (!message?.inGuild()) {
					return;
				}
				if (message.system) {
					return;
				}
				this.emit(
					"messageUpdate",
					this.buildMessageEventPayload(message),
				);
			},
		);
		this.client.on(Events.MessageDelete, async (message) => {
			this.emit("messageDelete", {
				platform: "discord",
				guildId: message.guildId ?? null,
				channelId: message.channelId ?? null,
				messageId: message.id,
			});
		});
		this.client.on(Events.MessageBulkDelete, async (messages, channel) => {
			for (const message of messages.values()) {
				this.emit("messageDelete", {
					platform: "discord",
					guildId: message.guildId ?? channel.guildId ?? null,
					channelId: message.channelId ?? channel.id,
					messageId: message.id,
				});
			}
		});
		this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
			if (user.bot && user.id === this.client.user?.id) {
				return;
			}
			const hydratedReaction = reaction.partial
				? await reaction.fetch().catch(() => null)
				: reaction;
			const message = hydratedReaction?.message;
			if (!message?.inGuild()) {
				return;
			}
			const emoji = getUnicodeEmojiFromReaction(hydratedReaction);
			if (!emoji) {
				return;
			}
			this.emit("messageReactionAdd", {
				platform: "discord",
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id,
				userId: user.id,
				emoji,
			});
		});
		this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
			if (user.bot && user.id === this.client.user?.id) {
				return;
			}
			const hydratedReaction = reaction.partial
				? await reaction.fetch().catch(() => null)
				: reaction;
			const message = hydratedReaction?.message;
			if (!message?.inGuild()) {
				return;
			}
			const emoji = getUnicodeEmojiFromReaction(hydratedReaction);
			if (!emoji) {
				return;
			}
			this.emit("messageReactionRemove", {
				platform: "discord",
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id,
				userId: user.id,
				emoji,
			});
		});
		this.client.on(Events.MessageReactionRemoveAll, async (message) => {
			const hydratedMessage = message.partial
				? await message.fetch().catch(() => null)
				: message;
			if (!hydratedMessage?.inGuild()) {
				return;
			}
			this.emit("messageReactionRemoveAll", {
				platform: "discord",
				guildId: hydratedMessage.guildId,
				channelId: hydratedMessage.channelId,
				messageId: hydratedMessage.id,
			});
		});
		this.client.on(Events.MessageReactionRemoveEmoji, async (reaction) => {
			const hydratedReaction = reaction.partial
				? await reaction.fetch().catch(() => null)
				: reaction;
			const message = hydratedReaction?.message;
			if (!message?.inGuild()) {
				return;
			}
			const emoji = getUnicodeEmojiFromReaction(hydratedReaction);
			if (!emoji) {
				return;
			}
			this.emit("messageReactionRemoveEmoji", {
				platform: "discord",
				guildId: message.guildId,
				channelId: message.channelId,
				messageId: message.id,
				emoji,
			});
		});
		this.client.on(Events.GuildRoleUpdate, async (_oldRole, newRole) => {
			this.emit("roleUpdate", {
				platform: "discord",
				guildId: newRole.guild.id,
				roleId: newRole.id,
			});
		});
		this.client.on(
			Events.GuildMemberUpdate,
			async (_oldMember, newMember) => {
				this.emit("memberUpdate", {
					platform: "discord",
					guildId: newMember.guild.id,
					userId: newMember.id,
				});
			},
		);
		this.client.on(Events.Error, (error) => {
			logger.error("Discord client error", { error: error.message });
		});
	}
	buildMessageEventPayload(message) {
		const userMentionLabels = {};
		for (const [userId, user] of message.mentions.users) {
			const member = message.mentions.members?.get(userId) ?? null;
			userMentionLabels[userId] = getUserDisplayName(user, member);
		}
		const selfUserId = this.client.user?.id ?? null;
		return {
			platform: "discord",
			guildId: message.guildId,
			channelId: message.channelId,
			userId: message.author.id,
			messageId: message.id,
			content: message.content ?? "",
			displayName: getUserDisplayName(message.author, message.member),
			referenceMessageId: message.reference?.messageId ?? null,
			mentionUserIds: [...message.mentions.users.keys()],
			mentionRoleIds: [...message.mentions.roles.keys()],
			mentionChannelIds: [...message.mentions.channels.keys()],
			mentionEveryone: message.mentions.everyone,
			userMentionLabels,
			embeds: mapDiscordEmbeds(message),
			attachments: mapDiscordAttachments(message),
			attachmentsCount: message.attachments.size ?? 0,
			isBotAuthor: Boolean(message.author?.bot),
			isWebhookMessage: Boolean(message.webhookId),
			isSelfMessage: Boolean(
				selfUserId && message.author?.id === selfUserId,
			),
			reply: async (payload) => {
				const normalized = normalizeReplyPayload(payload);
				await message.reply({
					content: normalized.content ?? "",
					embeds: normalized.embeds ?? undefined,
					allowedMentions: {
						repliedUser: false,
						...(normalized.allowedMentions ?? {}),
					},
				});
			},
		};
	}
	getSelfUserId() {
		return this.client.user?.id ?? null;
	}
	async fetchGuild(guildId) {
		try {
			return await this.client.guilds.fetch(guildId);
		} catch {
			return null;
		}
	}
	async fetchGuildSummary(guildId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		return { id: guild.id, name: guild.name };
	}
	async fetchGuildChannel(guildId, channelId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			const channel = await guild.channels.fetch(channelId);
			if (!channel || channel.guildId !== guildId) {
				return null;
			}
			return channel;
		} catch {
			return null;
		}
	}
	async fetchGuildMessage(channelId, messageId) {
		try {
			const channel = await this.client.channels.fetch(channelId);
			if (
				!channel ||
				!channel.isTextBased() ||
				!("messages" in channel)
			) {
				return null;
			}
			return await channel.messages.fetch(messageId);
		} catch {
			return null;
		}
	}
	async isSupportedGuildChannelType(channel) {
		return [
			ChannelType.GuildText,
			ChannelType.GuildVoice,
			ChannelType.GuildCategory,
		].includes(channel.type);
	}
	async getGuildChannelTemplate(guildId, channelId) {
		const channel = await this.fetchGuildChannel(guildId, channelId);
		if (!channel) {
			return null;
		}
		if (channel.type === ChannelType.GuildText) {
			return {
				kind: "text",
				name: channel.name,
				topic: channel.topic ?? null,
				nsfw: channel.nsfw ?? false,
				parentId: channel.parentId ?? null,
			};
		}
		if (channel.type === ChannelType.GuildVoice) {
			return {
				kind: "voice",
				name: channel.name,
				bitrate: channel.bitrate ?? null,
				userLimit: channel.userLimit ?? 0,
				parentId: channel.parentId ?? null,
			};
		}
		if (channel.type === ChannelType.GuildCategory) {
			return { kind: "category", name: channel.name };
		}
		return null;
	}
	async createGuildChannelFromTemplate(guildId, template) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			if (template.kind === "text") {
				return await guild.channels.create({
					name: template.name,
					type: ChannelType.GuildText,
					topic: template.topic ?? undefined,
					nsfw: template.nsfw ?? false,
					parent: template.parentId ?? undefined,
				});
			}
			if (template.kind === "voice") {
				return await guild.channels.create({
					name: template.name,
					type: ChannelType.GuildVoice,
					bitrate: template.bitrate ?? undefined,
					userLimit: template.userLimit ?? 0,
					parent: template.parentId ?? undefined,
				});
			}
			if (template.kind === "category") {
				return await guild.channels.create({
					name: template.name,
					type: ChannelType.GuildCategory,
				});
			}
			return null;
		} catch {
			return null;
		}
	}
	async fetchGuildRole(guildId, roleId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			const role = await guild.roles.fetch(roleId);
			return role ?? null;
		} catch {
			return null;
		}
	}
	async getGuildRoleTemplate(guildId, roleId) {
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!role) {
			return null;
		}
		return {
			name: role.name,
			color: role.color ?? 0,
			permissions: role.permissions.bitfield.toString(),
			hoist: role.hoist ?? false,
			mentionable: role.mentionable ?? false,
		};
	}
	async createGuildRoleFromTemplate(guildId, template) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			return await guild.roles.create({
				name: template.name,
				color: template.color ?? 0,
				permissions: new PermissionsBitField(
					BigInt(template.permissions ?? "0"),
				),
				hoist: template.hoist ?? false,
				mentionable: template.mentionable ?? false,
			});
		} catch {
			return null;
		}
	}
	async updateGuildRoleFromTemplate(guildId, roleId, template) {
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!role || role.managed || !role.editable) {
			return null;
		}
		try {
			return await role.edit({
				name: template.name,
				color: template.color ?? 0,
				permissions: new PermissionsBitField(
					BigInt(template.permissions ?? "0"),
				),
				hoist: template.hoist ?? false,
				mentionable: template.mentionable ?? false,
			});
		} catch {
			return null;
		}
	}
	async canManageRole(guildId, roleId) {
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!role) {
			return false;
		}
		if (role.managed) {
			return false;
		}
		return role.editable;
	}
	async fetchGuildMember(guildId, userId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			return await guild.members.fetch(userId);
		} catch {
			return null;
		}
	}
	async getGuildMemberSnapshot(guildId, userId) {
		const member = await this.fetchGuildMember(guildId, userId);
		if (!member) {
			return null;
		}
		const roleIds = new Set(
			[...member.roles.cache.keys()].filter(
				(roleId) => roleId !== guildId,
			),
		);
		return { userId: member.id, nick: member.nickname ?? null, roleIds };
	}
	async canManageMember(guildId, userId) {
		const member = await this.fetchGuildMember(guildId, userId);
		if (!member) {
			return false;
		}
		return member.manageable;
	}
	async setMemberNickname(guildId, userId, nick) {
		const member = await this.fetchGuildMember(guildId, userId);
		if (!member || !member.manageable) {
			return false;
		}
		try {
			await member.setNickname(nick ?? null);
			return true;
		} catch {
			return false;
		}
	}
	async addMemberRole(guildId, userId, roleId) {
		const member = await this.fetchGuildMember(guildId, userId);
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!member || !role || !member.manageable || !role.editable) {
			return false;
		}
		try {
			await member.roles.add(roleId);
			return true;
		} catch {
			return false;
		}
	}
	async removeMemberRole(guildId, userId, roleId) {
		const member = await this.fetchGuildMember(guildId, userId);
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!member || !role || !member.manageable || !role.editable) {
			return false;
		}
		try {
			await member.roles.remove(roleId);
			return true;
		} catch {
			return false;
		}
	}
	async sendGuildMessage(channelId, payload) {
		try {
			const channel = await this.client.channels.fetch(channelId);
			if (!channel || !channel.isTextBased()) {
				return null;
			}
			const messagePayload = {
				content: payload.content ?? "",
				allowedMentions: payload.allowedMentions ?? undefined,
				embeds: payload.embeds ?? undefined,
				files:
					payload.files?.map((file) => ({
						attachment: file.buffer,
						name: file.name,
						description: file.description ?? undefined,
					})) ?? undefined,
			};
			if (payload.messageReference?.messageId) {
				messagePayload.reply = {
					messageReference: payload.messageReference.messageId,
					failIfNotExists: false,
				};
			}
			return await channel.send(messagePayload);
		} catch {
			return null;
		}
	}
	async editGuildMessage(channelId, messageId, payload) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message || !message.editable) {
			return null;
		}
		try {
			return await message.edit({
				content: payload.content,
				allowedMentions: payload.allowedMentions ?? undefined,
				embeds: payload.embeds ?? undefined,
			});
		} catch {
			return null;
		}
	}
	async deleteGuildMessage(channelId, messageId) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message || !message.deletable) {
			return false;
		}
		try {
			await message.delete();
			return true;
		} catch {
			return false;
		}
	}
	async addReactionToMessage(channelId, messageId, emoji) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message) {
			return false;
		}
		try {
			await message.react(emoji);
			return true;
		} catch {
			return false;
		}
	}
	async removeOwnReactionFromMessage(channelId, messageId, emoji) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message || !this.client.user?.id) {
			return false;
		}
		try {
			const reaction = message.reactions.cache.get(emoji);
			if (!reaction) {
				return true;
			}
			await reaction.users.remove(this.client.user.id);
			return true;
		} catch {
			return false;
		}
	}
	async removeAllReactionsFromMessage(channelId, messageId) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message) {
			return false;
		}
		try {
			await message.reactions.removeAll();
			return true;
		} catch {
			return false;
		}
	}
	async removeAllReactionsWithEmoji(channelId, messageId, emoji) {
		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message) {
			return false;
		}
		try {
			const reaction = message.reactions.cache.get(emoji);
			if (!reaction) {
				return true;
			}
			await reaction.remove();
			return true;
		} catch {
			return false;
		}
	}
	async userHasAdministrator(guildId, userId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return false;
		}
		if (guild.ownerId === userId) {
			return true;
		}
		try {
			const member =
				guild.members.cache.get(userId) ??
				(await guild.members.fetch(userId));
			return member.permissions.has(
				PermissionsBitField.Flags.Administrator,
			);
		} catch {
			return false;
		}
	}
	async botHasAdministrator(guildId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return false;
		}
		try {
			const me = guild.members.me ?? (await guild.members.fetchMe());
			return me.permissions.has(PermissionsBitField.Flags.Administrator);
		} catch {
			return false;
		}
	}
	stop() {
		this.client.destroy();
		logger.info("Discord client stopped");
	}
}
