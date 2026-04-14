// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { createHash } from "node:crypto";

import {
	sanitizeMongoObjectId,
	sanitizePlatformId,
} from "../../utils/sanitize.js";
import { normalizePlatform } from "./platformFields.js";

export function normalizeId(value) {
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}

	const normalized = String(value).trim();
	if (["auto", "null", "none", "-"].includes(normalized.toLowerCase())) {
		return null;
	}

	return sanitizePlatformId(normalized);
}

export function normalizeRequiredId(value) {
	return sanitizePlatformId(value);
}

export function normalizePriority(value) {
	return normalizePlatform(value);
}

export function normalizeBooleanOption(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (["yes", "true", "1", "on"].includes(normalized)) {
		return true;
	}
	if (["no", "false", "0", "off"].includes(normalized)) {
		return false;
	}
	return null;
}

export function hashSetupCode(code) {
	return createHash("sha256").update(String(code), "utf8").digest("hex");
}

export function getServerLinkIdQuery(serverLinkId) {
	const values = [];
	function addValue(value) {
		if (value === null || value === undefined) {
			return;
		}
		if (
			values.some(function valueMatches(existing) {
				return (
					typeof existing === typeof value &&
					String(existing) === String(value)
				);
			})
		) {
			return;
		}
		values.push(value);
	}

	addValue(sanitizeMongoObjectId(serverLinkId));

	if (serverLinkId !== null && serverLinkId !== undefined) {
		addValue(serverLinkId);
		addValue(String(serverLinkId));
	}

	if (values.length === 1) {
		return { $eq: values[0] };
	}

	return { $in: values };
}
