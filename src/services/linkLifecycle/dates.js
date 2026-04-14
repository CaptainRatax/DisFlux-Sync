// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function toValidDate(value) {
	if (!value) {
		return null;
	}

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return date;
}

export function addDays(date, days) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(date, now, days) {
	const parsed = toValidDate(date);
	return Boolean(
		parsed && parsed.getTime() <= now.getTime() - days * 24 * 60 * 60 * 1000,
	);
}

export function isPastDate(date, now) {
	const parsed = toValidDate(date);
	return Boolean(parsed && parsed.getTime() <= now.getTime());
}

export function formatMarkdownTimestamp(value, style) {
	const date = toValidDate(value);
	if (!date) {
		return null;
	}
	return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
