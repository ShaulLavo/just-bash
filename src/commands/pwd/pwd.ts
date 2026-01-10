import type { Command, CommandContext, ExecResult } from "../../types.js";

export const pwdCommand: Command = {
  name: "pwd",

  async execute(_args: string[], ctx: CommandContext): Promise<ExecResult> {
    return {
      stdout: `${ctx.cwd}\n`,
      stderr: "",
      exitCode: 0,
    };
  },
};
