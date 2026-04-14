// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { formatMarkdownTimestamp } from "./dates.js";
import { formatPlatformLabel } from "./platformFields.js";

export function buildAllowedMentions(platform) {
	if (platform === "discord") {
		return {
			parse: [],
			users: [],
			roles: [],
			repliedUser: false,
		};
	}

	return {
		parse: [],
		users: [],
		roles: [],
		replied_user: false,
	};
}

export function buildChannelLinkRemovedNotice({
	deletedPlatform,
	deletedChannelId,
	removedMessageLinks,
}) {
	return [
		"Channel link removed.",
		`Reason: the linked ${formatPlatformLabel(deletedPlatform)} channel \`${deletedChannelId}\` was deleted.`,
		`Cached message mappings removed: \`${removedMessageLinks ?? 0}\``,
	].join("\n");
}

export function buildRoleLinkRemovedNotice({
	deletedPlatform,
	deletedRoleId,
}) {
	return [
		"Role link removed.",
		`Reason: the linked ${formatPlatformLabel(deletedPlatform)} role \`${deletedRoleId}\` was deleted.`,
	].join("\n");
}

export function buildServerLinkDisabledNotice({
	missingPlatform,
	disposeAfter,
	disposeAfterDays,
	reason = "bot_removed",
}) {
	const exactDeadline = formatMarkdownTimestamp(disposeAfter, "F");
	const relativeDeadline = formatMarkdownTimestamp(disposeAfter, "R");
	const deadlineLine =
		exactDeadline && relativeDeadline
			? `Delete deadline: ${exactDeadline} (${relativeDeadline}).`
			: `Delete deadline: ${disposeAfterDays} days after the server link was disabled.`;
	const reasonLine =
		reason === "bot_removed"
			? `the bot was removed from the linked ${formatPlatformLabel(missingPlatform)} server.`
			: `the bot could not confirm access to the linked ${formatPlatformLabel(missingPlatform)} server after repeated checks.`;

	return [
		"Server link disabled.",
		`Reason: ${reasonLine}`,
		"All syncs for this server pair are now paused.",
		`If the bot is not back in both servers before the deadline, all saved link data for this server pair will be deleted.`,
		deadlineLine,
	].join("\n");
}

export function appendMissingAnnouncementChannelNote(
	content,
	serverLink,
	platform,
) {
	const prefix =
		typeof serverLink?.prefix === "string" && serverLink.prefix.length > 0
			? serverLink.prefix
			: ".";
	return [
		content,
		"",
		`Note: no announcement channel is configured for the ${formatPlatformLabel(platform)} side of this server link.`,
		`Use \`${prefix}set-announcement-channel\` in the desired channel or \`${prefix}set-announcement-channel ${platform} <channel-id>\` to configure one.`,
	].join("\n");
}

export function sortGuildChannels(channels) {
	return [...channels].sort((left, right) => {
		const leftPosition =
			left.rawPosition ?? left.position ?? left.position_overwrite ?? 0;
		const rightPosition =
			right.rawPosition ?? right.position ?? right.position_overwrite ?? 0;
		return leftPosition - rightPosition;
	});
}
