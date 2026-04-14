// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function normalizePlatform(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "discord" || normalized === "fluxer") {
		return normalized;
	}
	return null;
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

export function getOtherPlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}
	if (platform === "fluxer") {
		return "discord";
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function getGuildIdForPlatform(serverLink, platform) {
	if (platform === "discord") {
		return serverLink.discordGuildId;
	}
	if (platform === "fluxer") {
		return serverLink.fluxerGuildId;
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

export function formatPlatformLabel(platform) {
	if (platform === "discord") {
		return "Discord";
	}
	if (platform === "fluxer") {
		return "Fluxer";
	}
	return "Unknown";
}

export function formatChannelTypeLabel(kind) {
	if (kind === "text") {
		return "text";
	}
	if (kind === "voice") {
		return "voice";
	}
	if (kind === "category") {
		return "category";
	}
	return "unknown";
}
