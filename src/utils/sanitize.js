// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { ObjectId } from "mongodb";

import { normalizeSetupCode } from "./setupCode.js";

const PLATFORM_ID_PATTERN = /^\d{1,32}$/;
const SETUP_CODE_PATTERN = /^[A-Z0-9]+$/;

export function sanitizePlatformId(value) {
	if (
		typeof value !== "string" &&
		typeof value !== "number" &&
		typeof value !== "bigint"
	) {
		return null;
	}

	const normalized = String(value).trim();
	if (!PLATFORM_ID_PATTERN.test(normalized)) {
		return null;
	}

	return normalized;
}

export function sanitizeMongoObjectId(value) {
	if (value instanceof ObjectId) {
		return value;
	}
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	if (!ObjectId.isValid(normalized)) {
		return null;
	}

	const objectId = new ObjectId(normalized);
	if (objectId.toHexString() !== normalized.toLowerCase()) {
		return null;
	}

	return objectId;
}

export function sanitizeSetupCode(value, expectedLength) {
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const code = normalizeSetupCode(value);
	if (
		!code ||
		!SETUP_CODE_PATTERN.test(code) ||
		code.length !== expectedLength
	) {
		return null;
	}

	return code;
}
