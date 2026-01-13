import type { Command, CommandContext, ExecResult } from "../../types.js";

// Legacy command categories for built-in commands that don't have metadata yet
const LEGACY_CATEGORIES: Record<string, string[]> = {
  "File operations": [
    "ls",
    "cat",
    "head",
    "tail",
    "wc",
    "touch",
    "mkdir",
    "rm",
    "cp",
    "mv",
    "ln",
    "chmod",
    "stat",
    "readlink",
  ],
  "Text processing": [
    "grep",
    "sed",
    "awk",
    "sort",
    "uniq",
    "cut",
    "tr",
    "tee",
    "diff",
  ],
  Search: ["find"],
  "Navigation & paths": ["pwd", "basename", "dirname", "tree", "du"],
  "Environment & shell": [
    "echo",
    "printf",
    "env",
    "printenv",
    "export",
    "alias",
    "unalias",
    "history",
    "clear",
    "true",
    "false",
    "bash",
    "sh",
  ],
  "Data processing": ["xargs", "jq", "base64", "date"],
  Network: ["curl", "html-to-markdown"],
};

// Create reverse lookup map for legacy categories
const LEGACY_CMD_TO_CAT = new Map<string, string>();
for (const [cat, cmds] of Object.entries(LEGACY_CATEGORIES)) {
  for (const cmd of cmds) {
    LEGACY_CMD_TO_CAT.set(cmd, cat);
  }
}

// Order of categories for display
const CATEGORY_ORDER = [
  "File operations",
  "Text processing",
  "Search",
  "Navigation & paths",
  "Environment & shell",
  "Data processing",
  "Network",
  "Other",
];

function formatHelp(commands: Command[]): string {
  const lines: string[] = [];
  const categorized = new Map<string, string[]>();

  // Sort commands into categories
  for (const cmd of commands) {
    const category = cmd.category ?? LEGACY_CMD_TO_CAT.get(cmd.name) ?? "Other";

    if (!categorized.has(category)) {
      categorized.set(category, []);
    }
    categorized.get(category)?.push(cmd.name);
  }

  lines.push("Available commands:\n");

  // Display categories in defined order
  for (const cat of CATEGORY_ORDER) {
    if (categorized.has(cat)) {
      const cmds = categorized.get(cat)!.sort();
      lines.push(`  ${cat}:`);
      lines.push(`    ${cmds.join(", ")}\n`);
      categorized.delete(cat);
    }
  }

  // Display any remaining categories that weren't in the predefined order
  const remainingCats = Array.from(categorized.keys()).sort();
  for (const cat of remainingCats) {
    // "Other" is already handled in CATEGORY_ORDER, but if it wasn't empty and not in order, display it
    // Actually, "Other" is in CATEGORY_ORDER so it should be handled above.
    // This loop handles custom categories not in the standard list.
    const cmds = categorized.get(cat)!.sort();
    lines.push(`  ${cat}:`);
    lines.push(`    ${cmds.join(", ")}\n`);
  }

  lines.push("Use '<command> --help' for details on a specific command.");

  return `${lines.join("\n")}\n`;
}

export const helpCommand: Command = {
  name: "help",
  async execute(args: string[], ctx: CommandContext): Promise<ExecResult> {
    // Handle --help
    if (args.includes("--help") || args.includes("-h")) {
      return {
        stdout: `help - display available commands

Usage: help [command]

Options:
  -h, --help    Show this help message

If a command name is provided, shows help for that command.
Otherwise, lists all available commands.
`,
        stderr: "",
        exitCode: 0,
      };
    }

    // If a command name is provided, delegate to that command's --help
    if (args.length > 0 && ctx.exec) {
      const cmdName = args[0];
      return ctx.exec(`${cmdName} --help`, { cwd: ctx.cwd });
    }

    // List all available commands
    const commands = ctx.getRegisteredCommands?.() ?? [];
    return {
      stdout: formatHelp(commands),
      stderr: "",
      exitCode: 0,
    };
  },
};
