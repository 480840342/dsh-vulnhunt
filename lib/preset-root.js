import { fileURLToPath } from "node:url";
import { repairPreset } from "../scripts/repair-preset.mjs";
import { patchInstalledStageGate } from "../scripts/configure-redteam-suite.mjs";

export const inject = ["agentPresets"];

/**
 * DSH rc.6 replaces configured preset roots with its bundled root while it
 * boots a profile. Register this package-owned root after that service exists
 * so an installed bundle can expose its read-only preset without copying it
 * into the user's DSH home.
 */
export function apply(ctx) {
	try { repairPreset(); } catch (error) { console.warn(`Pentest preset UI repair: ${error.message}`); }
	try { patchInstalledStageGate(); } catch (error) { console.warn(`Pentest stage-gate repair: ${error.message}`); }
	const root = fileURLToPath(new URL("../preset/", import.meta.url));
	const presets = ctx.get("agentPresets");
	if (!presets.resolvedRoots.some((entry) => entry.path === root)) {
		presets.resolvedRoots.unshift({ path: root, trust: "system" });
	}
}
