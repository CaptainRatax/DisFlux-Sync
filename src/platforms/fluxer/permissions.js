// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export const FLUXER_ADMINISTRATOR_PERMISSION = 0x8n;
export const FLUXER_MANAGE_CHANNELS_PERMISSION = 0x10n;
export const FLUXER_MANAGE_ROLES_PERMISSION = 0x10000000n;

export function hasPermission(permissions, permission) {
	return (permissions & permission) === permission;
}

function normalizePermissionOverwriteType(type) {
	if (type === "member" || type === 1 || type === "1") {
		return { api: 1, normalized: "member" };
	}

	return { api: 0, normalized: "role" };
}

export function buildChannelPermissionOverwrites(channel) {
	return (channel.permission_overwrites ?? []).map((overwrite) => {
		const type = normalizePermissionOverwriteType(overwrite.type);
		return {
			id: overwrite.id,
			type: type.normalized,
			allow: String(overwrite.allow ?? "0"),
			deny: String(overwrite.deny ?? "0"),
		};
	});
}

export function buildFluxerPermissionOverwrites(overwrites = []) {
	return overwrites.map((overwrite) => ({
		id: overwrite.id,
		type: normalizePermissionOverwriteType(overwrite.type).api,
		allow: String(overwrite.allow ?? "0"),
		deny: String(overwrite.deny ?? "0"),
	}));
}

export function setDefined(target, key, value) {
	if (value !== undefined) {
		target[key] = value;
	}
}
