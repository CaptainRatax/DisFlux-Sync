// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { EventEmitter } from "node:events";
import { Client, GatewayDispatchEvents } from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { WebSocketManager } from "@discordjs/ws";
import { logger } from "../../core/logger.js";
const FLUXER_API_ORIGIN = "https://api.fluxer.app";
const FLUXER_CDN_ORIGIN = "https://fluxerusercontent.com";
const ALLOWED_FLUXER_API_ORIGINS = new Set([FLUXER_API_ORIGIN]);
const FLUXER_ADMINISTRATOR_PERMISSION = 0x8n;
const FLUXER_MANAGE_CHANNELS_PERMISSION = 0x10n;
const FLUXER_MANAGE_ROLES_PERMISSION = 0x10000000n;
const BRIDGE_WEBHOOK_NAME = "DisFlux Sync Bridge";

function hasPermission(permissions, permission) {
	return (permissions & permission) === permission;
}

function parseFluxerApiConfig(rawBase) {
	const url = new URL(rawBase);
	if (!ALLOWED_FLUXER_API_ORIGINS.has(url.origin)) {
		throw new Error(`Unsupported Fluxer API origin: ${url.origin}`);
	}
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
function buildFluxerApiUrl(apiBase, apiVersion, path) {
	if (
		typeof path !== "string" ||
		!path.startsWith("/") ||
		path.startsWith("//") ||
		path.includes("\\")
	) {
		throw new Error("Fluxer API path must be a relative absolute path");
	}

	const normalizedApiBase = apiBase.endsWith("/") ? apiBase : `${apiBase}/`;
	const url = new URL(`v${apiVersion}${path}`, normalizedApiBase);
	if (!ALLOWED_FLUXER_API_ORIGINS.has(url.origin)) {
		throw new Error(`Unsupported Fluxer API request origin: ${url.origin}`);
	}

	return `${FLUXER_API_ORIGIN}${url.pathname}${url.search}`;
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
function getAvatarFilename(avatar) {
	const normalized = String(avatar ?? "").trim();
	if (!normalized) {
		return null;
	}
	if (normalized.includes(".")) {
		return normalized;
	}
	return `${normalized}.${normalized.startsWith("a_") ? "gif" : "png"}`;
}
function getFluxerAvatarUrl(entity) {
	if (entity?.avatar_url) {
		return entity.avatar_url;
	}
	const filename = getAvatarFilename(entity?.avatar);
	if (!entity?.id || !filename) {
		return null;
	}
	const encodedId = encodeURIComponent(entity.id);
	const encodedFilename = encodeURIComponent(filename);
	return `${FLUXER_CDN_ORIGIN}/avatars/${encodedId}/${encodedFilename}?size=128`;
}
function getMessageAvatarUrl(data) {
	return (
		data.member?.avatar_url ??
		getFluxerAvatarUrl(data.member?.user) ??
		getFluxerAvatarUrl(data.author) ??
		null
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
function getReplyFallbackLine(payload) {
	if (!payload.messageReference?.messageId) {
		return null;
	}
	return `Replying to bridged message: ${payload.messageReference.messageId}`;
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
function buildFluxerMessageBody(
	payload,
	{
		useFallbackContent = false,
		includeReference = true,
		includeReferenceFallback = false,
		includeWebhookIdentity = false,
	} = {},
) {
	const body = {
		content: getMessageContent(payload, {
			useFallbackContent,
			includeReferenceFallback,
		}),
		...(payload.allowedMentions
			? { allowed_mentions: payload.allowedMentions }
			: {}),
		...(payload.embeds?.length ? { embeds: payload.embeds } : {}),
	};

	if (includeReference && payload.messageReference?.messageId) {
		body.message_reference = {
			type: 0,
			message_id: payload.messageReference.messageId,
			channel_id: payload.messageReference.channelId,
			guild_id: payload.messageReference.guildId ?? undefined,
		};
	}

	if (includeWebhookIdentity) {
		if (payload.webhookIdentity?.username) {
			body.username = payload.webhookIdentity.username;
		}
		if (payload.webhookIdentity?.avatarUrl) {
			body.avatar_url = payload.webhookIdentity.avatarUrl;
		}
	}

	return body;
}
function buildFluxerMessageForm(payload, body) {
	const form = new FormData();
	form.append(
		"payload_json",
		JSON.stringify({
			...body,
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
	return form;
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
	return {
		userId: extractMemberUserId(member),
		nick: member?.nick ?? null,
		roleIds: new Set(extractMemberRoleIds(member)),
	};
}
function normalizePermissionOverwriteType(type) {
	if (type === "member" || type === 1 || type === "1") {
		return { api: 1, normalized: "member" };
	}

	return { api: 0, normalized: "role" };
}
function buildChannelPermissionOverwrites(channel) {
	return (channel.permission_overwrites ?? []).map((overwrite) => {
		const type = normalizePermissionOverwriteType(overwrite.type);
		return {
			id: overwrite.id,
			type: type.normalized,
			allow: String(overwrite.allow ?? "0"),
			deny: String(overwrite.deny ?? "0"),
		};
	});
}
function buildFluxerPermissionOverwrites(overwrites = []) {
	return overwrites.map((overwrite) => ({
		id: overwrite.id,
		type: normalizePermissionOverwriteType(overwrite.type).api,
		allow: String(overwrite.allow ?? "0"),
		deny: String(overwrite.deny ?? "0"),
	}));
}
function setDefined(target, key, value) {
	if (value !== undefined) {
		target[key] = value;
	}
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
			GatewayDispatchEvents.GuildCreate,
			async ({ data }) => {
				if (!data.id) {
					return;
				}
				this.emit("guildAvailable", {
					platform: "fluxer",
					guildId: data.id,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.GuildDelete,
			async ({ data }) => {
				if (!data.id) {
					return;
				}
				this.emit("guildUnavailable", {
					platform: "fluxer",
					guildId: data.id,
					unavailable: Boolean(data.unavailable),
				});
			},
		);
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
		this.client.on(
			GatewayDispatchEvents.GuildRoleDelete,
			async ({ data }) => {
				if (!data.guild_id || !data.role_id) {
					return;
				}
				this.emit("roleDelete", {
					platform: "fluxer",
					guildId: data.guild_id,
					roleId: data.role_id,
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
			GatewayDispatchEvents.ChannelUpdate,
			async ({ data }) => {
				if (!data.guild_id) {
					return;
				}
				if (!(await this.isSupportedGuildChannelType(data))) {
					return;
				}
				this.emit("channelUpdate", {
					platform: "fluxer",
					guildId: data.guild_id,
					channelId: data.id,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.ChannelDelete,
			async ({ data }) => {
				if (!data.guild_id || !data.id) {
					return;
				}
				this.emit("channelDelete", {
					platform: "fluxer",
					guildId: data.guild_id,
					channelId: data.id,
				});
			},
		);
		this.client.on(
			GatewayDispatchEvents.GuildMemberAdd,
			async ({ data }) => {
				const userId = extractMemberUserId(data);
				if (!data.guild_id || !userId) {
					return;
				}
				const payload = {
					platform: "fluxer",
					guildId: data.guild_id,
					userId,
					snapshot: buildMemberSnapshot(data),
				};
				this.emit("memberJoin", payload);
				this.emit("memberUpdate", payload);
			},
		);
		this.client.on(
			GatewayDispatchEvents.GuildMemberRemove,
			async ({ data }) => {
				const userId = extractMemberUserId(data);
				if (!data.guild_id || !userId) {
					return;
				}
				this.emit("memberLeave", {
					platform: "fluxer",
					guildId: data.guild_id,
					userId,
				});
			},
		);
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
					snapshot: buildMemberSnapshot(data),
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
			avatarUrl: getMessageAvatarUrl(data),
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
			webhookId: data.webhook_id ?? null,
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
			deleteMessage: async () =>
				this.deleteGuildMessage(data.channel_id, data.id),
		};
	}
	getSelfUserId() {
		return this.selfUserId;
	}
	async requestResponse(path, options = {}) {
		const { auth = true, ...fetchOptions } = options;
		const headers = {
			...(auth ? { Authorization: `Bot ${this.token}` } : {}),
			...(fetchOptions.headers || {}),
		};
		if (
			!(fetchOptions.body instanceof FormData) &&
			!headers["Content-Type"]
		) {
			headers["Content-Type"] = "application/json";
		}
		try {
			const url = buildFluxerApiUrl(
				this.apiBase,
				this.apiVersion,
				path,
			);
			return await fetch(url, {
				...fetchOptions,
				redirect: "error",
				headers,
			});
		} catch (error) {
			logger.warn("Fluxer request failed", {
				path,
				method: options.method ?? "GET",
				error: error.message,
			});
			return null;
		}
	}
	async request(path, options = {}) {
		const response = await this.requestResponse(path, options);
		if (!response) {
			return null;
		}
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
	async requestOk(path, options = {}, meta = {}) {
		const response = await this.requestResponse(path, options);
		if (!response) {
			return false;
		}
		if (response.ok) {
			return true;
		}
		const body = await response.text().catch(() => "");
		logger.warn("Fluxer request returned non-success", {
			path,
			method: options.method ?? "GET",
			status: response.status,
			statusText: response.statusText,
			body: body.slice(0, 500),
			...meta,
		});
		return false;
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
	async isGuildOwner(guildId, userId) {
		const guild = await this.fetchGuild(guildId);
		return Boolean(guild && guild.owner_id === userId);
	}
	async fetchGuildChannel(guildId, channelId) {
		const channel = await this.request(`/channels/${channelId}`);
		if (!channel || channel.guild_id !== guildId) {
			return null;
		}
		return channel;
	}
	async fetchGuildChannels(guildId) {
		const channels = await this.request(`/guilds/${guildId}/channels`);
		return Array.isArray(channels) ? channels : [];
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
				rateLimitPerUser: channel.rate_limit_per_user ?? 0,
				permissionOverwrites:
					buildChannelPermissionOverwrites(channel),
			};
		}
		if (channel.type === 2) {
			return {
				kind: "voice",
				name: channel.name,
				bitrate: channel.bitrate ?? null,
				userLimit: channel.user_limit ?? 0,
				parentId: channel.parent_id ?? null,
				permissionOverwrites:
					buildChannelPermissionOverwrites(channel),
			};
		}
		if (channel.type === 4) {
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
		let body = null;
		const permissionOverwrites = buildFluxerPermissionOverwrites(
			template.permissionOverwrites ?? [],
		);
		if (template.kind === "text") {
			body = {
				type: 0,
				name: template.name,
				topic: template.topic ?? undefined,
				nsfw: template.nsfw ?? false,
				parent_id: template.parentId ?? undefined,
				rate_limit_per_user: template.rateLimitPerUser ?? 0,
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
			body = {
				type: 4,
				name: template.name,
			};
		}
		if (!body) {
			return null;
		}
		setDefined(
			body,
			"permission_overwrites",
			permissionOverwrites.length > 0
				? permissionOverwrites
				: undefined,
		);
		return this.request(`/guilds/${guildId}/channels`, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}
	async updateGuildChannelFromTemplate(guildId, channelId, template) {
		if (!(await this.canManageChannel(guildId, channelId))) {
			return null;
		}
		const body = {
			name: template.name,
			permission_overwrites: buildFluxerPermissionOverwrites(
				template.permissionOverwrites ?? [],
			),
		};

		setDefined(body, "parent_id", template.parentId);

		if (template.kind === "text") {
			setDefined(body, "topic", template.topic ?? null);
			setDefined(body, "nsfw", template.nsfw ?? false);
			setDefined(
				body,
				"rate_limit_per_user",
				template.rateLimitPerUser ?? 0,
			);
		}

		if (template.kind === "voice") {
			setDefined(body, "bitrate", template.bitrate ?? undefined);
			setDefined(body, "user_limit", template.userLimit ?? 0);
		}

		return this.request(`/channels/${channelId}`, {
			method: "PATCH",
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
		return buildMemberSnapshot(member);
	}
	async setMemberNickname(guildId, userId, nick) {
		return this.requestOk(
			`/guilds/${guildId}/members/${userId}`,
			{ method: "PATCH", body: JSON.stringify({ nick: nick ?? null }) },
			{ guildId, userId, action: "setMemberNickname" },
		);
	}
	async addMemberRole(guildId, userId, roleId) {
		return this.requestOk(
			`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
			{ method: "PUT" },
			{ guildId, userId, roleId, action: "addMemberRole" },
		);
	}
	async removeMemberRole(guildId, userId, roleId) {
		return this.requestOk(
			`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
			{ method: "DELETE" },
			{ guildId, userId, roleId, action: "removeMemberRole" },
		);
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
		if (payload.webhook?.id && payload.webhook?.token) {
			const webhookMessage = await this.sendGuildWebhookMessage(
				payload,
			);
			if (webhookMessage) {
				return webhookMessage;
			}
		}

		const baseBody = buildFluxerMessageBody(payload, {
			useFallbackContent: true,
		});
		if (payload.files?.length) {
			const form = buildFluxerMessageForm(payload, baseBody);
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
	async sendGuildWebhookMessage(payload) {
		const baseBody = buildFluxerMessageBody(payload, {
			includeReference: true,
			includeWebhookIdentity: true,
		});
		const sent = await this.executeGuildWebhookMessage(payload, baseBody);
		if (sent || !payload.messageReference?.messageId) {
			return sent;
		}
		const fallbackBody = buildFluxerMessageBody(payload, {
			includeReference: false,
			includeReferenceFallback: true,
			includeWebhookIdentity: true,
		});
		return this.executeGuildWebhookMessage(payload, fallbackBody);
	}
	async executeGuildWebhookMessage(payload, body) {
		const path = `/webhooks/${payload.webhook.id}/${payload.webhook.token}?wait=true`;
		if (payload.files?.length) {
			const form = buildFluxerMessageForm(payload, body);
			const uploaded = await this.request(path, {
				method: "POST",
				body: form,
				auth: false,
			});
			if (uploaded) {
				return uploaded;
			}
		}
		return this.request(path, {
			method: "POST",
			body: JSON.stringify(body),
			auth: false,
		});
	}
	async sendDirectMessage(userId, payload) {
		const channel = await this.request("/users/@me/channels", {
			method: "POST",
			body: JSON.stringify({ recipient_id: userId }),
		});
		if (!channel?.id) {
			return false;
		}
		const message = await this.sendGuildMessage(
			channel.id,
			normalizeReplyPayload(payload),
		);
		return Boolean(message);
	}
	async editGuildMessage(channelId, messageId, payload) {
		if (payload.webhook?.id && payload.webhook?.token) {
			const edited = await this.request(
				`/webhooks/${payload.webhook.id}/${payload.webhook.token}/messages/${messageId}`,
				{
					method: "PATCH",
					auth: false,
					body: JSON.stringify(
						buildFluxerMessageBody(payload, {
							includeReference: false,
						}),
					),
				},
			);
			if (edited) {
				return edited;
			}
		}

		return this.request(`/channels/${channelId}/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify({
				content: getEditMessageContent(payload, true),
				...(payload.allowedMentions
					? { allowed_mentions: payload.allowedMentions }
					: {}),
				...(payload.embeds?.length
					? { embeds: payload.embeds }
					: { embeds: [] }),
			}),
		});
	}
	async deleteGuildMessage(channelId, messageId, options = {}) {
		if (options.webhook?.id && options.webhook?.token) {
			const deleted = await this.requestOk(
				`/webhooks/${options.webhook.id}/${options.webhook.token}/messages/${messageId}`,
				{ method: "DELETE", auth: false },
				{ channelId, messageId, action: "deleteWebhookMessage" },
			);
			if (deleted) {
				return true;
			}
		}

		return this.requestOk(
			`/channels/${channelId}/messages/${messageId}`,
			{ method: "DELETE" },
			{ channelId, messageId, action: "deleteGuildMessage" },
		);
	}
	async deleteGuildChannelWebhook(webhookCredentials) {
		if (!webhookCredentials?.id || !webhookCredentials?.token) {
			return false;
		}

		return this.requestOk(
			`/webhooks/${webhookCredentials.id}/${webhookCredentials.token}`,
			{ method: "DELETE", auth: false },
			{ action: "deleteGuildChannelWebhook" },
		);
	}
	async addReactionToMessage(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		return this.requestOk(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
			{ method: "PUT" },
			{ channelId, messageId, emoji, action: "addReactionToMessage" },
		);
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
		if (!channel || channel.guild_id !== guildId || channel.type !== 0) {
			return null;
		}

		const reusableCredentials =
			await this.fetchReusableGuildChannelWebhook(channelId);
		if (reusableCredentials) {
			return reusableCredentials;
		}

		const created = await this.request(
			`/channels/${channelId}/webhooks`,
			{
				method: "POST",
				body: JSON.stringify({ name: BRIDGE_WEBHOOK_NAME }),
			},
		);
		return getWebhookCredentials(created);
	}
	async fetchReusableGuildChannelWebhook(channelId) {
		const webhooks = await this.request(
			`/channels/${channelId}/webhooks`,
		);
		if (!Array.isArray(webhooks)) {
			return null;
		}

		const webhook = webhooks.find((candidate) => {
			if (
				candidate?.name !== BRIDGE_WEBHOOK_NAME ||
				!candidate?.token
			) {
				return false;
			}
			if (
				this.selfUserId &&
				candidate.user?.id &&
				candidate.user.id !== this.selfUserId
			) {
				return false;
			}
			return true;
		});
		return getWebhookCredentials(webhook);
	}
	async fetchExistingGuildChannelWebhook(channelId, existing = null) {
		if (!existing?.id || !existing?.token) {
			return null;
		}

		const webhookWithToken = await this.request(
			`/webhooks/${existing.id}/${existing.token}`,
			{ auth: false },
		);
		if (webhookWithToken?.channel_id === channelId) {
			return getWebhookCredentials(webhookWithToken);
		}

		const webhooks = await this.request(
			`/channels/${channelId}/webhooks`,
		);
		if (!Array.isArray(webhooks)) {
			return null;
		}

		const webhook = webhooks.find(
			(candidate) =>
				candidate?.id === existing.id &&
				candidate?.token === existing.token &&
				candidate?.channel_id === channelId,
		);
		return getWebhookCredentials(webhook);
	}
	async removeOwnReactionFromMessage(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		return this.requestOk(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
			{ method: "DELETE" },
			{
				channelId,
				messageId,
				emoji,
				action: "removeOwnReactionFromMessage",
			},
		);
	}
	async removeAllReactionsFromMessage(channelId, messageId) {
		return this.requestOk(
			`/channels/${channelId}/messages/${messageId}/reactions`,
			{ method: "DELETE" },
			{ channelId, messageId, action: "removeAllReactionsFromMessage" },
		);
	}
	async removeAllReactionsWithEmoji(channelId, messageId, emoji) {
		const encodedEmoji = encodeURIComponent(emoji);
		return this.requestOk(
			`/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`,
			{ method: "DELETE" },
			{
				channelId,
				messageId,
				emoji,
				action: "removeAllReactionsWithEmoji",
			},
		);
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
		return hasPermission(permissions, FLUXER_ADMINISTRATOR_PERMISSION);
	}
	async botHasAdministrator(guildId) {
		const member = await this.fetchCurrentGuildMember(guildId);
		if (!member) {
			return false;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const permissions = this.calculatePermissionsFromRoles(member, roles);
		return hasPermission(permissions, FLUXER_ADMINISTRATOR_PERMISSION);
	}
	async canManageChannel(guildId, channelId) {
		const channel = await this.fetchGuildChannel(guildId, channelId);
		const botMember = await this.fetchCurrentGuildMember(guildId);
		const guild = await this.fetchGuild(guildId);
		if (!channel || !botMember || !guild) {
			return false;
		}
		const botUserId = extractMemberUserId(botMember);
		if (guild.owner_id === botUserId) {
			return true;
		}
		const roles = await this.fetchGuildRoles(guildId);
		const permissions = this.calculatePermissionsFromRoles(
			botMember,
			roles,
		);
		return (
			hasPermission(permissions, FLUXER_ADMINISTRATOR_PERMISSION) ||
			hasPermission(permissions, FLUXER_MANAGE_CHANNELS_PERMISSION)
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
		const permissions = this.calculatePermissionsFromRoles(
			botMember,
			roles,
		);
		const hasRoleManagementPermission =
			hasPermission(permissions, FLUXER_ADMINISTRATOR_PERMISSION) ||
			hasPermission(permissions, FLUXER_MANAGE_ROLES_PERMISSION);

		if (!hasRoleManagementPermission) {
			return false;
		}

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
