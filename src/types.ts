import type { IFileSystem } from "./fs/interface.js";
import type { ExecutionLimits } from "./limits.js";
import type { SecureFetch } from "./network/index.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** The final environment variables after execution (only set by BashEnv.exec) */
  env?: Record<string, string>;
}

/** Result from BashEnv.exec() - always includes env */
export interface BashExecResult extends ExecResult {
  env: Record<string, string>;
}

/** Options for exec calls within commands (internal API) */
export interface CommandExecOptions {
  /** Environment variables to merge into the exec state */
  env?: Record<string, string>;
  /**
   * Working directory for the exec.
   * Required to prevent bugs where subcommands run in the wrong directory.
   * Always pass `ctx.cwd` from the calling command's context.
   */
  cwd: string;
}

/**
 * Context provided to commands during execution.
 *
 * ## Field Availability
 *
 * **Always available (core fields):**
 * - `fs`, `cwd`, `env`, `stdin`
 *
 * **Available when running via BashEnv interpreter:**
 * - `exec` - For commands like `xargs`, `bash -c` that need to run subcommands
 * - `getRegisteredCommands` - For the `help` command to list available commands
 *
 * **Conditionally available based on configuration:**
 * - `fetch` - Only when `network` option is configured in BashEnv
 * - `sleep` - Only when a custom sleep function is provided (e.g., for testing)
 */
export interface CommandContext {
  /** Virtual filesystem interface for file operations */
  fs: IFileSystem;
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Standard input content */
  stdin: string;
  /**
   * Execution limits configuration.
   * Available when running commands via BashEnv interpreter.
   */
  limits?: Required<ExecutionLimits>;
  /**
   * Execute a subcommand (e.g., for `xargs`, `bash -c`).
   * Available when running commands via BashEnv interpreter.
   *
   * @param command - The command string to execute
   * @param options - Required options including `cwd` to prevent directory bugs
   */
  exec?: (command: string, options: CommandExecOptions) => Promise<ExecResult>;
  /**
   * Secure fetch function for network requests (e.g., for `curl`).
   * Only available when `network` option is configured in BashEnv.
   */
  fetch?: SecureFetch;
  /**
   * Returns all registered command objects.
   * Available when running commands via BashEnv interpreter.
   * Used by the `help` command.
   */
  getRegisteredCommands?: () => Command[];
  /**
   * Custom sleep implementation.
   * If provided, used instead of real setTimeout.
   * Useful for testing with mock clocks.
   */
  sleep?: (ms: number) => Promise<void>;
}

export interface Command {
  name: string;
  category?: string;
  description?: string;
  execute(args: string[], ctx: CommandContext): Promise<ExecResult>;
}

export type CommandRegistry = Map<string, Command>;

// Re-export IFileSystem for convenience
export type { IFileSystem };
