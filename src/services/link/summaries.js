// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function formatUserSyncResultLines(syncResult) {
	if (!syncResult) {
		return [];
	}

	const membershipSummary = syncResult.membershipSummary ?? {};

	return [
		...(syncResult.skippedFluxerOwner
			? ["Sync skipped: `Fluxer owner cannot be synchronized`"]
			: []),
		...(syncResult.skippedDisabledServer
			? ["Sync skipped: `server link is disabled`"]
			: []),
		...(syncResult.skippedDisabledUser
			? ["Sync skipped: `user link is disabled`"]
			: []),
		`Member snapshots fetched: \`${!syncResult.skipped}\``,
		`Linked roles checked: \`${syncResult.roleLinkCount}\``,
		`Role membership differences: \`${membershipSummary.differences ?? 0}\``,
		`Role membership changes applied: \`${membershipSummary.changed ?? 0}\``,
		`Role membership changes failed: \`${membershipSummary.failed ?? 0}\``,
		`Role permission skips: \`${membershipSummary.skippedUnmanageableRoles ?? 0}\``,
	];
}

export function formatRoleMetadataSummaryLines(summary) {
	return [
		`Roles checked: \`${summary?.checked ?? 0}\``,
		`Role metadata differences: \`${summary?.differences ?? 0}\``,
		`Role metadata changes applied: \`${summary?.changed ?? 0}\``,
		`Role metadata changes failed: \`${summary?.failed ?? 0}\``,
		`Disabled server skips: \`${summary?.skippedDisabled ?? 0}\``,
		`Unsupported priorities skipped: \`${summary?.skippedUnsupported ?? 0}\``,
		`Missing source roles skipped: \`${summary?.skippedMissingSource ?? 0}\``,
		`Missing target roles skipped: \`${summary?.skippedMissingTarget ?? 0}\``,
		`Unmanageable target roles skipped: \`${summary?.skippedUnmanageable ?? 0}\``,
	];
}

export function formatChannelMetadataSummaryLines(summary) {
	return [
		`Channels checked: \`${summary?.checked ?? 0}\``,
		`Linked roles used for permission mapping: \`${summary?.roleLinksUsed ?? 0}\``,
		`Channel data or permission differences: \`${summary?.differences ?? 0}\``,
		`Channel changes applied: \`${summary?.changed ?? 0}\``,
		`Channel changes failed: \`${summary?.failed ?? 0}\``,
		`Disabled server skips: \`${summary?.skippedDisabled ?? 0}\``,
		`Unsupported priorities skipped: \`${summary?.skippedUnsupported ?? 0}\``,
		`Missing channel IDs skipped: \`${summary?.skippedMissingIds ?? 0}\``,
		`Missing source channels skipped: \`${summary?.skippedMissingSource ?? 0}\``,
		`Missing target channels skipped: \`${summary?.skippedMissingTarget ?? 0}\``,
		`Type mismatches skipped: \`${summary?.skippedTypeMismatch ?? 0}\``,
		`Unmanageable target channels skipped: \`${summary?.skippedUnmanageable ?? 0}\``,
	];
}
