// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import dotenv from "dotenv";
import { resolveBotPrefix } from "../utils/prefix.js";

dotenv.config();

function requireEnv(name) {
	const value = process.env[name];

	if (!value || !value.trim()) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value.trim();
}

function parsePositiveInt(value, fallback) {
	const parsed = Number.parseInt(value ?? "", 10);

	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

const setupCodeLength = parsePositiveInt(process.env.SETUP_CODE_LENGTH, 10);
const setupCodeTtlMinutes = parsePositiveInt(
	process.env.SETUP_CODE_TTL_MINUTES,
	15,
);
const userLinkCodeLength = Math.max(
	10,
	parsePositiveInt(process.env.USER_LINK_CODE_LENGTH, 10),
);

export const env = {
	nodeEnv: process.env.NODE_ENV?.trim() || "development",

	mongodbUri: requireEnv("MONGODB_URI"),
	mongodbDbName: requireEnv("MONGODB_DB_NAME"),

	discordToken: requireEnv("DISCORD_TOKEN"),
	discordClientId: requireEnv("DISCORD_CLIENT_ID"),

	fluxerToken: requireEnv("FLUXER_TOKEN"),
	fluxerApiBase:
		process.env.FLUXER_API_BASE?.trim() || "https://api.fluxer.app/v1",

	botPrefix: resolveBotPrefix(process.env.BOT_PREFIX),
	setupCodeLength,
	setupCodeTtlMinutes,
	userLinkCodeLength,
	userLinkCodeTtlMinutes: parsePositiveInt(
		process.env.USER_LINK_CODE_TTL_MINUTES,
		setupCodeTtlMinutes,
	),
	messageLinkTtlDays: parsePositiveInt(process.env.MESSAGE_LINK_TTL_DAYS, 30),
	httpPort: Number(process.env.HTTP_PORT || 3000),
};
