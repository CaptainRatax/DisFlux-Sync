// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { sanitizeMongoObjectId } from "../../utils/sanitize.js";

export function getMongoObjectId(value) {
	if (value && typeof value === "object" && "_id" in value) {
		return sanitizeMongoObjectId(value._id);
	}
	return sanitizeMongoObjectId(value);
}

export function getServerLinkIdValues(serverLinkId) {
	const values = [];
	const objectId = sanitizeMongoObjectId(serverLinkId);

	function addValue(value) {
		if (value === null || value === undefined) {
			return;
		}
		if (
			values.some(
				(existing) =>
					typeof existing === typeof value &&
					String(existing) === String(value),
			)
		) {
			return;
		}
		values.push(value);
	}

	addValue(objectId);

	if (serverLinkId !== null && serverLinkId !== undefined) {
		addValue(serverLinkId);
		addValue(String(serverLinkId));
	}

	return values;
}

export function getServerLinkIdFilter(serverLinkId) {
	const values = getServerLinkIdValues(serverLinkId);
	if (values.length === 0) {
		return null;
	}
	if (values.length === 1) {
		return values[0];
	}
	return { $in: values };
}

export function isLinkEnabled(link) {
	return Boolean(link && !link.disabledAt && link.enabled !== false);
}
