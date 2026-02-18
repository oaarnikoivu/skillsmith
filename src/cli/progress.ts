import type { Diagnostic } from "@/types";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
  gray: "\u001B[90m",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const PROGRESS_MARKERS = ["🚀", "🧩", "⚙️", "🔍", "🛠️", "🧠"] as const;

export type LogLevel = "success" | "warning" | "error";

function emojiEnabled(stream: NodeJS.WriteStream): boolean {
  return (
    stream.isTTY && process.env.SKILLSMITH_PLAIN !== "1" && process.env.SKILLSMITH_NO_EMOJI !== "1"
  );
}

function colorEnabled(stream: NodeJS.WriteStream): boolean {
  return stream.isTTY && process.env.NO_COLOR === undefined && process.env.SKILLSMITH_PLAIN !== "1";
}

function style(stream: NodeJS.WriteStream, text: string, ...codes: string[]): string {
  if (!colorEnabled(stream) || codes.length === 0) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

export function formatLevelLine(
  stream: NodeJS.WriteStream,
  level: LogLevel,
  message: string,
): string {
  if (!stream.isTTY || process.env.SKILLSMITH_PLAIN === "1") {
    return message;
  }

  const icon =
    level === "success" ? "✅" : level === "warning" ? "⚠️" : level === "error" ? "❌" : "";
  const color = level === "success" ? ANSI.green : level === "warning" ? ANSI.yellow : ANSI.red;
  const iconPrefix = emojiEnabled(stream) ? `${icon} ` : "";

  return style(stream, `${iconPrefix}${message}`, color, ANSI.bold);
}

export class ProgressRenderer {
  private readonly interactive =
    process.stderr.isTTY && process.env.SKILLSMITH_PLAIN !== "1" && process.env.TERM !== "dumb";

  private spinnerTimer: NodeJS.Timeout | undefined;
  private frameIndex = 0;
  private step = 0;
  private message = "";

  update(message: string): void {
    if (!this.interactive) {
      console.error(`${message}...`);
      return;
    }

    this.step += 1;
    this.message = message;
    this.ensureSpinner();
    this.render();
  }

  complete(status: "success" | "error", message: string): void {
    if (!this.interactive) {
      return;
    }

    this.stopSpinner();
    const line = formatLevelLine(process.stderr, status, message);
    process.stderr.write(`${line}\n`);
  }

  stop(): void {
    if (!this.interactive) {
      return;
    }

    this.stopSpinner();
  }

  private ensureSpinner(): void {
    if (this.spinnerTimer !== undefined) {
      return;
    }

    this.spinnerTimer = setInterval(() => {
      this.render();
    }, 90);

    if (typeof this.spinnerTimer.unref === "function") {
      this.spinnerTimer.unref();
    }
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== undefined) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    process.stderr.write("\r\u001B[2K");
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    this.frameIndex += 1;

    const marker = PROGRESS_MARKERS[this.step % PROGRESS_MARKERS.length];
    const coloredFrame = style(process.stderr, frame, ANSI.cyan, ANSI.bold);
    const line = `${coloredFrame} ${marker} ${this.message}`;

    process.stderr.write(`\r\u001B[2K${line}`);
  }
}

export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const codePrefix = diagnostic.code ? `[${diagnostic.code}] ` : "";
    const line = `${diagnostic.level.toUpperCase()}: ${codePrefix}${diagnostic.message}`;
    if (diagnostic.level === "error") {
      console.error(formatLevelLine(process.stderr, "error", line));
    } else {
      console.log(formatLevelLine(process.stdout, "warning", line));
    }
  }
}
