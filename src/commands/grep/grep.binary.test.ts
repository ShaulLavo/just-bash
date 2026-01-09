import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

describe("grep with binary files", () => {
  it("should find pattern in binary file", async () => {
    const env = new Bash({
      files: {
        "/binary.bin": new Uint8Array([
          0x66,
          0x6f,
          0x6f,
          0x0a, // foo\n
          0x62,
          0x61,
          0x72,
          0x0a, // bar\n
        ]),
      },
    });

    const result = await env.exec("grep foo /binary.bin");
    expect(result.stdout).toBe("Binary file /binary.bin matches\n");
    expect(result.exitCode).toBe(0);
  });

  it("should allow binary content with --text", async () => {
    const env = new Bash({
      files: {
        "/binary.bin": new Uint8Array([
          0x00,
          0x00,
          0x74,
          0x65,
          0x73,
          0x74,
          0x0a, // \0\0test\n
          0x00,
          0x66,
          0x6f,
          0x6f,
          0x0a, // \0foo\n
        ]),
      },
    });

    const result = await env.exec("grep --text test /binary.bin");
    expect(result.stdout).toContain("test");
    expect(result.exitCode).toBe(0);
  });

  it("should treat binary files as without-match with -I", async () => {
    const env = new Bash({
      files: {
        "/binary.bin": new Uint8Array([
          0x00,
          0x74,
          0x65,
          0x73,
          0x74,
        ]),
      },
    });

    const result = await env.exec("grep -I test /binary.bin");
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(1);
  });
});
