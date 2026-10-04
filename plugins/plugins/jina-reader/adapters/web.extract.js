// Capability adapter for `web.extract / web.extract`, run in Core's plugin sandbox.
// Injected globals: `input`, `defaults`, `callTool(args)` and `callNamed(id, args)`.
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE.

if (typeof input.url !== "string") {
	throw new TypeError("web.extract requires an HTTP or HTTPS URL");
}
let target;
try {
	target = new URL(input.url);
} catch {
	throw new TypeError("web.extract requires an HTTP or HTTPS URL");
}
if (
	(target.protocol !== "http:" && target.protocol !== "https:") ||
	target.username ||
	target.password
) {
	throw new TypeError("web.extract requires an HTTP or HTTPS URL without credentials");
}
const host = target.hostname.toLowerCase();
const octets = host.split(".").map(Number);
const privateIpv4 =
	octets.length === 4 &&
	octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
	(octets[0] === 0 ||
		octets[0] === 10 ||
		octets[0] === 127 ||
		octets[0] >= 224 ||
		(octets[0] === 169 && octets[1] === 254) ||
		(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
		(octets[0] === 192 && octets[1] === 168));
if (
	privateIpv4 ||
	host === "localhost" ||
	host.endsWith(".localhost") ||
	host.endsWith(".local") ||
	host.endsWith(".internal") ||
	host === "[::]" ||
	host === "[::1]" ||
	host.startsWith("[fc") ||
	host.startsWith("[fd") ||
	host.startsWith("[::ffff:") ||
	host.startsWith("[fe80:")
) {
	throw new TypeError("web.extract cannot send a local or private URL to Jina Reader");
}

const res = await callTool({ url: target.href, Accept: "application/json" });
if (
	!res ||
	res.code !== 200 ||
	!res.data ||
	typeof res.data !== "object" ||
	(typeof res.data.warning === "string" &&
		/^Target URL returned error [45]\d\d/.test(res.data.warning)) ||
	typeof res.data.content !== "string"
) {
	return { raw: res };
}
return {
	results: [{
		url: typeof res.data.url === "string" ? res.data.url : target.href,
		title: typeof res.data.title === "string" ? res.data.title : null,
		content: res.data.content,
		raw: res.data,
	}],
};
