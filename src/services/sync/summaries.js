// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export function createRoleMembershipSummary() {
	return {
		checked: 0,
		differences: 0,
		changed: 0,
		skippedUnmanageableRoles: 0,
		failed: 0,
	};
}

export function createRoleMetadataSyncResult() {
	return {
		differences: 0,
		changed: 0,
		skippedDisabled: 0,
		skippedUnsupported: 0,
		skippedMissingSource: 0,
		skippedMissingTarget: 0,
		skippedUnmanageable: 0,
		failed: 0,
	};
}

export function createRoleMetadataSummary() {
	return {
		checked: 0,
		...createRoleMetadataSyncResult(),
	};
}

export function createChannelMetadataSyncResult() {
	return {
		differences: 0,
		changed: 0,
		skippedDisabled: 0,
		skippedUnsupported: 0,
		skippedMissingIds: 0,
		skippedMissingSource: 0,
		skippedMissingTarget: 0,
		skippedTypeMismatch: 0,
		skippedUnmanageable: 0,
		failed: 0,
	};
}

export function createChannelMetadataSummary() {
	return {
		checked: 0,
		roleLinksUsed: 0,
		...createChannelMetadataSyncResult(),
	};
}

export function addSyncResult(summary, result) {
	if (!result) {
		return;
	}

	for (const [key, value] of Object.entries(result)) {
		if (typeof summary[key] === "number") {
			summary[key] += Number(value) || 0;
		}
	}
}
