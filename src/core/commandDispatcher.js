// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import { logger } from "./logger.js";
import { parsePrefixedCommand } from "../utils/parseCommand.js";
export function bindCommandDispatcher({
	platformClient,
	prefix,
	setupService,
	linkService,
	infoService,
}) {
	platformClient.on("message", async (context) => {
		if (
			context.isSelfMessage ||
			context.isBotAuthor ||
			context.isWebhookMessage
		) {
			return;
		}
		const parsed = parsePrefixedCommand(context.content, prefix);
		if (!parsed) {
			return;
		}
		context.commandName = parsed.name;
		try {
			if (parsed.name === "setup") {
				await setupService.handleSetup(context, parsed.args[0]);
				return;
			}
			if (
				parsed.name === "finish-setup" ||
				parsed.name === "finishsetup"
			) {
				await setupService.handleFinishSetup(context, parsed.args[0]);
				return;
			}
			if (
				parsed.name === "link-channel" ||
				parsed.name === "linkchannel"
			) {
				await linkService.handleLinkChannel(
					context,
					parsed.args[0],
					parsed.args[1],
					parsed.args[2],
					parsed.args[3],
					parsed.args[4],
				);
				return;
			}
			if (parsed.name === "link-role" || parsed.name === "linkrole") {
				await linkService.handleLinkRole(
					context,
					parsed.args[0],
					parsed.args[1],
					parsed.args[2],
				);
				return;
			}
			if (parsed.name === "link-user" || parsed.name === "linkuser") {
				await linkService.handleLinkUser(
					context,
					parsed.args[0],
					parsed.args[1],
					parsed.args[2],
				);
				return;
			}
			if (parsed.name === "sync-user" || parsed.name === "syncuser") {
				await linkService.handleSyncUser(
					context,
					parsed.args[0],
					parsed.args[1],
				);
				return;
			}
			if (
				parsed.name === "resync-users" ||
				parsed.name === "resyncusers"
			) {
				await linkService.handleResyncUsers(context);
				return;
			}
			if (
				parsed.name === "unlink-channel" ||
				parsed.name === "unlinkchannel"
			) {
				await linkService.handleUnlinkChannel(
					context,
					parsed.args[0],
					parsed.args[1],
				);
				return;
			}
			if (
				parsed.name === "unlink-role" ||
				parsed.name === "unlinkrole"
			) {
				await linkService.handleUnlinkRole(
					context,
					parsed.args[0],
					parsed.args[1],
				);
				return;
			}
			if (
				parsed.name === "unlink-user" ||
				parsed.name === "unlinkuser"
			) {
				await linkService.handleUnlinkUser(
					context,
					parsed.args[0],
					parsed.args[1],
				);
				return;
			}
			if (
				parsed.name === "list-channels" ||
				parsed.name === "listchannels"
			) {
				await infoService.handleListChannels(context, parsed.args[0]);
				return;
			}
			if (parsed.name === "list-roles" || parsed.name === "listroles") {
				await infoService.handleListRoles(context, parsed.args[0]);
				return;
			}
			if (parsed.name === "list-users" || parsed.name === "listusers") {
				await infoService.handleListUsers(context, parsed.args[0]);
				return;
			}
			if (parsed.name === "help") {
				await infoService.handleHelp(context);
			}
		} catch (error) {
			logger.error("Command execution failed", {
				platform: context.platform,
				guildId: context.guildId,
				userId: context.userId,
				commandName: parsed.name,
				error: error.message,
				stack: error.stack,
			});
			await context.reply(
				"Something went wrong while processing that command.",
			);
		}
	});
}
