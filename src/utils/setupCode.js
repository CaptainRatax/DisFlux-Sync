// DisFLux Sync - DisFLux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSetupCode(length = 10) {
	let result = "";

	for (let index = 0; index < length; index += 1) {
		result += ALPHABET[randomInt(0, ALPHABET.length)];
	}

	return result;
}

export function normalizeSetupCode(code) {
	return String(code ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
}

export function formatSetupCode(code) {
	const normalized = normalizeSetupCode(code);

	if (!normalized) {
		return "";
	}

	return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}
