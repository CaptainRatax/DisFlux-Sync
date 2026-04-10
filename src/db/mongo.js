// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { MongoClient } from "mongodb";
import { logger } from "../core/logger.js";

export class MongoService {
	constructor(uri, dbName, options = {}) {
		this.uri = uri;
		this.dbName = dbName;
		this.messageLinkTtlDays = options.messageLinkTtlDays ?? 30;
		this.client = null;
		this.db = null;
		this.connected = false;
	}

	async connect() {
		this.client = new MongoClient(this.uri);
		await this.client.connect();

		this.db = this.client.db(this.dbName);

		await this.createIndexes();

		this.connected = true;

		logger.info("Connected to MongoDB", {
			dbName: this.dbName,
		});
	}

	async createIndexes() {
		await this.db.collection("server_links").createIndex(
			{ discordGuildId: 1, fluxerGuildId: 1 },
			{
				unique: true,
				name: "uniq_server_link_pair",
			},
		);

		await this.db.collection("pending_setups").createIndex(
			{ code: 1 },
			{
				unique: true,
				name: "uniq_pending_setup_code",
			},
		);

		await this.db.collection("pending_setups").createIndex(
			{ expiresAt: 1 },
			{
				expireAfterSeconds: 0,
				name: "ttl_pending_setup_expiration",
			},
		);

		await this.db.collection("channel_links").createIndex(
			{ serverLinkId: 1, discordChannelId: 1 },
			{
				unique: true,
				name: "uniq_channel_link_discord_side",
				partialFilterExpression: {
					discordChannelId: { $type: "string" },
				},
			},
		);

		await this.db.collection("channel_links").createIndex(
			{ serverLinkId: 1, fluxerChannelId: 1 },
			{
				unique: true,
				name: "uniq_channel_link_fluxer_side",
				partialFilterExpression: {
					fluxerChannelId: { $type: "string" },
				},
			},
		);

		await this.db.collection("role_links").createIndex(
			{ serverLinkId: 1, discordRoleId: 1 },
			{
				unique: true,
				name: "uniq_role_link_discord_side",
				partialFilterExpression: {
					discordRoleId: { $type: "string" },
				},
			},
		);

		await this.db.collection("role_links").createIndex(
			{ serverLinkId: 1, fluxerRoleId: 1 },
			{
				unique: true,
				name: "uniq_role_link_fluxer_side",
				partialFilterExpression: {
					fluxerRoleId: { $type: "string" },
				},
			},
		);

		await this.db.collection("user_links").createIndex(
			{ serverLinkId: 1, discordUserId: 1 },
			{
				unique: true,
				name: "uniq_user_link_discord_side",
				partialFilterExpression: {
					discordUserId: { $type: "string" },
				},
			},
		);

		await this.db.collection("user_links").createIndex(
			{ serverLinkId: 1, fluxerUserId: 1 },
			{
				unique: true,
				name: "uniq_user_link_fluxer_side",
				partialFilterExpression: {
					fluxerUserId: { $type: "string" },
				},
			},
		);

		await this.db.collection("message_links").createIndex(
			{ serverLinkId: 1, discordMessageId: 1 },
			{
				unique: true,
				name: "uniq_message_link_discord_side",
				partialFilterExpression: {
					discordMessageId: { $type: "string" },
				},
			},
		);

		await this.db.collection("message_links").createIndex(
			{ serverLinkId: 1, fluxerMessageId: 1 },
			{
				unique: true,
				name: "uniq_message_link_fluxer_side",
				partialFilterExpression: {
					fluxerMessageId: { $type: "string" },
				},
			},
		);

		await this.db.collection("message_links").createIndex(
			{ createdAt: 1 },
			{
				expireAfterSeconds: this.messageLinkTtlDays * 24 * 60 * 60,
				name: "ttl_message_links_created_at",
			},
		);
	}

	collection(name) {
		if (!this.db) {
			throw new Error("MongoDB is not connected");
		}

		return this.db.collection(name);
	}

	isConnected() {
		return this.connected;
	}

	async ping() {
		if (!this.db) {
			return false;
		}

		try {
			await this.db.command({ ping: 1 });
			return true;
		} catch {
			return false;
		}
	}

	async close() {
		if (this.client) {
			await this.client.close();
			logger.info("Disconnected from MongoDB");
		}

		this.connected = false;
		this.client = null;
		this.db = null;
	}
}
