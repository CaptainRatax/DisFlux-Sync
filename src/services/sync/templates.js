// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

function normalizeNullableString(value) {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

function normalizeRoleTemplate(template) {
	return {
		name: String(template?.name ?? ""),
		color: Number(template?.color ?? 0),
		permissions: String(template?.permissions ?? "0"),
		hoist: Boolean(template?.hoist),
		mentionable: Boolean(template?.mentionable),
	};
}

export function roleTemplatesEqual(left, right) {
	const a = normalizeRoleTemplate(left);
	const b = normalizeRoleTemplate(right);

	return (
		a.name === b.name &&
		a.color === b.color &&
		a.permissions === b.permissions &&
		a.hoist === b.hoist &&
		a.mentionable === b.mentionable
	);
}

function normalizeOverwriteType(type) {
	if (type === "role" || type === 0 || type === "0") {
		return "role";
	}

	if (type === "member" || type === 1 || type === "1") {
		return "member";
	}

	return null;
}

function normalizePermissionOverwrite(overwrite) {
	const id = overwrite?.id ? String(overwrite.id) : null;
	const type = normalizeOverwriteType(overwrite?.type);

	if (!id || !type) {
		return null;
	}

	return {
		id,
		type,
		allow: String(overwrite?.allow ?? "0"),
		deny: String(overwrite?.deny ?? "0"),
	};
}

export function normalizePermissionOverwrites(overwrites = []) {
	const byKey = new Map();

	for (const rawOverwrite of overwrites ?? []) {
		const overwrite = normalizePermissionOverwrite(rawOverwrite);
		if (!overwrite) {
			continue;
		}

		byKey.set(`${overwrite.type}:${overwrite.id}`, overwrite);
	}

	return [...byKey.values()].sort((left, right) => {
		if (left.type !== right.type) {
			return left.type.localeCompare(right.type);
		}

		return left.id.localeCompare(right.id);
	});
}

function normalizeChannelTemplate(template) {
	const kind = String(template?.kind ?? "unknown");
	const normalized = {
		kind,
		name: String(template?.name ?? ""),
		parentId: normalizeNullableString(template?.parentId),
		permissionOverwrites: normalizePermissionOverwrites(
			template?.permissionOverwrites,
		),
	};

	if (kind === "text") {
		normalized.topic = normalizeNullableString(template?.topic);
		normalized.nsfw = Boolean(template?.nsfw);
		normalized.rateLimitPerUser = Number(
			template?.rateLimitPerUser ?? 0,
		);
	}

	if (kind === "voice") {
		normalized.bitrate =
			template?.bitrate === null || template?.bitrate === undefined
				? null
				: Number(template.bitrate);
		normalized.userLimit = Number(template?.userLimit ?? 0);
	}

	return normalized;
}

export function channelTemplatesEqual(left, right) {
	return (
		JSON.stringify(normalizeChannelTemplate(left)) ===
		JSON.stringify(normalizeChannelTemplate(right))
	);
}

export function normalizeNick(value) {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

export function normalizeMemberSnapshot(snapshot) {
	if (
		!snapshot ||
		!snapshot.roleIds ||
		typeof snapshot.roleIds[Symbol.iterator] !== "function"
	) {
		return null;
	}

	return {
		userId: snapshot.userId ?? null,
		nick: snapshot.nick ?? null,
		roleIds: new Set(snapshot.roleIds ?? []),
	};
}
