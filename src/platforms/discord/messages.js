// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function getUnicodeEmojiFromReaction(reaction) {
	if (!reaction?.emoji) {
		return null;
	}
	if (reaction.emoji.id) {
		return null;
	}
	return reaction.emoji.name ?? null;
}

export function mapDiscordEmbeds(message) {
	return message.embeds.map((embed) => embed.toJSON());
}

export function mapDiscordAttachments(message) {
	return [...message.attachments.values()].map((attachment) => ({
		url: attachment.url,
		filename: attachment.name ?? "file",
		contentType: attachment.contentType ?? "application/octet-stream",
		description: attachment.description ?? null,
		size: attachment.size ?? 0,
	}));
}

export function normalizeReplyPayload(payload) {
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

export function getEditMessageContent(payload, useFallbackContent = false) {
	if (useFallbackContent) {
		return payload.fallbackContent ?? payload.content ?? "";
	}
	return payload.content ?? "";
}

export function buildDiscordMessagePayload(
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

export function getWebhookCredentials(webhook) {
	if (!webhook?.id || !webhook?.token) {
		return null;
	}
	return {
		id: String(webhook.id),
		token: String(webhook.token),
	};
}
