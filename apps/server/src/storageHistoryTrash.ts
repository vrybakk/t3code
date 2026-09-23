// @effect-diagnostics nodeBuiltinImport:off -- Foundation Trash must run on the server host, including when no Electron client exists.
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";

const runFile = NodeUtil.promisify(NodeChildProcess.execFile);

// Run on the environment host, not the Electron client: remote histories belong to that host.
const trashScript = `
ObjC.import('Foundation');
function run(argv) {
  var error = Ref();
  var url = $.NSURL.fileURLWithPath(argv[0]);
  if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError(url, null, error)) {
    throw new Error(error[0] ? ObjC.unwrap(error[0].localizedDescription) : 'Trash failed');
  }
}
`;

export function isHistoryTrashSupported(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export async function moveHistoryToTrash(
  filePath: string,
  platform: NodeJS.Platform,
): Promise<void> {
  if (!isHistoryTrashSupported(platform)) {
    throw new Error("Move to Trash is not available on this server's operating system.");
  }
  // Keep paths in argv so quotes and special characters never become script source.
  await runFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", trashScript, "--", filePath], {
    timeout: 30_000,
    maxBuffer: 16_384,
  });
}
