// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

import {
	ApplicationIntegrationType,
	InteractionContextType,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";

const PLATFORM_CHOICES = [
	{ name: "Discord", value: "discord" },
	{ name: "Fluxer", value: "fluxer" },
];

const COMMAND_OPTION_ORDER = {
	"set-prefix": ["prefix"],
	setup: ["target-guild-id"],
	"finish-setup": ["code"],
	"link-channel": [
		"priority",
		"discord-channel-id",
		"fluxer-channel-id",
		"sync-bots",
		"sync-webhooks",
	],
	"link-role": ["priority", "discord-role-id", "fluxer-role-id"],
	"link-user": ["priority", "discord-user-id", "fluxer-user-id"],
	"link-me": ["code"],
	"set-announcement-channel": ["platform", "channel-id"],
	"sync-user": ["platform", "user-id"],
	"unlink-channel": ["platform", "channel-id"],
	"unlink-role": ["platform", "role-id"],
	"unlink-user": ["platform", "user-id"],
	"unlink-server": ["code"],
	"list-channels": ["page"],
	"list-roles": ["page"],
	"list-users": ["page"],
};

function createCommand({ name, description, adminOnly = true }) {
	const command = new SlashCommandBuilder()
		.setName(name)
		.setDescription(description)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

	if (adminOnly) {
		command.setDefaultMemberPermissions(
			PermissionsBitField.Flags.Administrator,
		);
	}

	return command;
}

function addPlatformOption(command, name, description) {
	return command.addStringOption((option) =>
		option
			.setName(name)
			.setDescription(description)
			.setRequired(true)
			.addChoices(...PLATFORM_CHOICES),
	);
}

function addOptionalPlatformOption(command, name, description) {
	return command.addStringOption((option) =>
		option
			.setName(name)
			.setDescription(description)
			.setRequired(false)
			.addChoices(...PLATFORM_CHOICES),
	);
}

function addPriorityOption(command) {
	return addPlatformOption(
		command,
		"priority",
		"Platform to trust when reconciliation is needed.",
	);
}

function getOptionValue(interaction, optionName) {
	return interaction.options.get(optionName)?.value;
}

export function getDiscordSlashCommandArgs(interaction) {
	const optionNames = COMMAND_OPTION_ORDER[interaction.commandName] ?? [];
	return optionNames.map((optionName) => getOptionValue(interaction, optionName));
}

export function buildDiscordSlashCommands() {
	const help = createCommand({
		name: "help",
		description: "Show the DisFlux Sync help menu.",
		adminOnly: false,
	});

	const setPrefix = createCommand({
		name: "set-prefix",
		description: "Change the shared prefix for the linked servers.",
	}).addStringOption((option) =>
		option
			.setName("prefix")
			.setDescription("Exactly one visible character.")
			.setMinLength(1)
			.setMaxLength(1)
			.setRequired(true),
	);

	const setup = createCommand({
		name: "setup",
		description: "Start linking this server and receive the setup code by DM.",
	}).addStringOption((option) =>
		option
			.setName("target-guild-id")
			.setDescription("Guild/server ID on the other platform.")
			.setRequired(true),
	);

	const finishSetup = createCommand({
		name: "finish-setup",
		description: "Complete a pending server link with a setup code.",
	}).addStringOption((option) =>
		option
			.setName("code")
			.setDescription("Setup code from your DM.")
			.setRequired(true),
	);

	const linkChannel = addPriorityOption(
		createCommand({
			name: "link-channel",
			description: "Create or update a linked channel pair.",
		}),
	)
		.addStringOption((option) =>
			option
				.setName("discord-channel-id")
				.setDescription("Discord channel ID, or auto to create one.")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("fluxer-channel-id")
				.setDescription("Fluxer channel ID, or auto to create one.")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option
				.setName("sync-bots")
				.setDescription("Whether to mirror other bot messages.")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option
				.setName("sync-webhooks")
				.setDescription("Whether to mirror webhook messages.")
				.setRequired(true),
		);

	const linkRole = addPriorityOption(
		createCommand({
			name: "link-role",
			description: "Create a linked role pair.",
		}),
	)
		.addStringOption((option) =>
			option
				.setName("discord-role-id")
				.setDescription("Discord role ID, or auto to create one.")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("fluxer-role-id")
				.setDescription("Fluxer role ID, or auto to create one.")
				.setRequired(true),
		);

	const linkUser = addPriorityOption(
		createCommand({
			name: "link-user",
			description: "Create a linked user pair.",
		}),
	)
		.addStringOption((option) =>
			option
				.setName("discord-user-id")
				.setDescription("Discord user ID.")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("fluxer-user-id")
				.setDescription("Fluxer user ID.")
				.setRequired(true),
		);

	const linkMe = createCommand({
		name: "link-me",
		description: "Start or complete your own user link.",
		adminOnly: false,
	}).addStringOption((option) =>
		option
			.setName("code")
			.setDescription("User link code from your DM.")
			.setRequired(false),
	);

	const setAnnouncementChannel = addOptionalPlatformOption(
		createCommand({
			name: "set-announcement-channel",
			description: "Set a server pair announcement channel.",
		}),
		"platform",
		"Platform side to update. Omit to use this server.",
	).addStringOption((option) =>
		option
			.setName("channel-id")
			.setDescription("Channel ID to use. Omit to use this channel.")
			.setRequired(false),
	);

	const syncUser = addPlatformOption(
		createCommand({
			name: "sync-user",
			description: "Manually resync one linked user.",
		}),
		"platform",
		"Platform side of the user ID.",
	).addStringOption((option) =>
		option
			.setName("user-id")
			.setDescription("User ID on the selected platform.")
			.setRequired(true),
	);

	const resyncUsers = createCommand({
		name: "resync-users",
		description: "Manually resync all linked users for this server pair.",
	});

	const resyncRoles = createCommand({
		name: "resync-roles",
		description: "Manually resync linked role metadata for this server pair.",
	});

	const resyncChannels = createCommand({
		name: "resync-channels",
		description:
			"Manually resync channel metadata and mapped role permission overwrites.",
	});

	const unlinkChannel = addPlatformOption(
		createCommand({
			name: "unlink-channel",
			description: "Remove a linked channel pair.",
		}),
		"platform",
		"Platform side of the channel ID.",
	).addStringOption((option) =>
		option
			.setName("channel-id")
			.setDescription("Channel ID on the selected platform.")
			.setRequired(true),
	);

	const unlinkRole = addPlatformOption(
		createCommand({
			name: "unlink-role",
			description: "Remove a linked role pair.",
		}),
		"platform",
		"Platform side of the role ID.",
	).addStringOption((option) =>
		option
			.setName("role-id")
			.setDescription("Role ID on the selected platform.")
			.setRequired(true),
	);

	const unlinkUser = addPlatformOption(
		createCommand({
			name: "unlink-user",
			description: "Remove a linked user pair.",
		}),
		"platform",
		"Platform side of the user ID.",
	).addStringOption((option) =>
		option
			.setName("user-id")
			.setDescription("User ID on the selected platform.")
			.setRequired(true),
	);

	const unlinkServer = createCommand({
		name: "unlink-server",
		description: "Start or confirm permanent removal of this server link.",
	}).addStringOption((option) =>
		option
			.setName("code")
			.setDescription("Server unlink confirmation code from your DM.")
			.setRequired(false),
	);

	const listChannels = createCommand({
		name: "list-channels",
		description: "List linked channels.",
	}).addIntegerOption((option) =>
		option
			.setName("page")
			.setDescription("Page number.")
			.setMinValue(1)
			.setRequired(false),
	);

	const listRoles = createCommand({
		name: "list-roles",
		description: "List linked roles.",
	}).addIntegerOption((option) =>
		option
			.setName("page")
			.setDescription("Page number.")
			.setMinValue(1)
			.setRequired(false),
	);

	const listUsers = createCommand({
		name: "list-users",
		description: "List linked users.",
	}).addIntegerOption((option) =>
		option
			.setName("page")
			.setDescription("Page number.")
			.setMinValue(1)
			.setRequired(false),
	);

	return [
		help,
		setPrefix,
		setup,
		finishSetup,
		linkChannel,
		linkRole,
		linkUser,
		linkMe,
		setAnnouncementChannel,
		syncUser,
		resyncUsers,
		resyncRoles,
		resyncChannels,
		unlinkChannel,
		unlinkRole,
		unlinkUser,
		unlinkServer,
		listChannels,
		listRoles,
		listUsers,
	].map((command) => command.toJSON());
}
