// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { OverwriteType, PermissionsBitField } from "discord.js";

function normalizePermissionOverwriteType(type) {
	return type === "member" || type === OverwriteType.Member
		? OverwriteType.Member
		: OverwriteType.Role;
}

export function buildChannelPermissionOverwrites(channel) {
	return [...channel.permissionOverwrites.cache.values()].map(
		(overwrite) => ({
			id: overwrite.id,
			type:
				overwrite.type === OverwriteType.Member ? "member" : "role",
			allow: overwrite.allow.bitfield.toString(),
			deny: overwrite.deny.bitfield.toString(),
		}),
	);
}

export function buildDiscordPermissionOverwrites(overwrites = []) {
	return overwrites.map((overwrite) => ({
		id: overwrite.id,
		type: normalizePermissionOverwriteType(overwrite.type),
		allow: new PermissionsBitField(BigInt(overwrite.allow ?? "0")),
		deny: new PermissionsBitField(BigInt(overwrite.deny ?? "0")),
	}));
}

export function setDefined(target, key, value) {
	if (value !== undefined) {
		target[key] = value;
	}
}

export function buildDiscordRoleColors(primaryColor) {
	return {
		primaryColor: primaryColor ?? 0,
		secondaryColor: null,
		tertiaryColor: null,
	};
}

export function isChannelManageable(channel) {
	try {
		return Boolean(channel?.manageable);
	} catch {
		return false;
	}
}
