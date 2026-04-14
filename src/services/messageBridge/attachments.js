// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

export async function downloadRemoteFile(file) {
	if (!file?.url) {
		return null;
	}
	const response = await fetch(file.url);
	if (!response.ok) {
		return null;
	}
	const arrayBuffer = await response.arrayBuffer();
	return {
		name: file.filename ?? "file",
		description: file.description ?? null,
		contentType:
			file.contentType ??
			response.headers.get("content-type") ??
			"application/octet-stream",
		buffer: Buffer.from(arrayBuffer),
		originalUrl: file.url,
	};
}
