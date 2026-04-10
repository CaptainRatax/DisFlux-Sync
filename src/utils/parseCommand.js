// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function parsePrefixedCommand(content, prefix) {
	if (typeof content !== "string") {
		return null;
	}

	if (!content.startsWith(prefix)) {
		return null;
	}

	const body = content.slice(prefix.length).trim();

	if (!body) {
		return null;
	}

	const parts = body.match(/"[^"]+"|\S+/g) ?? [];
	const cleanedParts = parts.map((part) => {
		if (part.startsWith('"') && part.endsWith('"')) {
			return part.slice(1, -1);
		}

		return part;
	});

	const [name, ...args] = cleanedParts;

	if (!name) {
		return null;
	}

	return {
		name: name.toLowerCase(),
		args,
		raw: body,
	};
}
