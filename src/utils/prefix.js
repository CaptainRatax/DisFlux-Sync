// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export const DEFAULT_BOT_PREFIX = ".";

export function normalizeBotPrefix(value) {
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const normalized = String(value).trim();
	const characters = Array.from(normalized);
	if (characters.length !== 1) {
		return null;
	}

	const [prefix] = characters;
	if (!prefix || /\s/u.test(prefix)) {
		return null;
	}

	return prefix;
}

export function resolveBotPrefix(value, fallback = DEFAULT_BOT_PREFIX) {
	return normalizeBotPrefix(value) ?? fallback;
}

export function formatInlineCode(value) {
	const text = String(value ?? "");
	if (text.includes("`")) {
		return `\`\` ${text} \`\``;
	}
	return `\`${text}\``;
}
