// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function getOppositePlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}
	if (platform === "fluxer") {
		return "discord";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getGuildIdForPlatform(serverLink, platform) {
	return platform === "discord"
		? serverLink.discordGuildId
		: serverLink.fluxerGuildId;
}

export function getChannelIdForPlatform(channelLink, platform) {
	return platform === "discord"
		? channelLink.discordChannelId
		: channelLink.fluxerChannelId;
}

export function getChannelIdFromMessageLink(messageLink, platform) {
	return platform === "discord"
		? messageLink.discordChannelId
		: messageLink.fluxerChannelId;
}

export function getWebhookIdFieldName(platform) {
	return platform === "discord" ? "discordWebhookId" : "fluxerWebhookId";
}

export function getWebhookTokenFieldName(platform) {
	return platform === "discord"
		? "discordWebhookToken"
		: "fluxerWebhookToken";
}

export function getWebhookCredentials(channelLink, platform) {
	const webhookId = channelLink?.[getWebhookIdFieldName(platform)];
	const webhookToken = channelLink?.[getWebhookTokenFieldName(platform)];
	if (!webhookId || !webhookToken) {
		return null;
	}
	return {
		id: String(webhookId),
		token: String(webhookToken),
	};
}

export function isManagedWebhookMessage(channelLink, event) {
	if (!event.isWebhookMessage || !event.webhookId) {
		return false;
	}
	const webhookId = channelLink?.[getWebhookIdFieldName(event.platform)];
	return Boolean(webhookId && String(webhookId) === String(event.webhookId));
}

export function getMessageIdForPlatform(messageLink, platform) {
	return platform === "discord"
		? messageLink.discordMessageId
		: messageLink.fluxerMessageId;
}
