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
import { LinkLifecycleService } from "../services/linkLifecycleService.js";
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
			discord: this.discord,
			fluxer: this.fluxer,
		});

		this.setupService = null;
		this.linkService = null;
		this.syncService = null;
		this.messageBridgeService = null;
		this.linkLifecycleService = null;
		this.infoService = null;
		this.prefixService = null;
		this.servicesInitialized = false;
		this.commandDispatchersBound = false;
	}

	async start() {
		logger.info("Starting application");

		await this.httpServer.start();

		const dataLayerReady = await this.initializeDataLayer();
		if (!dataLayerReady) {
			logger.warn(
				"Application started in API-only mode because MongoDB is unavailable",
			);
			return;
		}

		const [discordStarted, fluxerStarted] = await Promise.all([
			this.startPlatform("discord", this.discord),
			this.startPlatform("fluxer", this.fluxer),
		]);

		if (!discordStarted || !fluxerStarted) {
			logger.warn(
				"Application started with API available, but bot services are degraded",
				{
					discordStarted,
					fluxerStarted,
				},
			);
			return;
		}

		try {
			await this.linkLifecycleService.start();
			await this.linkLifecycleService.reconcileAll();
			await this.syncService.start();
			await this.messageBridgeService.start();
		} catch (error) {
			logger.error("Failed to start bot runtime services", {
				error: error.message,
				stack: error.stack,
			});
			return;
		}

		logger.info("Application started successfully");
	}

	async initializeDataLayer() {
		try {
			await this.mongo.connect();
			this.initializeServices();
			this.bindCommandDispatchers();
			return true;
		} catch (error) {
			logger.error("Failed to initialize MongoDB-backed services", {
				error: error.message,
				stack: error.stack,
			});

			await Promise.allSettled([this.mongo.close()]);
			return false;
		}
	}

	initializeServices() {
		if (this.servicesInitialized) {
			return;
		}

		this.setupService = new SetupService({
			mongo: this.mongo,
			platforms: this.platforms,
			setupCodeLength: env.setupCodeLength,
			setupCodeTtlMinutes: env.setupCodeTtlMinutes,
			botPrefix: env.botPrefix,
		});

		this.linkLifecycleService = new LinkLifecycleService({
			mongo: this.mongo,
			platforms: this.platforms,
			disposeAfterDays: env.linkDisposeAfterDays,
			disableGraceMs: env.serverLinkDisableGraceMinutes * 60 * 1000,
		});

		this.syncService = new SyncService({
			mongo: this.mongo,
			platforms: this.platforms,
			lifecycleService: this.linkLifecycleService,
		});

		this.linkService = new LinkService({
			mongo: this.mongo,
			platforms: this.platforms,
			botPrefix: env.botPrefix,
			syncService: this.syncService,
			lifecycleService: this.linkLifecycleService,
			userLinkCodeLength: env.userLinkCodeLength,
			userLinkCodeTtlMinutes: env.userLinkCodeTtlMinutes,
			serverUnlinkCodeLength: env.serverUnlinkCodeLength,
			serverUnlinkCodeTtlMinutes: env.serverUnlinkCodeTtlMinutes,
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

		this.servicesInitialized = true;
	}

	bindCommandDispatchers() {
		if (this.commandDispatchersBound) {
			return;
		}

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

		this.commandDispatchersBound = true;
	}

	async startPlatform(name, platform) {
		try {
			await platform.start();
			return true;
		} catch (error) {
			logger.error(`Failed to start ${name} platform`, {
				error: error.message,
				stack: error.stack,
			});
			return false;
		}
	}

	async stop() {
		logger.info("Stopping application");

		await Promise.allSettled([
			Promise.resolve(this.httpServer.stop()),
			Promise.resolve(this.linkLifecycleService?.stop()),
			Promise.resolve(this.discord.stop()),
			Promise.resolve(this.fluxer.stop()),
			this.mongo.close(),
		]);

		logger.info("Application stopped");
	}
}
