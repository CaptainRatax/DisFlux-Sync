// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export class OperationGuard {
	constructor(ttlMs = 8000) {
		this.ttlMs = ttlMs;
		this.entries = new Map();
	}

	makeKey(platform, kind, guildId, entityId) {
		return `${platform}:${kind}:${guildId}:${entityId}`;
	}

	mark(platform, kind, guildId, entityId) {
		const key = this.makeKey(platform, kind, guildId, entityId);
		const expiresAt = Date.now() + this.ttlMs;

		this.entries.set(key, expiresAt);
		this.cleanup();
	}

	shouldSkip(platform, kind, guildId, entityId) {
		const key = this.makeKey(platform, kind, guildId, entityId);
		const expiresAt = this.entries.get(key);

		if (!expiresAt) {
			return false;
		}

		if (expiresAt <= Date.now()) {
			this.entries.delete(key);
			return false;
		}

		this.entries.delete(key);
		return true;
	}

	cleanup() {
		const now = Date.now();

		for (const [key, expiresAt] of this.entries.entries()) {
			if (expiresAt <= now) {
				this.entries.delete(key);
			}
		}
	}
}
