// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { sanitizeMongoObjectId } from "../../utils/sanitize.js";

function getServerLinkIdValues(serverLinkId) {
	const values = [];
	const objectId = sanitizeMongoObjectId(serverLinkId);

	if (objectId) {
		values.push(objectId);
	}

	if (serverLinkId !== null && serverLinkId !== undefined) {
		const stringId = String(serverLinkId);
		if (stringId) {
			values.push(stringId);
		}
	}

	return values;
}

export function getServerLinkIdFilter(serverLinkId) {
	const values = getServerLinkIdValues(serverLinkId);

	if (values.length === 1) {
		return values[0];
	}

	return { $in: values };
}
