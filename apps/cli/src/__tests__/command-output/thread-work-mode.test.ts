import { describe, expect, it, vi } from "vitest";
import {
  collectLogLines,
  runCommand,
  setupCommandOutputTestEnvironment,
  stubServerApi,
  type CommandRegistrar,
} from "../helpers/command-output-harness.js";
import { registerThreadCommands } from "../../commands/thread/index.js";

describe("bb thread work-mode command output", () => {
  setupCommandOutputTestEnvironment();

  const register: CommandRegistrar = (program) =>
    registerThreadCommands(program, () => "http://server");

  it("enters work mode for the current thread", async () => {
    vi.stubEnv("BB_THREAD_ID", "thr_current");
    const workMode = vi.fn(async () => ({ delivered: 2 }));
    stubServerApi({ "v1.threads.:id.work-mode.$post": workMode });

    await runCommand(["thread", "work-mode", "enter"], register);

    expect(workMode).toHaveBeenCalledWith({
      param: { id: "thr_current" },
      json: { action: "enter" },
    });
    expect(collectLogLines(vi.mocked(console.log))).toEqual([
      "Thread: thr_current",
      "Work mode action: enter",
      "Delivered: 2",
    ]);
  });

  it("targets an explicit thread and prints stable JSON", async () => {
    const workMode = vi.fn(async () => ({ delivered: 1 }));
    stubServerApi({ "v1.threads.:id.work-mode.$post": workMode });

    await runCommand(
      ["thread", "work-mode", "toggle", "thr_explicit", "--json"],
      register,
    );

    expect(collectLogLines(vi.mocked(console.log))).toEqual([
      JSON.stringify(
        {
          threadId: "thr_explicit",
          action: "toggle",
          delivered: 1,
        },
        null,
        2,
      ),
    ]);
  });

  it("rejects an unknown action before sending a request", async () => {
    const workMode = vi.fn(async () => ({ delivered: 1 }));
    stubServerApi({ "v1.threads.:id.work-mode.$post": workMode });

    await expect(
      runCommand(["thread", "work-mode", "expand", "thr_explicit"], register),
    ).rejects.toThrow();
    expect(workMode).not.toHaveBeenCalled();
  });
});
