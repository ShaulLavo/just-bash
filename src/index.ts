export { BashEnv, BashEnvOptions } from './BashEnv.js';
export { VirtualFs } from './fs.js';
export { Command, CommandContext, ExecResult, IFileSystem } from './types.js';
export type {
  FsEntry,
  FileEntry,
  DirectoryEntry,
  FsStat,
  MkdirOptions,
  RmOptions,
  CpOptions,
  FileSystemFactory,
} from './fs-interface.js';

// Vercel Sandbox API compatible exports
export {
  Sandbox,
  Command as SandboxCommand,
  type CommandFinished as SandboxCommandFinished,
  type SandboxOptions,
  type WriteFilesInput,
  type OutputMessage,
} from './sandbox/index.js';
