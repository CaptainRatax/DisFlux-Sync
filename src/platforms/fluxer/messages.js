// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function getUnicodeEmojiFromFluxerPayload(emoji) {
	if (!emoji) {
		return null;
	}
	if (emoji.id) {
		return null;
	}
	return emoji.name ?? null;
}

export function normalizeFluxerAttachments(attachments = []) {
	return attachments.map((attachment) => ({
		url: attachment.url,
		filename: attachment.filename ?? "file",
		contentType: attachment.content_type ?? "application/octet-stream",
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

export function getEditMessageContent(payload, useFallbackContent = false) {
	if (useFallbackContent) {
		return payload.fallbackContent ?? payload.content ?? "";
	}
	return payload.content ?? "";
}

export function buildFluxerMessageBody(
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

export function buildFluxerMessageForm(payload, body) {
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

export function getWebhookCredentials(webhook) {
	if (!webhook?.id || !webhook?.token) {
		return null;
	}
	return {
		id: String(webhook.id),
		token: String(webhook.token),
	};
}
