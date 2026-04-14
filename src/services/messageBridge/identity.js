// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function escapeMarkdown(value) {
	return String(value ?? "").replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");
}

function truncate(value, maxLength) {
	const text = String(value ?? "").trim();
	if (text.length <= maxLength) {
		return text;
	}
	return text.slice(0, maxLength);
}

export function getWebhookUsername(displayName) {
	const username = truncate(displayName, 80);
	return username || "Unknown User";
}

export function getWebhookAvatarUrl(avatarUrl) {
	const normalized = String(avatarUrl ?? "").trim();
	if (!normalized) {
		return null;
	}
	try {
		const url = new URL(normalized);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}
