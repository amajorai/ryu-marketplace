// Pi loads TypeBox as a closed runtime dependency. These tests exercise the
// extension's production control flow, so the schema builder is represented by
// a local shape-only fixture instead of resolving Pi's private dependency tree.
const schema = (kind, extra = {}) => ({ kind, ...extra });

export const Type = {
	Array: (item) => schema("array", { item }),
	Integer: (extra) => schema("integer", extra),
	Object: (properties, extra) => schema("object", { properties, ...extra }),
	Optional: (inner) => schema("optional", { inner }),
	String: (extra) => schema("string", extra),
};
