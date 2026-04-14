// DisFlux Sync - DisFlux Sync is a bridge bot that synchronizes Discord servers and Fluxer servers in real time.
// Copyright (C) 2026 CaptainRatax
// Licensed under the GNU Affero General Public License v3.0 or later
// See the LICENSE file for details.

function normalizeEmbedField(field) {
	if (!field?.name && !field?.value) {
		return null;
	}
	return {
		name: String(field.name ?? ""),
		value: String(field.value ?? ""),
		inline: Boolean(field.inline),
	};
}

function normalizeEmbedAuthor(author) {
	if (!author?.name) {
		return null;
	}
	return {
		name: String(author.name),
		...(author.url ? { url: author.url } : {}),
		...(author.icon_url ? { icon_url: author.icon_url } : {}),
		...(author.iconURL ? { icon_url: author.iconURL } : {}),
	};
}

function normalizeEmbedFooter(footer) {
	if (!footer?.text) {
		return null;
	}
	return {
		text: String(footer.text),
		...(footer.icon_url ? { icon_url: footer.icon_url } : {}),
		...(footer.iconURL ? { icon_url: footer.iconURL } : {}),
	};
}

function normalizeEmbedMedia(media) {
	if (!media?.url) {
		return null;
	}
	return { url: media.url };
}

export function normalizeEmbedsForBridge(embeds = []) {
	const result = [];
	for (const embed of embeds) {
		const normalized = {
			...(embed.title ? { title: String(embed.title) } : {}),
			...(embed.description
				? { description: String(embed.description) }
				: {}),
			...(embed.url ? { url: embed.url } : {}),
			...(typeof embed.color === "number" ? { color: embed.color } : {}),
			...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
		};
		const author = normalizeEmbedAuthor(embed.author);
		if (author) {
			normalized.author = author;
		}
		const footer = normalizeEmbedFooter(embed.footer);
		if (footer) {
			normalized.footer = footer;
		}
		const image = normalizeEmbedMedia(embed.image);
		if (image) {
			normalized.image = image;
		}
		const thumbnail = normalizeEmbedMedia(embed.thumbnail);
		if (thumbnail) {
			normalized.thumbnail = thumbnail;
		}
		const fields = (embed.fields ?? [])
			.map(normalizeEmbedField)
			.filter(Boolean);
		if (fields.length > 0) {
			normalized.fields = fields;
		}
		if (Object.keys(normalized).length > 0) {
			result.push(normalized);
		}
	}
	return result.slice(0, 10);
}
