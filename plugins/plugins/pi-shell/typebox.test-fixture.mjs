// Pi loads TypeBox as a closed runtime dependency. The extension only needs its
// schema constructors during registration, so behavior tests substitute a
// shape-only local fixture while executing all production tool code unchanged.
const schema = (kind, extra = {}) => ({ kind, ...extra });

export const Type = {
	Boolean: (extra) => schema("boolean", extra),
	Object: (properties, extra) => schema("object", { properties, ...extra }),
	Optional: (inner) => schema("optional", { inner }),
	String: (extra) => schema("string", extra),
};
