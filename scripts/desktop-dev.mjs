import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ?? `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

await run(npmCommand, ["run", "desktop:prepare"]);
await run(npmCommand, ["run", "desktop:compile"]);
await run("electron", ["."]);
