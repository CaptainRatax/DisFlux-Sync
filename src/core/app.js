// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { bindCommandDispatcher } from "./commandDispatcher.js";
import { MongoService } from "../db/mongo.js";
import { DiscordPlatform } from "../platforms/discord/client.js";
import { FluxerPlatform } from "../platforms/fluxer/client.js";
import { SetupService } from "../services/setupService.js";
import { LinkService } from "../services/linkService.js";
import { SyncService } from "../services/syncService.js";
import { MessageBridgeService } from "../services/messageBridgeService.js";
import { InfoService } from "../services/infoService.js";
import { PrefixService } from "../services/prefixService.js";
import { HttpServer } from "../api/server.js";

export class App {
	constructor() {
		this.mongo = new MongoService(env.mongodbUri, env.mongodbDbName, {
			messageLinkTtlDays: env.messageLinkTtlDays,
		});

		this.discord = new DiscordPlatform({
			token: env.discordToken,
			clientId: env.discordClientId,
		});
		this.fluxer = new FluxerPlatform({
			token: env.fluxerToken,
			apiBase: env.fluxerApiBase,
		});

		this.platforms = {
			discord: this.discord,
			fluxer: this.fluxer,
		};

		this.httpServer = new HttpServer({
			port: env.httpPort,
			mongo: this.mongo,
		});

		this.setupService = null;
		this.linkService = null;
		this.syncService = null;
		this.messageBridgeService = null;
		this.infoService = null;
		this.prefixService = null;
	}

	async start() {
		logger.info("Starting application");

		await this.mongo.connect();

		this.setupService = new SetupService({
			mongo: this.mongo,
			platforms: this.platforms,
			setupCodeLength: env.setupCodeLength,
			setupCodeTtlMinutes: env.setupCodeTtlMinutes,
			botPrefix: env.botPrefix,
		});

		this.syncService = new SyncService({
			mongo: this.mongo,
			platforms: this.platforms,
		});

		this.linkService = new LinkService({
			mongo: this.mongo,
			platforms: this.platforms,
			botPrefix: env.botPrefix,
			syncService: this.syncService,
		});

		this.messageBridgeService = new MessageBridgeService({
			mongo: this.mongo,
			platforms: this.platforms,
		});

		this.infoService = new InfoService({
			mongo: this.mongo,
			platforms: this.platforms,
			botPrefix: env.botPrefix,
		});

		this.prefixService = new PrefixService({
			mongo: this.mongo,
			platforms: this.platforms,
			defaultPrefix: env.botPrefix,
		});

		bindCommandDispatcher({
			platformClient: this.discord,
			setupService: this.setupService,
			linkService: this.linkService,
			infoService: this.infoService,
			prefixService: this.prefixService,
		});

		bindCommandDispatcher({
			platformClient: this.fluxer,
			setupService: this.setupService,
			linkService: this.linkService,
			infoService: this.infoService,
			prefixService: this.prefixService,
		});

		await this.httpServer.start();
		await this.discord.start();
		await this.fluxer.start();
		await this.syncService.start();
		await this.messageBridgeService.start();

		logger.info("Application started successfully");
	}

	async stop() {
		logger.info("Stopping application");

		await Promise.allSettled([
			Promise.resolve(this.httpServer.stop()),
			Promise.resolve(this.discord.stop()),
			Promise.resolve(this.fluxer.stop()),
			this.mongo.close(),
		]);

		logger.info("Application stopped");
	}
}
