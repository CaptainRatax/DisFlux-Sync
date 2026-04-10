// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { EventEmitter } from "node:events";
import { Client, GatewayDispatchEvents } from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { WebSocketManager } from "@discordjs/ws";
import { logger } from "../../core/logger.js";
const FLUXER_ADMINISTRATOR_PERMISSION = 0x8n;
function parseFluxerApiConfig(rawBase) {
	const url = new URL(rawBase);
	const segments = url.pathname.split("/").filter(Boolean);
	let version = "1";
	if (segments.length > 0) {
		const lastSegment = segments[segments.length - 1];
		if (/^v\d+$/i.test(lastSegment)) {
			version = lastSegment.slice(1);
			segments.pop();
		}
	}
	const apiBase =
		segments.length > 0
			? `${url.origin}/${segments.join("/")}`
			: url.origin;
	return { apiBase, version };
}
function extractMemberRoleIds(member) {
	return member?.roles ?? member?.role_ids ?? [];
}
function extractMemberUserId(member) {
	return member?.user?.id ?? member?.user_id ?? member?.id ?? null;
}
function getUserDisplayName(author, member = null) {
	return (
		member?.nick ??
		author?.global_name ??
		author?.username ??
		"Unknown User"
	);
}
function getUnicodeEmojiFromFluxerPayload(emoji) {
	if (!emoji) {
		return null;
	}
	if (emoji.id) {
		return null;
	}
	return emoji.name ?? null;
}
function normalizeFluxerAttachments(attachments = []) {
	return attachments.map((attachment) => ({
		url: attachment.url,
		filename: attachment.filename ?? "file",
		contentType: attachment.content_type ?? "application/octet-stream",
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
export class FluxerPlatform extends EventEmitter {
	constructor({ token, apiBase }) {
		super();
		this.token = token;
		this.selfUserId = null;
		const parsed = parseFluxerApiConfig(apiBase);
		this.apiBase = parsed.apiBase;
		this.apiVersion = parsed.version;
		this.rest = new REST({
			api: this.apiBase,
			version: this.apiVersion,
		}).setToken(token);
		this.gateway = new WebSocketManager({
			intents: 0,
			rest: this.rest,
			token,
			version: this.apiVersion,
		});
		this.client = new Client({ rest: this.rest, gateway: this.gateway });
	}
	async start() {
		this.registerCoreEvents();
		this.gateway.connect();
	}
	registerCoreEvents() {
		this.client.on(GatewayDispatchEvents.Ready, ({ data }) => {
			this.selfUserId = data.user.id;
			logger.info("Fluxer client ready", {
				userId: data.user.id,
				username: data.user.username,
				discriminator: data.user.discriminator,
			});
		});
		this.client.on(
			GatewayDispatchEvents.MessageCreate,
			async ({ data }) => {
				if (!data.guild_id) {
					return;
				}
				if (![0, 19].includes(data.type)) {
					return;
				}
				this.emit("message", this.buildMessageEventPayload(data));
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageUpdate,
			async ({ data }) => {
				if (!data.guild_id) {
					return;
				}
				this.emit("messageUpdate", this.buildMessageEventPayload(data));
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageDelete,
			async ({ data }) => {
				this.emit("messageDelete", {
					platform: "fluxer",
					guildId: data.guild_id ?? null,
					channelId: data.channel_id ?? null,
					messageId: data.id,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageDeleteBulk,
			async ({ data }) => {
				for (const messageId of data.ids ?? []) {
					this.emit("messageDelete", {
						platform: "fluxer",
						guildId: data.guild_id ?? null,
						channelId: data.channel_id ?? null,
						messageId,
					});
				}
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageReactionAdd,
			async ({ data }) => {
				if (data.user_id && data.user_id === this.selfUserId) {
					return;
				}
				const emoji = getUnicodeEmojiFromFluxerPayload(data.emoji);
				if (!emoji) {
					return;
				}
				this.emit("messageReactionAdd", {
					platform: "fluxer",
					guildId: data.guild_id ?? null,
					channelId: data.channel_id,
					messageId: data.message_id,
					userId: data.user_id ?? null,
					emoji,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageReactionRemove,
			async ({ data }) => {
				if (data.user_id && data.user_id === this.selfUserId) {
					return;
				}
				const emoji = getUnicodeEmojiFromFluxerPayload(data.emoji);
				if (!emoji) {
					return;
				}
				this.emit("messageReactionRemove", {
					platform: "fluxer",
					guildId: data.guild_id ?? null,
					channelId: data.channel_id,
					messageId: data.message_id,
					userId: data.user_id ?? null,
					emoji,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageReactionRemoveAll,
			async ({ data }) => {
				this.emit("messageReactionRemoveAll", {
					platform: "fluxer",
					guildId: data.guild_id ?? null,
					channelId: data.channel_id,
					messageId: data.message_id,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.MessageReactionRemoveEmoji,
			async ({ data }) => {
				const emoji = getUnicodeEmojiFromFluxerPayload(data.emoji);
				if (!emoji) {
					return;
				}
				this.emit("messageReactionRemoveEmoji", {
					platform: "fluxer",
					guildId: data.guild_id ?? null,
					channelId: data.channel_id,
					messageId: data.message_id,
					emoji,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.GuildRoleUpdate,
			async ({ data }) => {
				this.emit("roleUpdate", {
					platform: "fluxer",
					guildId: data.guild_id,
					roleId: data.role.id,
				});
			},
		);
		this.client.on("GUILD_ROLE_UPDATE_BULK", async ({ data }) => {
			for (const role of data.roles ?? []) {
				this.emit("roleUpdate", {
					platform: "fluxer",
					guildId: data.guild_id,
					roleId: role.id,
				});
			}
		});
		this.client.on(
			GatewayDispatchEvents.GuildMemberUpdate,
			async ({ data }) => {
				const userId = extractMemberUserId(data);
				if (!data.guild_id || !userId) {
					return;
				}
				this.emit("memberUpdate", {
					platform: "fluxer",
					guildId: data.guild_id,
					userId,
				});
			},
		);
	}
	buildMessageEventPayload(data) {
		const userMentionLabels = {};
		for (const user of data.mentions ?? []) {
			userMentionLabels[user.id] =
				user.global_name ?? user.username ?? "Unknown User";
		}
		return {
			platform: "fluxer",
			guildId: data.guild_id,
			channelId: data.channel_id,
			userId: data.author?.id ?? null,
			messageId: data.id,
			content: data.content ?? "",
			displayName: getUserDisplayName(data.author, data.member ?? null),
			referenceMessageId: data.message_reference?.message_id ?? null,
			mentionUserIds: (data.mentions ?? []).map((user) => user.id),
			mentionRoleIds: data.mention_roles ?? [],
			mentionChannelIds: [],
			mentionEveryone: Boolean(data.mention_everyone),
			userMentionLabels,
			embeds: data.embeds ?? [],
			attachments: normalizeFluxerAttachments(data.attachments ?? []),
			attachmentsCount: Array.isArray(data.attachments)
				? data.attachments.length
				: 0,
			isBotAuthor: Boolean(data.author?.bot),
			isWebhookMessage: Boolean(data.webhook_id),
			isSelfMessage: Boolean(
				this.selfUserId && data.author?.id === this.selfUserId,
			),
			reply: async (payload) => {
				const normalized = normalizeReplyPayload(payload);
				await this.sendGuildMessage(data.channel_id, {
					content: normalized.content ?? "",
					embeds: normalized.embeds ?? undefined,
					messageReference: {
						messageId: data.id,
						channelId: data.channel_id,
						guildId: data.guild_id,
					},
					allowedMentions: {
						replied_user: false,
						...(normalized.allowedMentions ?? {}),
					},
				});
			},
		};
	}
	getSelfUserId() {
		return this.selfUserId;
	}
	async request(path, options = {}) {
		const headers = {
			Authorization: `Bot ${this.token}`,
			...(options.headers || {}),
		};
		if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
			headers["Content-Type"] = "application/json";
		}
		const response = await fetch(
			`${this.apiBase}/v${this.apiVersion}${path}`,
			{ ...options, headers },
		);
		if (!response.ok) {
			return null;
		}
		if (response.status === 204) {
			return null;
		}
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			return response.json();
		}
		return response.text();
	}
	async fetchGuild(guildId) {
		return this.request(`/guilds/${guildId}`);
	}
	async fetchGuildSummary(guildId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return null;
		}
		return { id: guild.id, name: guild.name };
	}
	async fetchGuildChannel(guildId, channelId) {
		const channel = await this.request(`/channels/${channelId}`);
		if (!channel || channel.guild_id !== guildId) {
			return null;
		}
		return channel;
	}
	async fetchGuildMessage(channelId, messageId) {
		return this.request(`/channels/${channelId}/messages/${messageId}`);
	}
	async isSupportedGuildChannelType(channel) {
		return [0, 2, 4].includes(channel.type);
	}
	async getGuildChannelTemplate(guildId, channelId) {
		const channel = await this.fetchGuildChannel(guildId, channelId);
		if (!channel) {
			return null;
		}
		if (channel.type === 0) {
			return {
				kind: "text",
				name: channel.name,
				topic: channel.topic ?? null,
				nsfw: channel.nsfw ?? false,
				parentId: channel.parent_id ?? null,
			};
		}
		if (channel.type === 2) {
			return {
				kind: "voice",
				name: channel.name,
				bitrate: channel.bitrate ?? null,
				userLimit: channel.user_limit ?? 0,
				parentId: channel.parent_id ?? null,
			};
		}
		if (channel.type === 4) {
			return { kind: "category", name: channel.name };
		}
		return null;
	}
	async createGuildChannelFromTemplate(guildId, template) {
		let body = null;
		if (template.kind === "text") {
			body = {
				type: 0,
				name: template.name,
				topic: template.topic ?? undefined,
				nsfw: template.nsfw ?? false,
				parent_id: template.parentId ?? undefined,
			};
		}
		if (template.kind === "voice") {
			body = {
				type: 2,
				name: template.name,
				bitrate: template.bitrate ?? undefined,
				user_limit: template.userLimit ?? 0,
				parent_id: template.parentId ?? undefined,
			};
		}
		if (template.kind === "category") {
			body = { type: 4, name: template.name };
		}
		if (!body) {
			return null;
		}
		return this.request(`/guilds/${guildId}/channels`, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}
	async fetchGuildMember(guildId, userId) {
		return this.request(`/guilds/${guildId}/members/${userId}`);
	}
	async fetchCurrentGuildMember(guildId) {
		return this.request(`/guilds/${guildId}/members/@me`);
	}
	async getGuildMemberSnapshot(guildId, userId) {
		const member = await this.fetchGuildMember(guildId, userId);
		if (!member) {
			return null;
		}
		return {
			userId: extractMemberUserId(member),
			nick: member.nick ?? null,
			roleIds: new Set(extractMemberRoleIds(member)),
		};
	}
	async setMemberNickname(guildId, userId, nick) {
		const response = await this.request(
			`/guilds/${guildId}/members/${userId}`,
			{ method: "PATCH", body: JSON.stringify({ nick: nick ?? null }) },
		);
		return Boolean(response);
	}
	async addMemberRole(guildId, userId, roleId) {
		const response = await this.request(
			`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
			{ method: "PUT" },
		);
		return response === null || Boolean(response);
	}
	async removeMemberRole(guildId, userId, roleId) {
		const response = await this.request(
			`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
			{ method: "DELETE" },
		);
		return response === null || Boolean(response);
	}
	async fetchGuildRoles(guildId) {
		const roles = await this.request(`/guilds/${guildId}/roles`);
		return Array.isArray(roles) ? roles : [];
	}
	async fetchGuildRole(guildId, roleId) {
		const roles = await this.fetchGuildRoles(guildId);
		return roles.find((role) => role.id === roleId) ?? null;
	}
	async getGuildRoleTemplate(guildId, roleId) {
		const role = await this.fetchGuildRole(guildId, roleId);
		if (!role) {
			return null;
		}
		return {
			name: role.name,
			color: role.color ?? 0,
			permissions: String(role.permissions ?? "0"),
			hoist: role.hoist ?? false,
			mentionable: role.mentionable ?? false,
		};
	}
	async createGuildRoleFromTemplate(guildId, template) {
		const created = await this.request(`/guilds/${guildId}/roles`, {
			method: "POST",
			body: JSON.stringify({
				name: template.name,
				color: template.color ?? 0,
				permissions: String(template.permissions ?? "0"),
			}),
		});
		if (!created) {
			return null;
		}
		await this.request(`/guilds/${guildId}/roles/${created.id}`, {
			method: "PATCH",
			body: JSON.stringify({
				hoist: template.hoist ?? false,
				mentionable: template.mentionable ?? false,
			}),
		});
		return created;
	}
	async updateGuildRoleFromTemplate(guildId, roleId, template) {
		return this.request(`/guilds/${guildId}/roles/${roleId}`, {
			method: "PATCH",
			body: JSON.stringify({
				name: template.name,
				color: template.color ?? 0,
				permissions: String(template.permissions ?? "0"),
				hoist: template.hoist ?? false,
				mentionable: template.mentionable ?? false,
			}),
		});
	}
	async sendGuildMessage(channelId, payload) {
		const baseBody = {
			content: payload.content ?? "",
			...(payload.allowedMentions
				? { allowed_mentions: payload.allowedMentions }
				: {}),
			...(payload.embeds?.length ? { embeds: payload.embeds } : {}),
		};
		if (payload.messageReference?.messageId) {
			baseBody.message_reference = {
				type: 0,
				message_id: payload.messageReference.messageId,
				channel_id: payload.messageReference.channelId ?? channelId,
				guild_id: payload.messageReference.guildId ?? undefined,
			};
		}
		if (payload.files?.length) {
			const form = new FormData();
			form.append(
				"payload_json",
				JSON.stringify({
					...baseBody,
					attachments: payload.files.map((file, index) => ({
						id: index,
						filename: file.name,
						...(file.description
							? { description: file.description }
							: {}),
					})),
				}),
			);
			for (const [index, file] of payload.files.entries()) {
				form.append(
					`files[${index}]`,
					new Blob([file.buffer], {
						type: file.contentType ?? "application/octet-stream",
					}),
					file.name,
				);
			}
			const uploaded = await this.request(
				`/channels/${channelId}/messages`,
				{ method: "POST", body: form },
			);
			if (uploaded) {
				return uploaded;
			}
		}
		return this.request(`/channels/${channelId}/messages`, {
			method: "POST",
			body: JSON.stringify(baseBody),
		});
	}
	async editGuildMessage(channelId, messageId, payload) {
		return this.request(`/channels/${channelId}/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify({
				content: payload.content,
				...(payload.allowedMentions
					? { allowed_mentions: payload.allowedMentions }
					: {}),
				...(payload.embeds?.length
					? { embeds: payload.embeds }
					: { embeds: [] }),
			}),
		});
	}
	async deleteGuildMessage(channelId, messageId) {
		const response = await this.request(
			`/channels/${channelId}/messages/${messageId}`,
			{ method: "DELETE" },
		);
		return response === null || Boolean(response);
	}
	async addReactionToMessage(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		const response = await this.request(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
			{ method: "PUT" },
		);
		return response === null || Boolean(response);
	}
	async removeOwnReactionFromMessage(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		const response = await this.request(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
			{ method: "DELETE" },
		);
		return response === null || Boolean(response);
	}
	async removeAllReactionsFromMessage(channelId, messageId) {
		const response = await this.request(
			`/channels/${channelId}/messages/${messageId}/reactions`,
			{ method: "DELETE" },
		);
		return response === null || Boolean(response);
	}
	async removeAllReactionsWithEmoji(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		const response = await this.request(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`,
			{ method: "DELETE" },
		);
		return response === null || Boolean(response);
	}
	calculatePermissionsFromRoles(member, roles) {
		const memberRoleIds = new Set(extractMemberRoleIds(member));
		let permissions = 0n;
		for (const role of roles) {
			if (!memberRoleIds.has(role.id)) {
				continue;
			}
			permissions |= BigInt(role.permissions ?? "0");
		}
		return permissions;
	}
	getHighestRolePosition(member, roles) {
		const memberRoleIds = new Set(extractMemberRoleIds(member));
		return roles
			.filter((role) => memberRoleIds.has(role.id))
			.reduce(
				(highest, role) =>
					Math.max(highest, Number(role.position ?? 0)),
				0,
			);
	}
	async userHasAdministrator(guildId, userId) {
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return false;
		}
		if (guild.owner_id === userId) {
			return true;
		}
		const member = await this.fetchGuildMember(guildId, userId);
		if (!member) {
			return false;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const permissions = this.calculatePermissionsFromRoles(member, roles);
		return (
			(permissions & FLUXER_ADMINISTRATOR_PERMISSION) ===
			FLUXER_ADMINISTRATOR_PERMISSION
		);
	}
	async botHasAdministrator(guildId) {
		const member = await this.fetchCurrentGuildMember(guildId);
		if (!member) {
			return false;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const permissions = this.calculatePermissionsFromRoles(member, roles);
		return (
			(permissions & FLUXER_ADMINISTRATOR_PERMISSION) ===
			FLUXER_ADMINISTRATOR_PERMISSION
		);
	}
	async canManageRole(guildId, roleId) {
		const targetRole = await this.fetchGuildRole(guildId, roleId);
		if (!targetRole) {
			return false;
		}
		const botMember = await this.fetchCurrentGuildMember(guildId);
		if (!botMember) {
			return false;
		}
		const guild = await this.fetchGuild(guildId);
		if (!guild) {
			return false;
		}
		const botUserId = extractMemberUserId(botMember);
		if (guild.owner_id === botUserId) {
			return true;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const botHighestPosition = this.getHighestRolePosition(
			botMember,
			roles,
		);
		return botHighestPosition > Number(targetRole.position ?? 0);
	}
	async canManageMember(guildId, userId) {
		const targetMember = await this.fetchGuildMember(guildId, userId);
		const botMember = await this.fetchCurrentGuildMember(guildId);
		const guild = await this.fetchGuild(guildId);
		if (!targetMember || !botMember || !guild) {
			return false;
		}
		const botUserId = extractMemberUserId(botMember);
		if (guild.owner_id === botUserId) {
			return true;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const botHighestPosition = this.getHighestRolePosition(
			botMember,
			roles,
		);
		const targetHighestPosition = this.getHighestRolePosition(
			targetMember,
			roles,
		);
		return botHighestPosition > targetHighestPosition;
	}
	stop() {
		if (typeof this.gateway.destroy === "function") {
			this.gateway.destroy();
		}
		logger.info("Fluxer client stopped");
	}
}
