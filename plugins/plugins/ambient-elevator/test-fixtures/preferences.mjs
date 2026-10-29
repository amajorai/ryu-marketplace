import { state } from "./state.mjs";

export function getPreference(target, key) {
	state.preferenceReads.push({ nodeUrl: target.url, key });
	return Promise.resolve(state.preferences.get(key) ?? null);
}

export function subscribePreferenceChanges(listener) {
	state.preferenceListeners.add(listener);
	return () => {
		state.preferenceListeners.delete(listener);
	};
}
