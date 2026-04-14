// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

const FLUXER_CDN_ORIGIN = "https://fluxerusercontent.com";

export function extractMemberRoleIds(member) {
	return member?.roles ?? member?.role_ids ?? [];
}

export function extractMemberUserId(member) {
	return member?.user?.id ?? member?.user_id ?? member?.id ?? null;
}

export function getUserDisplayName(author, member = null) {
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

export function getMessageAvatarUrl(data) {
	return (
		data.member?.avatar_url ??
		getFluxerAvatarUrl(data.member?.user) ??
		getFluxerAvatarUrl(data.author) ??
		null
	);
}

export function buildMemberSnapshot(member) {
	return {
		userId: extractMemberUserId(member),
		nick: member?.nick ?? null,
		roleIds: new Set(extractMemberRoleIds(member)),
	};
}
