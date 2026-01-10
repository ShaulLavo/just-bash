import type { Command, CommandContext, ExecResult } from "../../types.js";
import { hasHelpFlag, showHelp } from "../help.js";

const chmodHelp = {
  name: "chmod",
  summary: "change file mode bits",
  usage: "chmod [OPTIONS] MODE FILE...",
  options: [
    "-R      change files recursively",
    "-v      output a diagnostic for every file processed",
    "    --help display this help and exit",
  ],
};

export const chmodCommand: Command = {
  name: "chmod",

  async execute(args: string[], ctx: CommandContext): Promise<ExecResult> {
    if (hasHelpFlag(args)) {
      return showHelp(chmodHelp);
    }

    if (args.length < 2) {
      return { stdout: "", stderr: "chmod: missing operand\n", exitCode: 1 };
    }

    let recursive = false;
    let verbose = false;
    let argIdx = 0;

    // Parse options
    while (argIdx < args.length && args[argIdx].startsWith("-")) {
      const arg = args[argIdx];
      if (arg === "-R" || arg === "--recursive") {
        recursive = true;
        argIdx++;
      } else if (arg === "-v" || arg === "--verbose") {
        verbose = true;
        argIdx++;
      } else if (arg === "--") {
        argIdx++;
        break;
      } else {
        // Mode might start with - for removing permissions, check if it looks like a mode
        if (/^[+-]?[rwxugo]+/.test(arg) || /^\d+$/.test(arg)) {
          break;
        }
        // Check for combined flags like -Rv
        if (/^-[Rv]+$/.test(arg)) {
          if (arg.includes("R")) recursive = true;
          if (arg.includes("v")) verbose = true;
          argIdx++;
          continue;
        }
        return {
          stdout: "",
          stderr: `chmod: invalid option -- '${arg.slice(1)}'\n`,
          exitCode: 1,
        };
      }
    }

    if (args.length - argIdx < 2) {
      return { stdout: "", stderr: "chmod: missing operand\n", exitCode: 1 };
    }

    const modeArg = args[argIdx];
    const files = args.slice(argIdx + 1);

    // Parse mode
    let modeValue: number;
    try {
      modeValue = parseMode(modeArg);
    } catch (_e) {
      return {
        stdout: "",
        stderr: `chmod: invalid mode: '${modeArg}'\n`,
        exitCode: 1,
      };
    }

    let stdout = "";
    let stderr = "";
    let anyError = false;

    for (const file of files) {
      const filePath = ctx.fs.resolvePath(ctx.cwd, file);
      try {
        await ctx.fs.chmod(filePath, modeValue);
        if (verbose) {
          stdout += `mode of '${file}' changed to ${modeValue.toString(8).padStart(4, "0")}\n`;
        }

        if (recursive) {
          // Check if directory
          const stat = await ctx.fs.stat(filePath);
          if (stat.isDirectory) {
            const recursiveOutput = await chmodRecursive(
              ctx,
              filePath,
              modeValue,
              verbose,
            );
            stdout += recursiveOutput;
          }
        }
      } catch {
        stderr += `chmod: cannot access '${file}': No such file or directory\n`;
        anyError = true;
      }
    }

    return { stdout, stderr, exitCode: anyError ? 1 : 0 };
  },
};

async function chmodRecursive(
  ctx: CommandContext,
  dir: string,
  mode: number,
  verbose: boolean,
): Promise<string> {
  let output = "";
  const entries = await ctx.fs.readdir(dir);
  for (const entry of entries) {
    const fullPath = dir === "/" ? `/${entry}` : `${dir}/${entry}`;
    await ctx.fs.chmod(fullPath, mode);
    if (verbose) {
      output += `mode of '${fullPath}' changed to ${mode.toString(8).padStart(4, "0")}\n`;
    }

    const stat = await ctx.fs.stat(fullPath);
    if (stat.isDirectory) {
      output += await chmodRecursive(ctx, fullPath, mode, verbose);
    }
  }
  return output;
}

function parseMode(modeStr: string): number {
  // Numeric mode (octal)
  if (/^[0-7]+$/.test(modeStr)) {
    return parseInt(modeStr, 8);
  }

  // Symbolic mode (simplified support)
  // Start with default permissions (rw-r--r--)
  let mode = 0o644;

  // Parse symbolic modes like u+x, g-w, o=r, a+x, +x
  const parts = modeStr.split(",");
  for (const part of parts) {
    const match = part.match(/^([ugoa]*)([+\-=])([rwxXst]*)$/);
    if (!match) {
      throw new Error(`Invalid mode: ${modeStr}`);
    }

    let who = match[1] || "a";
    const op = match[2];
    const perms = match[3];

    // Convert 'a' to 'ugo'
    if (who === "a" || who === "") {
      who = "ugo";
    }

    let permBits = 0;
    if (perms.includes("r")) permBits |= 0o4;
    if (perms.includes("w")) permBits |= 0o2;
    if (perms.includes("x") || perms.includes("X")) permBits |= 0o1;

    for (const w of who) {
      let shift = 0;
      if (w === "u") shift = 6;
      else if (w === "g") shift = 3;
      else if (w === "o") shift = 0;

      const bits = permBits << shift;

      if (op === "+") {
        mode |= bits;
      } else if (op === "-") {
        mode &= ~bits;
      } else if (op === "=") {
        // Clear the bits for this who, then set
        mode &= ~(0o7 << shift);
        mode |= bits;
      }
    }
  }

  return mode;
}
