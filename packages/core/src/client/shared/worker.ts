import { ScramjetClient } from "@client/index";

function forwardWorkerTransport(
	client: ScramjetClient,
	target: Worker | MessagePort
) {
	const onMessage = (ev: MessageEvent) => {
		const data = ev.data;
		if (!data || data.$scramjet$workerTransport !== true || !data.port) return;
		target.removeEventListener("message", onMessage);
		const controller = client.serviceWorker?.controller;
		if (!controller) {
			console.error("Scramjet worker transport: page has no service worker");
			return;
		}
		controller.postMessage(
			{
				$sw$initRemoteTransport: {
					port: data.port,
					prefix: data.prefix,
				},
			},
			[data.port]
		);
	};
	target.addEventListener("message", onMessage);
}

export default function (client: ScramjetClient, _self: GlobalThis) {
	client.Proxy("Worker", {
		construct(ctx) {
			ctx.args[0] = client.rewriteUrl(ctx.args[0], {
				destination: "worker",
				isModule: ctx.args[1]?.type === "module",
			});

			const worker = ctx.call();
			forwardWorkerTransport(client, worker);
		},
	});

	// sharedworkers can only be constructed from window
	client.Proxy("SharedWorker", {
		construct(ctx) {
			const isModule =
				typeof ctx.args[1] === "object" && ctx.args[1]?.type === "module";

			ctx.args[0] = client.rewriteUrl(ctx.args[0], {
				destination: "sharedworker",
				isModule,
			});

			if (ctx.args[1] && typeof ctx.args[1] === "string")
				ctx.args[1] = `${client.url.origin}@${ctx.args[1]}`;

			if (ctx.args[1] && typeof ctx.args[1] === "object") {
				if (ctx.args[1].name) {
					ctx.args[1].name = `${client.url.origin}@${ctx.args[1].name}`;
				}
			}

			const worker = ctx.call();
			forwardWorkerTransport(client, worker.port);
		},
	});

	client.Proxy("Worklet.prototype.addModule", {
		apply(ctx) {
			if (ctx.args[0]) ctx.args[0] = client.rewriteUrl(ctx.args[0]);
		},
	});
}
