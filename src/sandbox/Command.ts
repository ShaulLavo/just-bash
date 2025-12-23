import { BashEnv } from "../BashEnv.js";
import { ExecResult } from "../types.js";

export interface OutputMessage {
  type: "stdout" | "stderr";
  data: string;
  timestamp: Date;
}

export class Command {
  readonly cmdId: string;
  readonly cwd: string;
  readonly startedAt: Date;
  exitCode: number | undefined;

  private bashEnv: BashEnv;
  private cmdLine: string;
  private resultPromise: Promise<ExecResult>;
  private _stdout: string = "";
  private _stderr: string = "";
  private completed = false;

  constructor(bashEnv: BashEnv, cmdLine: string, cwd: string) {
    this.cmdId = crypto.randomUUID();
    this.cwd = cwd;
    this.startedAt = new Date();
    this.bashEnv = bashEnv;
    this.cmdLine = cmdLine;

    // Start execution immediately
    this.resultPromise = this.execute();
  }

  private async execute(): Promise<ExecResult> {
    const result = await this.bashEnv.exec(this.cmdLine);
    this._stdout = result.stdout;
    this._stderr = result.stderr;
    this.exitCode = result.exitCode;
    this.completed = true;
    return result;
  }

  async *logs(): AsyncGenerator<OutputMessage, void, unknown> {
    const result = await this.resultPromise;

    // For BashEnv, we don't have true streaming, so emit all at once
    if (result.stdout) {
      yield { type: "stdout", data: result.stdout, timestamp: new Date() };
    }
    if (result.stderr) {
      yield { type: "stderr", data: result.stderr, timestamp: new Date() };
    }
  }

  async wait(): Promise<CommandFinished> {
    await this.resultPromise;
    return this as CommandFinished;
  }

  async output(): Promise<string> {
    const result = await this.resultPromise;
    return result.stdout + result.stderr;
  }

  async stdout(): Promise<string> {
    const result = await this.resultPromise;
    return result.stdout;
  }

  async stderr(): Promise<string> {
    const result = await this.resultPromise;
    return result.stderr;
  }

  async kill(): Promise<void> {
    // For BashEnv synchronous execution, this is a no-op
    // Commands complete immediately in the simulation
  }
}

export interface CommandFinished extends Command {
  exitCode: number; // Guaranteed to be defined
}
