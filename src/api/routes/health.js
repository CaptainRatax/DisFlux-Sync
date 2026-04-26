// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { Router } from "express";

function serializeServiceHealth(serviceHealth) {
	const payload = {
		status: serviceHealth.status,
	};

	if (typeof serviceHealth.ready === "boolean") {
		payload.ready = serviceHealth.ready;
	}

	if (typeof serviceHealth.connected === "boolean") {
		payload.connected = serviceHealth.connected;
	}

	if (serviceHealth.lastError) {
		payload.lastError = serviceHealth.lastError;
	}

	return payload;
}

function computeAggregateStatus(services) {
	const statuses = Object.values(services).map((service) => service.status);

	if (statuses.every((status) => status === "up")) {
		return "ok";
	}

	if (statuses.includes("down")) {
		return "degraded";
	}

	if (statuses.includes("starting")) {
		return "starting";
	}

	return "degraded";
}

function mapSingleServiceStatus(service) {
	if (service.status === "up") {
		return "ok";
	}

	if (service.status === "starting") {
		return "starting";
	}

	return "down";
}

export function createHealthRouter({ mongo, discord, fluxer }) {
	const router = Router();

	async function getSnapshot() {
		const [mongoHealth, discordHealth, fluxerHealth] = await Promise.all([
			mongo.getHealthStatus(),
			Promise.resolve(discord.getHealthStatus()),
			Promise.resolve(fluxer.getHealthStatus()),
		]);

		const services = {
			discord: serializeServiceHealth(discordHealth),
			fluxer: serializeServiceHealth(fluxerHealth),
			database: serializeServiceHealth(mongoHealth),
		};

		return {
			status: computeAggregateStatus(services),
			timestamp: new Date().toISOString(),
			services,
		};
	}

	router.get("/health", async (_req, res) => {
		const snapshot = await getSnapshot();

		res.status(200).json(snapshot);
	});

	router.get("/health/bot", async (_req, res) => {
		const snapshot = await getSnapshot();
		const services = {
			discord: snapshot.services.discord,
			fluxer: snapshot.services.fluxer,
		};
		const status = computeAggregateStatus(services);

		res.status(status === "ok" ? 200 : 503).json({
			status,
			timestamp: snapshot.timestamp,
			services,
		});
	});

	router.get("/health/db", async (_req, res) => {
		const snapshot = await getSnapshot();
		const database = snapshot.services.database;
		const status = mapSingleServiceStatus(database);

		res.status(status === "ok" ? 200 : 503).json({
			status,
			timestamp: snapshot.timestamp,
			service: database,
		});
	});

	return router;
}
