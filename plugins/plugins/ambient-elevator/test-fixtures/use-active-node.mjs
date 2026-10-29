import { state } from "./state.mjs";

export function useActiveNode() {
	return state.activeNode;
}
