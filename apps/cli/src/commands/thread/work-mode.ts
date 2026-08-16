import { Command } from "commander";
import { threadWorkModeActionSchema } from "@bb/server-contract";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import {
  resolveContextThreadId,
  resolveExplicitIdFlag,
} from "../../context-env.js";
import { outputJson, printContextLabel, type ResolvedId } from "../helpers.js";

interface ThreadWorkModeCommandOptions {
  json?: boolean;
}

function resolveThreadWorkModeTarget(id: string | undefined): ResolvedId {
  const explicit = resolveExplicitIdFlag({
    flagName: "<threadId> argument",
    value: id,
  });
  if (explicit !== undefined) {
    return { id: explicit, source: "arg" };
  }
  const context = resolveContextThreadId();
  if (context !== undefined) {
    return { id: context, source: "env" };
  }
  throw new Error(
    "Missing thread ID. Pass <threadId> or run inside a BB thread.",
  );
}

export function registerWorkModeCommand(
  parent: Command,
  getUrl: () => string,
): void {
  parent
    .command("work-mode")
    .description("Enter, exit, or toggle Work mode for a thread in connected BB apps")
    .usage("<enter|exit|toggle> [id] [options]")
    .argument("<action>", "Work mode action: enter, exit, or toggle")
    .argument("[id]", "Thread ID. Omit inside a BB thread.")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(
        async (
          actionInput: string,
          id: string | undefined,
          opts: ThreadWorkModeCommandOptions,
        ) => {
          const workModeAction = threadWorkModeActionSchema.parse(actionInput);
          const target = resolveThreadWorkModeTarget(id);
          const result = await createCliBbSdk(
            getUrl(),
          ).threads.experimental_workMode({
            action: workModeAction,
            threadId: target.id,
          });
          if (
            outputJson(opts, {
              threadId: target.id,
              action: workModeAction,
              delivered: result.delivered,
            })
          ) {
            return;
          }
          printContextLabel(target, "Thread", "BB_THREAD_ID", opts);
          console.log(`Thread: ${target.id}`);
          console.log(`Work mode action: ${workModeAction}`);
          console.log(`Delivered: ${result.delivered}`);
        },
      ),
    );
}
