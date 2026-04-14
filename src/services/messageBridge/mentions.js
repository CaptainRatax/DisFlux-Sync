// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

export function extractIds(regex, text) {
	const ids = new Set();
	for (const match of String(text ?? "").matchAll(regex)) {
		if (match[1]) {
			ids.add(match[1]);
		}
	}
	return [...ids];
}

export function buildDiscordAllowedMentions({
	userIds,
	roleIds,
	mentionEveryone,
}) {
	return {
		repliedUser: false,
		parse: mentionEveryone ? ["everyone"] : [],
		users: unique(userIds),
		roles: unique(roleIds),
	};
}

export function buildFluxerAllowedMentions({
	userIds,
	roleIds,
	mentionEveryone,
}) {
	const uniqueUserIds = unique(userIds);
	const uniqueRoleIds = unique(roleIds);
	if (
		mentionEveryone &&
		uniqueUserIds.length === 0 &&
		uniqueRoleIds.length === 0
	) {
		return { replied_user: false, parse: ["everyone"] };
	}
	return {
		replied_user: false,
		...(uniqueUserIds.length > 0 ? { users: uniqueUserIds } : {}),
		...(uniqueRoleIds.length > 0 ? { roles: uniqueRoleIds } : {}),
	};
}
