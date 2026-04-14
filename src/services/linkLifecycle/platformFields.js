// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function getOtherPlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}
	if (platform === "fluxer") {
		return "discord";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getGuildFieldName(platform) {
	if (platform === "discord") {
		return "discordGuildId";
	}
	if (platform === "fluxer") {
		return "fluxerGuildId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getChannelFieldName(platform) {
	if (platform === "discord") {
		return "discordChannelId";
	}
	if (platform === "fluxer") {
		return "fluxerChannelId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getAnnouncementChannelFieldName(platform) {
	if (platform === "discord") {
		return "discordAnnouncementChannelId";
	}
	if (platform === "fluxer") {
		return "fluxerAnnouncementChannelId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getRoleFieldName(platform) {
	if (platform === "discord") {
		return "discordRoleId";
	}
	if (platform === "fluxer") {
		return "fluxerRoleId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getUserFieldName(platform) {
	if (platform === "discord") {
		return "discordUserId";
	}
	if (platform === "fluxer") {
		return "fluxerUserId";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getGuildIdForPlatform(serverLink, platform) {
	return serverLink?.[getGuildFieldName(platform)] ?? null;
}

export function getChannelIdForPlatform(channelLink, platform) {
	return channelLink?.[getChannelFieldName(platform)] ?? null;
}

function getWebhookIdFieldName(platform) {
	return platform === "discord" ? "discordWebhookId" : "fluxerWebhookId";
}

function getWebhookTokenFieldName(platform) {
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
	return { id: String(webhookId), token: String(webhookToken) };
}

export function getAnnouncementChannelIdForPlatform(serverLink, platform) {
	return serverLink?.[getAnnouncementChannelFieldName(platform)] ?? null;
}

export function getRoleIdForPlatform(roleLink, platform) {
	return roleLink?.[getRoleFieldName(platform)] ?? null;
}

export function formatPlatformLabel(platform) {
	if (platform === "discord") {
		return "Discord";
	}
	if (platform === "fluxer") {
		return "Fluxer";
	}
	return "Unknown";
}
