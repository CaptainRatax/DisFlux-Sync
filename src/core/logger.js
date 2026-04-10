// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

function formatDate() {
	return new Date().toISOString();
}

function write(level, message, meta) {
	const payload = {
		time: formatDate(),
		level,
		message,
		...(meta ? { meta } : {}),
	};

	console.log(JSON.stringify(payload));
}

export const logger = {
	info(message, meta) {
		write("info", message, meta);
	},

	warn(message, meta) {
		write("warn", message, meta);
	},

	error(message, meta) {
		write("error", message, meta);
	},
};
