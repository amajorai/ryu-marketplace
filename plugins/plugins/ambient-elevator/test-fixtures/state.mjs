export const state = {
	activeNode: "local-node",
	contributions: [],
	preferenceListeners: new Set(),
	preferenceReads: [],
	preferences: new Map(),
	working: true,
};

export function publishPreference(key, value) {
	for (const listener of state.preferenceListeners) {
		listener(key, value);
	}
}
