// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

const FLUXER_API_ORIGIN = "https://api.fluxer.app";
const ALLOWED_FLUXER_API_ORIGINS = new Set([FLUXER_API_ORIGIN]);

export function parseFluxerApiConfig(rawBase) {
	const url = new URL(rawBase);
	if (!ALLOWED_FLUXER_API_ORIGINS.has(url.origin)) {
		throw new Error(`Unsupported Fluxer API origin: ${url.origin}`);
	}
	const segments = url.pathname.split("/").filter(Boolean);
	let version = "1";
	if (segments.length > 0) {
		const lastSegment = segments[segments.length - 1];
		if (/^v\d+$/i.test(lastSegment)) {
			version = lastSegment.slice(1);
			segments.pop();
		}
	}
	const apiBase =
		segments.length > 0
			? `${url.origin}/${segments.join("/")}`
			: url.origin;
	return { apiBase, version };
}

export function buildFluxerApiUrl(apiBase, apiVersion, path) {
	if (
		typeof path !== "string" ||
		!path.startsWith("/") ||
		path.startsWith("//") ||
		path.includes("\\")
	) {
		throw new Error("Fluxer API path must be a relative absolute path");
	}

	const normalizedApiBase = apiBase.endsWith("/") ? apiBase : `${apiBase}/`;
	const url = new URL(`v${apiVersion}${path}`, normalizedApiBase);
	if (!ALLOWED_FLUXER_API_ORIGINS.has(url.origin)) {
		throw new Error(`Unsupported Fluxer API request origin: ${url.origin}`);
	}

	return `${FLUXER_API_ORIGIN}${url.pathname}${url.search}`;
}
