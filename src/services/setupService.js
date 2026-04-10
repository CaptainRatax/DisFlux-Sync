// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import {
	generateSetupCode,
	normalizeSetupCode,
	formatSetupCode,
} from "../utils/setupCode.js";

function getGuildFieldName(platform) {
	if (platform === "discord") {
		return "discordGuildId";
	}

	if (platform === "fluxer") {
		return "fluxerGuildId";
	}

	throw new Error(`Unsupported platform: ${platform}`);
}

function getOtherPlatform(platform) {
	if (platform === "discord") {
		return "fluxer";
	}

	if (platform === "fluxer") {
		return "discord";
	}

	throw new Error(`Unsupported platform: ${platform}`);
}

export class SetupService {
	constructor({
		mongo,
		platforms,
		setupCodeLength,
		setupCodeTtlMinutes,
		botPrefix,
	}) {
		this.pendingSetups = mongo.collection("pending_setups");
		this.serverLinks = mongo.collection("server_links");
		this.platforms = platforms;
		this.setupCodeLength = setupCodeLength;
		this.setupCodeTtlMinutes = setupCodeTtlMinutes;
		this.botPrefix = botPrefix;
	}

	async handleSetup(context, targetGuildId) {
		if (!context.guildId) {
			await context.reply(
				"This command can only be used inside a server.",
			);
			return;
		}

		const normalizedTargetGuildId = String(targetGuildId ?? "").trim();

		if (!normalizedTargetGuildId) {
			await context.reply(
				`Usage: ${this.botPrefix}setup <target-guild-id>`,
			);
			return;
		}

		const sourcePlatform = context.platform;
		const targetPlatform = getOtherPlatform(sourcePlatform);
		const sourceGuildId = context.guildId;

		const sourceClient = this.platforms[sourcePlatform];
		const targetClient = this.platforms[targetPlatform];

		const userIsAdmin = await sourceClient.userHasAdministrator(
			sourceGuildId,
			context.userId,
		);
		if (!userIsAdmin) {
			await context.reply(
				"Only server administrators can use this command.",
			);
			return;
		}

		const botIsAdmin =
			await sourceClient.botHasAdministrator(sourceGuildId);
		if (!botIsAdmin) {
			await context.reply(
				"I need administrator permissions in this server before setup can continue.",
			);
			return;
		}

		const sourceAlreadyLinked = await this.findServerLinkForGuild(
			sourcePlatform,
			sourceGuildId,
		);
		if (sourceAlreadyLinked) {
			await context.reply(
				"This server is already linked to another server.",
			);
			return;
		}

		const targetAlreadyLinked = await this.findServerLinkForGuild(
			targetPlatform,
			normalizedTargetGuildId,
		);
		if (targetAlreadyLinked) {
			await context.reply(
				"The target server is already linked to another server.",
			);
			return;
		}

		const targetGuild = await targetClient.fetchGuildSummary(
			normalizedTargetGuildId,
		);
		if (!targetGuild) {
			await context.reply(
				"I could not find that target server. Make sure the bot is added there and that the server ID is correct.",
			);
			return;
		}

		await this.pendingSetups.deleteMany({
			sourcePlatform: { $eq: sourcePlatform },
			sourceGuildId: { $eq: sourceGuildId },
			targetPlatform: { $eq: targetPlatform },
			targetGuildId: { $eq: normalizedTargetGuildId },
		});

		const code = await this.createUniqueCode();
		const now = new Date();
		const expiresAt = new Date(
			now.getTime() + this.setupCodeTtlMinutes * 60 * 1000,
		);

		await this.pendingSetups.insertOne({
			code,
			sourcePlatform,
			sourceGuildId,
			targetPlatform,
			targetGuildId: normalizedTargetGuildId,
			sourceRequestedByUserId: context.userId,
			createdAt: now,
			expiresAt,
		});

		await context.reply(
			[
				`Setup code created for ${targetPlatform}.`,
				`Code: \`${formatSetupCode(code)}\``,
				`Run \`${this.botPrefix}finish-setup ${formatSetupCode(code)}\` inside the target server.`,
				`This code expires in ${this.setupCodeTtlMinutes} minutes.`,
			].join("\n"),
		);
	}

	async handleFinishSetup(context, codeInput) {
		if (!context.guildId) {
			await context.reply(
				"This command can only be used inside a server.",
			);
			return;
		}

		const code = normalizeSetupCode(codeInput);

		if (!code) {
			await context.reply(`Usage: ${this.botPrefix}finish-setup <code>`);
			return;
		}

		const pending = await this.pendingSetups.findOne({
			code: { $eq: code },
		});

		if (!pending) {
			await context.reply("That setup code is invalid or has expired.");
			return;
		}

		if (context.platform !== pending.targetPlatform) {
			await context.reply(
				`This setup code must be completed from ${pending.targetPlatform}.`,
			);
			return;
		}

		if (context.guildId !== pending.targetGuildId) {
			await context.reply(
				"This setup code is not meant for this server.",
			);
			return;
		}

		const currentClient = this.platforms[context.platform];
		const sourceClient = this.platforms[pending.sourcePlatform];

		const currentUserIsAdmin = await currentClient.userHasAdministrator(
			context.guildId,
			context.userId,
		);
		if (!currentUserIsAdmin) {
			await context.reply(
				"Only server administrators can complete setup.",
			);
			return;
		}

		const currentBotIsAdmin = await currentClient.botHasAdministrator(
			context.guildId,
		);
		if (!currentBotIsAdmin) {
			await context.reply(
				"I need administrator permissions in this server before setup can be completed.",
			);
			return;
		}

		const sourceGuildStillExists = await sourceClient.fetchGuildSummary(
			pending.sourceGuildId,
		);
		if (!sourceGuildStillExists) {
			await this.pendingSetups.deleteOne({ _id: pending._id });
			await context.reply(
				"The original server is no longer available to the bot. The setup code was discarded.",
			);
			return;
		}

		const sourceBotIsAdmin = await sourceClient.botHasAdministrator(
			pending.sourceGuildId,
		);
		if (!sourceBotIsAdmin) {
			await context.reply(
				"I no longer have administrator permissions in the original server.",
			);
			return;
		}

		const sourceAlreadyLinked = await this.findServerLinkForGuild(
			pending.sourcePlatform,
			pending.sourceGuildId,
		);
		if (sourceAlreadyLinked) {
			await this.pendingSetups.deleteOne({ _id: pending._id });
			await context.reply(
				"The original server is already linked. The setup code was discarded.",
			);
			return;
		}

		const targetAlreadyLinked = await this.findServerLinkForGuild(
			pending.targetPlatform,
			pending.targetGuildId,
		);
		if (targetAlreadyLinked) {
			await this.pendingSetups.deleteOne({ _id: pending._id });
			await context.reply(
				"This server is already linked. The setup code was discarded.",
			);
			return;
		}

		const discordGuildId =
			pending.sourcePlatform === "discord"
				? pending.sourceGuildId
				: pending.targetGuildId;

		const fluxerGuildId =
			pending.sourcePlatform === "fluxer"
				? pending.sourceGuildId
				: pending.targetGuildId;

		await this.serverLinks.insertOne({
			discordGuildId,
			fluxerGuildId,
			createdAt: new Date(),
		});

		await this.pendingSetups.deleteOne({ _id: pending._id });

		await context.reply(
			[
				"Setup completed successfully.",
				`Discord server ID: \`${discordGuildId}\``,
				`Fluxer server ID: \`${fluxerGuildId}\``,
				"You can now move on to channel, role, and user link commands.",
			].join("\n"),
		);
	}

	async findServerLinkForGuild(platform, guildId) {
		const fieldName = getGuildFieldName(platform);
		return this.serverLinks.findOne({ [fieldName]: { $eq: guildId } });
	}

	async createUniqueCode() {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const code = generateSetupCode(this.setupCodeLength);
			const existing = await this.pendingSetups.findOne({
				code: { $eq: code },
			});

			if (!existing) {
				return code;
			}
		}

		throw new Error("Failed to generate a unique setup code.");
	}
}
