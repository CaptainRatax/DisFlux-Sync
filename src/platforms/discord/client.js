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
	OverwriteType,
	Partials,
	PermissionsBitField,
	REST,
	Routes,
	WebhookClient,
} from "discord.js";
import { logger } from "../../core/logger.js";
import {
	buildDiscordSlashCommands,
	getDiscordSlashCommandArgs,
} from "./slashCommands.js";
const BRIDGE_WEBHOOK_NAME = "DisFlux Sync Bridge";

function getUserDisplayName(user, member) {
	return (
		member?.displayName ??
		user?.globalName ??
		user?.username ??
		"Unknown User"
	);
}
function getUserAvatarUrl(user, member) {
	return (
		member?.displayAvatarURL?.({ extension: "png", size: 128 }) ??
		user?.displayAvatarURL?.({ extension: "png", size: 128 }) ??
		null
	);
}
function getInteractionDisplayName(interaction) {
	return (
		interaction.member?.displayName ??
		interaction.member?.nick ??
		getUserDisplayName(interaction.user, interaction.member)
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
function getDiscordMessageLink(messageReference) {
	if (!messageReference?.messageId) {
		return null;
	}
	if (!messageReference.guildId || !messageReference.channelId) {
		return null;
	}
	return `https://discord.com/channels/${messageReference.guildId}/${messageReference.channelId}/${messageReference.messageId}`;
}
function getReplyFallbackLine(payload) {
	const messageLink = getDiscordMessageLink(payload.messageReference);
	if (messageLink) {
		return `Replying to: ${messageLink}`;
	}
	if (payload.messageReference?.messageId) {
		return `Replying to bridged message: ${payload.messageReference.messageId}`;
	}
	return null;
}
function getMessageContent(
	payload,
	{ useFallbackContent = false, includeReferenceFallback = false } = {},
) {
	const content = useFallbackContent
		? payload.fallbackContent ?? payload.content ?? ""
		: payload.content ?? "";
	const replyFallback = includeReferenceFallback
		? getReplyFallbackLine(payload)
		: null;
	if (!replyFallback) {
		return content;
	}
	if (!String(content).trim()) {
		return replyFallback;
	}
	return [replyFallback, content].join("\n");
}
function getEditMessageContent(payload, useFallbackContent = false) {
	if (useFallbackContent) {
		return payload.fallbackContent ?? payload.content ?? "";
	}
	return payload.content ?? "";
}
function buildDiscordMessagePayload(
	payload,
	{
		useFallbackContent = false,
		includeFiles = true,
		includeReference = true,
		includeReferenceFallback = false,
		includeWebhookIdentity = false,
	} = {},
) {
	const messagePayload = {
		content: getMessageContent(payload, {
			useFallbackContent,
			includeReferenceFallback,
		}),
		allowedMentions: payload.allowedMentions ?? undefined,
		embeds: payload.embeds ?? undefined,
		files:
			includeFiles && payload.files?.length
				? payload.files.map((file) => ({
						attachment: file.buffer,
						name: file.name,
						description: file.description ?? undefined,
					}))
				: undefined,
	};

	if (includeReference && payload.messageReference?.messageId) {
		messagePayload.reply = {
			messageReference: payload.messageReference.messageId,
			failIfNotExists: false,
		};
	}

	if (includeWebhookIdentity) {
		messagePayload.username =
			payload.webhookIdentity?.username ?? undefined;
		messagePayload.avatarURL =
			payload.webhookIdentity?.avatarUrl ?? undefined;
	}

	return messagePayload;
}
function getWebhookCredentials(webhook) {
	if (!webhook?.id || !webhook?.token) {
		return null;
	}
	return {
		id: String(webhook.id),
		token: String(webhook.token),
	};
}
function buildMemberSnapshot(member) {
	const roleIds = new Set(
		[...member.roles.cache.keys()].filter(
			(roleId) => roleId !== member.guild.id,
		),
	);

	return {
		userId: member.id,
		nick: member.nickname ?? null,
		roleIds,
	};
}
function normalizePermissionOverwriteType(type) {
	return type === "member" || type === OverwriteType.Member
		? OverwriteType.Member
		: OverwriteType.Role;
}
function buildChannelPermissionOverwrites(channel) {
	return [...channel.permissionOverwrites.cache.values()].map(
		(overwrite) => ({
			id: overwrite.id,
			type:
				overwrite.type === OverwriteType.Member ? "member" : "role",
			allow: overwrite.allow.bitfield.toString(),
			deny: overwrite.deny.bitfield.toString(),
		}),
	);
}
function buildDiscordPermissionOverwrites(overwrites = []) {
	return overwrites.map((overwrite) => ({
		id: overwrite.id,
		type: normalizePermissionOverwriteType(overwrite.type),
		allow: new PermissionsBitField(BigInt(overwrite.allow ?? "0")),
		deny: new PermissionsBitField(BigInt(overwrite.deny ?? "0")),
	}));
}
function setDefined(target, key, value) {
	if (value !== undefined) {
		target[key] = value;
	}
}
function buildDiscordRoleColors(primaryColor) {
	return {
		primaryColor: primaryColor ?? 0,
		secondaryColor: null,
		tertiaryColor: null,
	};
}
function isChannelManageable(channel) {
	try {
		return Boolean(channel?.manageable);
	} catch {
		return false;
	}
}
export class DiscordPlatform extends EventEmitter {
	constructor({ token, clientId }) {
		super();
		this.token = token;
		this.clientId = clientId;
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
		await this.registerSlashCommands();
		await this.client.login(this.token);
	}
	async registerSlashCommands() {
		const commands = buildDiscordSlashCommands();
		const rest = new REST({ version: "10" }).setToken(this.token);

		try {
			await rest.put(Routes.applicationCommands(this.clientId), {
				body: commands,
			});
			logger.info("Discord slash commands registered", {
				commandCount: commands.length,
			});
		} catch (error) {
			logger.error("Failed to register Discord slash commands", {
				error: error.message,
			});
		}
	}
	registerCoreEvents() {
		this.client.once(Events.ClientReady, (client) => {
			logger.info("Discord client ready", {
				userId: client.user.id,
				tag: client.user.tag,
			});
		});
		this.client.on(Events.GuildCreate, async (guild) => {
			this.emit("guildAvailable", {
				platform: "discord",
				guildId: guild.id,
			});
		});
		this.client.on(Events.GuildDelete, async (guild) => {
			this.emit("guildUnavailable", {
				platform: "discord",
				guildId: guild.id,
				unavailable: guild.available === false,
			});
		});
		this.client.on(Events.InteractionCreate, async (interaction) => {
			if (!interaction.isChatInputCommand()) {
				return;
			}
			if (!interaction.inGuild()) {
				await interaction
					.reply({
						content:
							"This command can only be used inside a server.",
						ephemeral: true,
					})
					.catch(() => {});
				return;
			}
			try {
				await interaction.deferReply({
					ephemeral: interaction.commandName === "link-me",
				});
			} catch (error) {
				logger.warn("Failed to defer Discord slash command", {
					commandName: interaction.commandName,
					guildId: interaction.guildId,
					userId: interaction.user?.id,
					error: error.message,
				});
				return;
			}
			this.emit(
				"slashCommand",
				this.buildSlashCommandEventPayload(interaction),
			);
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
		this.client.on(Events.GuildRoleDelete, async (role) => {
			this.emit("roleDelete", {
				platform: "discord",
				guildId: role.guild.id,
				roleId: role.id,
			});
		});
		this.client.on(Events.ChannelUpdate, async (_oldChannel, newChannel) => {
			if (!newChannel?.guildId) {
				return;
			}
			if (
				!(await this.isSupportedGuildChannelType(newChannel).catch(
					() => false,
				))
			) {
				return;
			}
			this.emit("channelUpdate", {
				platform: "discord",
				guildId: newChannel.guildId,
				channelId: newChannel.id,
			});
		});
		this.client.on(Events.ChannelDelete, async (channel) => {
			if (!channel?.guildId) {
				return;
			}
			this.emit("channelDelete", {
				platform: "discord",
				guildId: channel.guildId,
				channelId: channel.id,
			});
		});
		this.client.on(Events.GuildMemberAdd, async (member) => {
			const payload = {
				platform: "discord",
				guildId: member.guild.id,
				userId: member.id,
				snapshot: buildMemberSnapshot(member),
			};
			this.emit("memberJoin", payload);
			this.emit("memberUpdate", payload);
		});
		this.client.on(Events.GuildMemberRemove, async (member) => {
			this.emit("memberLeave", {
				platform: "discord",
				guildId: member.guild.id,
				userId: member.id,
			});
		});
		this.client.on(
			Events.GuildMemberUpdate,
			async (_oldMember, newMember) => {
				this.emit("memberUpdate", {
					platform: "discord",
					guildId: newMember.guild.id,
					userId: newMember.id,
					snapshot: buildMemberSnapshot(newMember),
				});
			},
		);
		this.client.on(Events.Error, (error) => {
			logger.error("Discord client error", { error: error.message });
		});
	}
	buildSlashCommandEventPayload(interaction) {
		const selfUserId = this.client.user?.id ?? null;
		return {
			platform: "discord",
			guildId: interaction.guildId,
			channelId: interaction.channelId,
			userId: interaction.user.id,
			messageId: interaction.id,
			commandName: interaction.commandName,
			args: getDiscordSlashCommandArgs(interaction),
			content: `/${interaction.commandName}`,
			displayName: getInteractionDisplayName(interaction),
			avatarUrl: getUserAvatarUrl(interaction.user, interaction.member),
			referenceMessageId: null,
			mentionUserIds: [],
			mentionRoleIds: [],
			mentionChannelIds: [],
			mentionEveryone: false,
			userMentionLabels: {},
			embeds: [],
			attachments: [],
			attachmentsCount: 0,
			isBotAuthor: false,
			isWebhookMessage: false,
			webhookId: null,
			isSelfMessage: Boolean(
				selfUserId && interaction.user?.id === selfUserId,
			),
			reply: async (payload) => {
				const normalized = normalizeReplyPayload(payload);
				const responsePayload = {
					content: normalized.content ?? "",
					embeds: normalized.embeds ?? undefined,
					allowedMentions: normalized.allowedMentions ?? undefined,
				};

				if (interaction.deferred || interaction.replied) {
					await interaction.editReply(responsePayload);
					return;
				}

				await interaction.reply(responsePayload);
			},
		};
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
			avatarUrl: getUserAvatarUrl(message.author, message.member),
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
			webhookId: message.webhookId ?? null,
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
			deleteMessage: async () =>
				this.deleteGuildMessage(message.channelId, message.id),
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
	async fetchGuildChannels(guildId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return [];
		}
		try {
			const channels = await guild.channels.fetch();
			return [...channels.values()].filter(Boolean);
		} catch {
			return [];
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
				rateLimitPerUser: channel.rateLimitPerUser ?? 0,
				permissionOverwrites:
					buildChannelPermissionOverwrites(channel),
			};
		}
		if (channel.type === ChannelType.GuildVoice) {
			return {
				kind: "voice",
				name: channel.name,
				bitrate: channel.bitrate ?? null,
				userLimit: channel.userLimit ?? 0,
				parentId: channel.parentId ?? null,
				permissionOverwrites:
					buildChannelPermissionOverwrites(channel),
			};
		}
		if (channel.type === ChannelType.GuildCategory) {
			return {
				kind: "category",
				name: channel.name,
				parentId: null,
				permissionOverwrites:
					buildChannelPermissionOverwrites(channel),
			};
		}
		return null;
	}
	async createGuildChannelFromTemplate(guildId, template) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		try {
			const permissionOverwrites = buildDiscordPermissionOverwrites(
				template.permissionOverwrites ?? [],
			);

			if (template.kind === "text") {
				const options = {
					name: template.name,
					type: ChannelType.GuildText,
					topic: template.topic ?? undefined,
					nsfw: template.nsfw ?? false,
					parent: template.parentId ?? undefined,
					rateLimitPerUser: template.rateLimitPerUser ?? 0,
				};
				setDefined(
					options,
					"permissionOverwrites",
					permissionOverwrites.length > 0
						? permissionOverwrites
						: undefined,
				);
				return await guild.channels.create(options);
			}
			if (template.kind === "voice") {
				const options = {
					name: template.name,
					type: ChannelType.GuildVoice,
					bitrate: template.bitrate ?? undefined,
					userLimit: template.userLimit ?? 0,
					parent: template.parentId ?? undefined,
				};
				setDefined(
					options,
					"permissionOverwrites",
					permissionOverwrites.length > 0
						? permissionOverwrites
						: undefined,
				);
				return await guild.channels.create(options);
			}
			if (template.kind === "category") {
				const options = {
					name: template.name,
					type: ChannelType.GuildCategory,
				};
				setDefined(
					options,
					"permissionOverwrites",
					permissionOverwrites.length > 0
						? permissionOverwrites
						: undefined,
				);
				return await guild.channels.create(options);
			}
			return null;
		} catch {
			return null;
		}
	}
	async updateGuildChannelFromTemplate(guildId, channelId, template) {
		const channel = await this.fetchGuildChannel(guildId, channelId);
		if (!isChannelManageable(channel)) {
			return null;
		}
		try {
			const options = {
				name: template.name,
				permissionOverwrites: buildDiscordPermissionOverwrites(
					template.permissionOverwrites ?? [],
				),
			};

			setDefined(options, "parent", template.parentId);

			if (template.kind === "text") {
				setDefined(options, "topic", template.topic ?? null);
				setDefined(options, "nsfw", template.nsfw ?? false);
				setDefined(
					options,
					"rateLimitPerUser",
					template.rateLimitPerUser ?? 0,
				);
			}

			if (template.kind === "voice") {
				setDefined(options, "bitrate", template.bitrate ?? undefined);
				setDefined(options, "userLimit", template.userLimit ?? 0);
			}

			return await channel.edit(options);
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
			color: role.colors?.primaryColor ?? 0,
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
				colors: buildDiscordRoleColors(template.color),
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
				colors: buildDiscordRoleColors(template.color),
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
	async canManageChannel(guildId, channelId) {
		const channel = await this.fetchGuildChannel(guildId, channelId);
		return isChannelManageable(channel);
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
		return buildMemberSnapshot(member);
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
		if (!member || !role || !role.editable) {
			return false;
		}
		try {
			await member.roles.add(roleId);
			return true;
		} catch (error) {
			logger.warn("Failed to add Discord member role", {
				guildId,
				userId,
				roleId,
				error: error.message,
			});
			return false;
		}
	}
	async removeMemberRole(guildId, userId, roleId) {
		const member = await this.fetchGuildMember(guildId, userId);
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!member || !role || !role.editable) {
			return false;
		}
		try {
			await member.roles.remove(roleId);
			return true;
		} catch (error) {
			logger.warn("Failed to remove Discord member role", {
				guildId,
				userId,
				roleId,
				error: error.message,
			});
			return false;
		}
	}
	async sendGuildMessage(channelId, payload) {
		if (payload.webhook?.id && payload.webhook?.token) {
			const webhookMessage = await this.sendGuildWebhookMessage(
				channelId,
				payload,
			);
			if (webhookMessage) {
				return webhookMessage;
			}
		}

		try {
			const channel = await this.client.channels.fetch(channelId);
			if (!channel || !channel.isTextBased()) {
				return null;
			}
			const messagePayload = buildDiscordMessagePayload(payload, {
				useFallbackContent: true,
			});
			return await channel.send(messagePayload);
		} catch {
			return null;
		}
	}
	async sendGuildWebhookMessage(channelId, payload) {
		try {
			const webhook = new WebhookClient({
				id: payload.webhook.id,
				token: payload.webhook.token,
			});
			const sent = await webhook.send(
				buildDiscordMessagePayload(payload, {
					includeReference: false,
					includeReferenceFallback: true,
					includeWebhookIdentity: true,
				}),
			);
			return sent?.id ? { ...sent, id: sent.id } : null;
		} catch {
			return null;
		}
	}
	async sendDirectMessage(userId, payload) {
		try {
			const user = await this.client.users.fetch(userId);
			if (!user) {
				return false;
			}
			const normalized = normalizeReplyPayload(payload);
			await user.send({
				content: normalized.content ?? "",
				embeds: normalized.embeds ?? undefined,
				allowedMentions: normalized.allowedMentions ?? undefined,
			});
			return true;
		} catch {
			return false;
		}
	}
	async editGuildMessage(channelId, messageId, payload) {
		if (payload.webhook?.id && payload.webhook?.token) {
			try {
				const webhook = new WebhookClient({
					id: payload.webhook.id,
					token: payload.webhook.token,
				});
				const edited = await webhook.editMessage(
					messageId,
					buildDiscordMessagePayload(payload, {
						includeFiles: false,
						includeReference: false,
						includeReferenceFallback: true,
					}),
				);
				if (edited) {
					return edited;
				}
			} catch {}
		}

		const message = await this.fetchGuildMessage(channelId, messageId);
		if (!message || !message.editable) {
			return null;
		}
		try {
			return await message.edit({
				content: getEditMessageContent(payload, true),
				allowedMentions: payload.allowedMentions ?? undefined,
				embeds: payload.embeds ?? undefined,
			});
		} catch {
			return null;
		}
	}
	async deleteGuildMessage(channelId, messageId, options = {}) {
		if (options.webhook?.id && options.webhook?.token) {
			try {
				const webhook = new WebhookClient({
					id: options.webhook.id,
					token: options.webhook.token,
				});
				await webhook.deleteMessage(messageId);
				return true;
			} catch {}
		}

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
	async deleteGuildChannelWebhook(webhookCredentials) {
		if (!webhookCredentials?.id || !webhookCredentials?.token) {
			return false;
		}

		try {
			const webhook = new WebhookClient({
				id: webhookCredentials.id,
				token: webhookCredentials.token,
			});
			await webhook.delete("DisFlux Sync channel link removed");
			return true;
		} catch {
			return false;
		}
	}
	async ensureGuildChannelWebhook(guildId, channelId, existing = null) {
		const existingCredentials =
			await this.fetchExistingGuildChannelWebhook(
				channelId,
				existing,
			);
		if (existingCredentials) {
			return existingCredentials;
		}

		const channel = await this.fetchGuildChannel(guildId, channelId);
		if (
			!channel ||
			channel.guildId !== guildId ||
			!channel.isTextBased() ||
			typeof channel.createWebhook !== "function"
		) {
			return null;
		}

		const reusableCredentials =
			await this.fetchReusableGuildChannelWebhook(channel);
		if (reusableCredentials) {
			return reusableCredentials;
		}

		try {
			const webhook = await channel.createWebhook({
				name: BRIDGE_WEBHOOK_NAME,
				reason: "DisFlux Sync message bridge impersonation",
			});
			return getWebhookCredentials(webhook);
		} catch {
			return null;
		}
	}
	async fetchReusableGuildChannelWebhook(channel) {
		if (typeof channel.fetchWebhooks !== "function") {
			return null;
		}

		try {
			const selfUserId = this.client.user?.id ?? null;
			const webhooks = await channel.fetchWebhooks();
			const webhook = webhooks.find((candidate) => {
				if (
					candidate?.name !== BRIDGE_WEBHOOK_NAME ||
					!candidate?.token
				) {
					return false;
				}
				if (
					selfUserId &&
					candidate.owner?.id &&
					candidate.owner.id !== selfUserId
				) {
					return false;
				}
				return true;
			});
			return getWebhookCredentials(webhook);
		} catch {
			return null;
		}
	}
	async fetchExistingGuildChannelWebhook(channelId, existing = null) {
		if (!existing?.id || !existing?.token) {
			return null;
		}

		try {
			const webhook = await this.client.fetchWebhook(
				existing.id,
				existing.token,
			);
			if (webhook?.channelId !== channelId) {
				return null;
			}
			return getWebhookCredentials(webhook);
		} catch {
			return null;
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
