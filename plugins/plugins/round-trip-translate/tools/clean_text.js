// Tool body for `round_trip.clean_text`, run in Core's Deno sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// with `input` (the call arguments) and `host` (the capability bridge) already
// bound, and the body `return`s the tool's result. A top-level `return` is
// therefore correct here and `export` is not.
//
// It removes characters a reader cannot see but a byte comparison can: zero-width
// and joiner characters, the byte-order mark, soft hyphens, bidirectional controls
// and Unicode tag characters. Unusual space characters become an ordinary space.
// It is the deterministic half of the round trip: a model asked to "remove the
// invisible characters" cannot see them, so this must not be left to the agent.

const primitiveStringAdmitted = (() => {
	const raw = input.text;
	try {
		return String.prototype.valueOf.call(raw) === raw;
	} catch {
		return false;
	}
})();
if (!primitiveStringAdmitted) {
	throw new Error("round_trip.clean_text: 'text' is required and must be a string");
}

// Removed outright. Joiners (U+200C, U+200D) are kept only when `keep_joiners`
// is true, because Persian, Indic scripts and emoji sequences depend on them.
const REMOVE = [
	[0x00ad, 0x00ad, "soft hyphen"],
	[0x034f, 0x034f, "combining grapheme joiner"],
	[0x061c, 0x061c, "bidi control"],
	[0x115f, 0x1160, "hangul filler"],
	[0x17b4, 0x17b5, "khmer inherent vowel"],
	[0x180e, 0x180e, "mongolian vowel separator"],
	[0x200b, 0x200b, "zero-width space"],
	[0x200c, 0x200d, "zero-width joiner"],
	[0x200e, 0x200f, "bidi control"],
	[0x202a, 0x202e, "bidi control"],
	[0x2060, 0x2064, "word joiner"],
	[0x2066, 0x2069, "bidi control"],
	[0x206a, 0x206f, "deprecated format character"],
	[0x3164, 0x3164, "hangul filler"],
	[0xfeff, 0xfeff, "byte-order mark"],
	[0xffa0, 0xffa0, "hangul filler"],
	[0xfff9, 0xfffb, "interlinear annotation"],
	[0x1d173, 0x1d17a, "musical format character"],
	[0xe0000, 0xe007f, "tag character"],
];
// Replaced with U+0020.
const SPACES = [
	[0x00a0, 0x00a0],
	[0x1680, 0x1680],
	[0x2000, 0x200a],
	[0x202f, 0x202f],
	[0x205f, 0x205f],
	[0x3000, 0x3000],
];

const keepJoiners = input.keep_joiners === true;

const classify = (codePoint) => {
	for (const [from, to, label] of REMOVE) {
		if (codePoint >= from && codePoint <= to) {
			if (keepJoiners && label === "zero-width joiner") {
				return null;
			}
			return label;
		}
	}
	return null;
};
const isOddSpace = (codePoint) =>
	SPACES.some(([from, to]) => codePoint >= from && codePoint <= to);

const removed = {};
let replacedSpaces = 0;
let output = "";
for (const character of input.text) {
	const codePoint = character.codePointAt(0);
	const label = classify(codePoint);
	if (label !== null) {
		removed[label] = (removed[label] ?? 0) + 1;
		continue;
	}
	if (isOddSpace(codePoint)) {
		replacedSpaces += 1;
		output += " ";
		continue;
	}
	output += character;
}

// Stable key order so identical input always yields an identical result object.
const removedSorted = {};
for (const key of Object.keys(removed).sort()) {
	removedSorted[key] = removed[key];
}
let removedTotal = 0;
for (const count of Object.values(removedSorted)) {
	removedTotal += count;
}

return {
	text: output,
	changed: output !== input.text,
	removed_total: removedTotal,
	removed: removedSorted,
	replaced_spaces: replacedSpaces,
};
