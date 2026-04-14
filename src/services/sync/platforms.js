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

export function getRoleIdForPlatform(roleLink, platform) {
	return platform === "discord"
		? roleLink.discordRoleId
		: roleLink.fluxerRoleId;
}

export function getUserIdForPlatform(userLink, platform) {
	return platform === "discord"
		? userLink.discordUserId
		: userLink.fluxerUserId;
}

export function getChannelFieldForPlatform(platform) {
	return platform === "discord" ? "discordChannelId" : "fluxerChannelId";
}

export function isSupportedPlatform(platform) {
	return platform === "discord" || platform === "fluxer";
}
