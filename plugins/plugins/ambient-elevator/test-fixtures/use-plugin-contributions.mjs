import { state } from "./state.mjs";

export function usePluginContributions() {
	return { live_activities: state.contributions };
}
