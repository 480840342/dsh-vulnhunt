//#region src/dsh-pentest/src/invariant.ts
const PACKAGE_NAME = "@howmp/dsh-pentest";
const DOMAIN_NAME = "pentest";
const GOAL_OWNED_TABLES = [
	"intents",
	"facts",
	"findings",
	"assets",
	"edges",
	"tasks",
	"coverage",
	"submissions"
];
const SOURCE_TABLE_OF_EDGE = {
	spawns: "goals",
	yields: "intents",
	derived_from: "facts",
	proves: "intents",
	parent: "assets"
};
const TARGET_TABLE_OF_EDGE = {
	spawns: "intents",
	yields: "facts",
	derived_from: "intents",
	proves: "findings",
	parent: "assets"
};
const name = "dsh-pentest-invariant";
const inject = ["invariants"];
const install = Object.assign((ctx, fail) => {
	ctx.on("domain/changed", (change) => {
		if (change.domain !== DOMAIN_NAME || change.operation !== "put") return;
		const domain = ctx.storage.form("domain").get(DOMAIN_NAME);
		if (domain === void 0) return fail(`domain/changed for '${DOMAIN_NAME}' emitted while that domain is not open`);
		if (change.table === "goals") {
			if (change.value.sessionId !== change.key) return fail(`goals row key '${change.key}' does not match its sessionId`);
			return;
		}
		if (!GOAL_OWNED_TABLES.includes(change.table)) return;
		const record = change.value;
		const goal = [...domain.table("goals").entries()].find(([, row]) => row.sessionId === record.sessionId);
		if (goal === void 0) return fail(`'${DOMAIN_NAME}'.'${change.table}'['${change.key}'] references unknown session '${record.sessionId}'`);
		const sameSession = (tableName, id) => {
			if (tableName === "goals") return goal[1].id === id;
			const row = domain.table(tableName).get(id);
			return row !== void 0 && row.sessionId === record.sessionId;
		};
		if (change.table === "tasks") {
			const task = record;
			if (task.intentId === void 0 || !sameSession("intents", task.intentId)) return fail(`'${DOMAIN_NAME}'.tasks['${change.key}'] references an unknown same-session intent '${task.intentId ?? ""}'`);
			return;
		}
		if (change.table === "coverage") {
			const item = record;
			if (item.assetId === void 0 || !sameSession("assets", item.assetId)) return fail(`'${DOMAIN_NAME}'.coverage['${change.key}'] references an unknown same-session asset '${item.assetId ?? ""}'`);
			if (item.intentId !== void 0 && !sameSession("intents", item.intentId)) return fail(`'${DOMAIN_NAME}'.coverage['${change.key}'] references an unknown same-session intent '${item.intentId}'`);
			return;
		}
		if (change.table === "submissions") {
			const submission = record;
			if (submission.intentId === void 0 || !sameSession("intents", submission.intentId)) return fail(`'${DOMAIN_NAME}'.submissions['${change.key}'] references an unknown same-session intent '${submission.intentId ?? ""}'`);
			return;
		}
		if (change.table === "edges") {
			const edge = record;
			if (!sameSession(SOURCE_TABLE_OF_EDGE[edge.kind], edge.sourceId)) return fail(`'${DOMAIN_NAME}'.edges['${change.key}'] ${edge.kind} source '${edge.sourceId}' is not a same-session ${SOURCE_TABLE_OF_EDGE[edge.kind]} row`);
			if (!sameSession(TARGET_TABLE_OF_EDGE[edge.kind], edge.targetId)) return fail(`'${DOMAIN_NAME}'.edges['${change.key}'] ${edge.kind} target '${edge.targetId}' is not a same-session ${TARGET_TABLE_OF_EDGE[edge.kind]} row`);
			return;
		}
		if (change.table === "findings") {
			const affectedAssetId = record.affectedAssetId;
			if (affectedAssetId !== void 0 && !sameSession("assets", affectedAssetId)) return fail(`'${DOMAIN_NAME}'.findings['${change.key}'] references unknown asset '${affectedAssetId}'`);
		}
	}, { global: true });
}, { inject: ["storage"] });
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
