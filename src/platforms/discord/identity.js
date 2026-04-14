// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function getUserDisplayName(user, member) {
	return (
		member?.displayName ??
		user?.globalName ??
		user?.username ??
		"Unknown User"
	);
}

export function getUserAvatarUrl(user, member) {
	return (
		member?.displayAvatarURL?.({ extension: "png", size: 128 }) ??
		user?.displayAvatarURL?.({ extension: "png", size: 128 }) ??
		null
	);
}

export function getInteractionDisplayName(interaction) {
	return (
		interaction.member?.displayName ??
		interaction.member?.nick ??
		getUserDisplayName(interaction.user, interaction.member)
	);
}

export function buildMemberSnapshot(member) {
	const roleIds = new Set(
		[...member.roles.cache.keys()].filter(
			(roleId) => roleId !== member.guild.id,
		),
	);

	return {
		userId: member.id,
		nick: member.nickname ?? null,
		roleIds,
	};
}
