// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { App } from "./core/app.js";
import { logger } from "./core/logger.js";

const app = new App();

async function main() {
	try {
		await app.start();
	} catch (error) {
		logger.error("Fatal startup error", {
			error: error.message,
			stack: error.stack,
		});

		process.exit(1);
	}
}

process.on("SIGINT", async () => {
	await app.stop();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	await app.stop();
	process.exit(0);
});

main();
