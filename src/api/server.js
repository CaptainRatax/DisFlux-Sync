// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import express from "express";
import { logger } from "../core/logger.js";
import { createHealthRouter } from "./routes/health.js";

export class HttpServer {
	constructor({ port, mongo, discord, fluxer }) {
		this.port = port;
		this.mongo = mongo;
		this.discord = discord;
		this.fluxer = fluxer;
		this.app = express();
		this.server = null;

		this.configureMiddleware();
		this.configureRoutes();
	}

	configureMiddleware() {
		this.app.use(express.json());
	}

	configureRoutes() {
		this.app.use(
			createHealthRouter({
				mongo: this.mongo,
				discord: this.discord,
				fluxer: this.fluxer,
			}),
		);
	}

	async start() {
		if (this.server) return;

		await new Promise((resolve, reject) => {
			this.server = this.app.listen(this.port, () => {
				logger.info("HTTP server started", { port: this.port });
				resolve();
			});

			this.server.on("error", reject);
		});
	}

	async stop() {
		if (!this.server) return;

		await new Promise((resolve, reject) => {
			this.server.close((error) => {
				if (error) return reject(error);

				logger.info("HTTP server stopped");
				this.server = null;
				resolve();
			});
		});
	}
}
