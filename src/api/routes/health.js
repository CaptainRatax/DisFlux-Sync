// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { Router } from "express";

export function createHealthRouter({ mongo }) {
	const router = Router();

	router.get("/health", async (_req, res) => {
		const mongoOk = await mongo.ping();

		const status = mongoOk ? "ok" : "degraded";

		res.status(mongoOk ? 200 : 503).json({
			status,
			timestamp: new Date().toISOString(),
			services: {
				mongo: mongoOk ? "up" : "down",
			},
		});
	});

	return router;
}
