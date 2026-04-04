import { randomUUID } from "crypto";
import { createInterface } from "readline";
import { connect, type TLSSocket } from "tls";

export type EmailDeliveryMode = "dry-run" | "resend" | "gmail-smtp";

export interface OutboundBrokerEmail {
  brokerName: string;
  requestId: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface EmailDeliveryResult {
  mode: EmailDeliveryMode;
  providerMessageId: string;
}

export async function deliverBrokerEmail(
  message: OutboundBrokerEmail
): Promise<EmailDeliveryResult> {
  const mode = getEmailDeliveryMode();

  if (mode === "dry-run") {
    const providerMessageId = `dryrun_${randomUUID()}`;
    logEmailEvent("accepted", {
      brokerName: message.brokerName,
      mode,
      providerMessageId,
      requestId: message.requestId,
    });
    return { mode, providerMessageId };
  }

  if (mode === "gmail-smtp") {
    return sendViaGmailSmtp(message);
  }

  return sendViaResend(message);
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  if (process.env.EMAIL_DELIVERY_MODE === "resend") return "resend";
  if (process.env.EMAIL_DELIVERY_MODE === "gmail-smtp") return "gmail-smtp";
  return "dry-run";
}

async function sendViaResend(
  message: OutboundBrokerEmail
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is required when EMAIL_DELIVERY_MODE=resend");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    const errorMessage = extractProviderError(payload) || `Resend request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const payload = await response.json() as { id?: string };
  const providerMessageId = payload.id;
  if (!providerMessageId) {
    throw new Error("Resend accepted the request without returning a message id");
  }

  logEmailEvent("accepted", {
    brokerName: message.brokerName,
    mode: "resend",
    providerMessageId,
    requestId: message.requestId,
  });

  return { mode: "resend", providerMessageId };
}

async function sendViaGmailSmtp(
  message: OutboundBrokerEmail
): Promise<EmailDeliveryResult> {
  const gmailUser = process.env.GMAIL_SMTP_USER;
  const gmailAppPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  const from = process.env.EMAIL_FROM || gmailUser;

  if (!gmailUser) {
    throw new Error("GMAIL_SMTP_USER is required when EMAIL_DELIVERY_MODE=gmail-smtp");
  }
  if (!gmailAppPassword) {
    throw new Error(
      "GMAIL_SMTP_APP_PASSWORD is required when EMAIL_DELIVERY_MODE=gmail-smtp"
    );
  }
  if (!from) {
    throw new Error("EMAIL_FROM is required when EMAIL_DELIVERY_MODE=gmail-smtp");
  }

  const client = await createSmtpClient("smtp.gmail.com", 465);

  try {
    await client.expect([220], "SMTP greeting");
    await client.sendCommand("EHLO localhost", [250], "EHLO");
    await client.sendCommand("AUTH LOGIN", [334], "AUTH LOGIN");
    await client.sendCommand(toBase64(gmailUser), [334], "SMTP username");
    await client.sendCommand(
      toBase64(gmailAppPassword),
      [235],
      "SMTP app password"
    );
    await client.sendCommand(
      `MAIL FROM:<${sanitizeAddress(from)}>`,
      [250],
      "MAIL FROM"
    );
    await client.sendCommand(
      `RCPT TO:<${sanitizeAddress(message.to)}>`,
      [250, 251],
      "RCPT TO"
    );
    await client.sendCommand("DATA", [354], "DATA");

    const dataResponse = await client.sendData(
      buildSmtpMessage({
        from,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        to: message.to,
      })
    );

    const providerMessageId = extractSmtpProviderMessageId(dataResponse);

    logEmailEvent("accepted", {
      brokerName: message.brokerName,
      mode: "gmail-smtp",
      providerMessageId,
      requestId: message.requestId,
    });

    await client.sendCommand("QUIT", [221], "QUIT");

    return { mode: "gmail-smtp", providerMessageId };
  } finally {
    client.close();
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function createSmtpClient(host: string, port: number) {
  const socket = connect({
    host,
    port,
    servername: host,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", () => resolve());
    socket.once("error", reject);
  });

  socket.setTimeout(30000);

  const reader = createSmtpResponseReader(socket);

  return {
    close() {
      socket.destroy();
    },
    async expect(expectedCodes: number[], label: string) {
      const response = await reader.readResponse();
      validateSmtpResponse(response, expectedCodes, label);
      return response;
    },
    async sendCommand(command: string, expectedCodes: number[], label: string) {
      socket.write(`${command}\r\n`);
      const response = await reader.readResponse();
      validateSmtpResponse(response, expectedCodes, label);
      return response;
    },
    async sendData(message: string) {
      socket.write(`${message}\r\n.\r\n`);
      const response = await reader.readResponse();
      validateSmtpResponse(response, [250], "message data");
      return response;
    },
  };
}

function createSmtpResponseReader(socket: TLSSocket) {
  const lineReader = createInterface({
    input: socket,
    crlfDelay: Infinity,
  });

  const bufferedLines: string[] = [];
  const pendingReaders: Array<{
    reject: (error: Error) => void;
    resolve: (line: string) => void;
  }> = [];
  let closedError: Error | null = null;

  function failPending(error: Error) {
    closedError = error;
    while (pendingReaders.length > 0) {
      pendingReaders.shift()?.reject(error);
    }
  }

  lineReader.on("line", (line) => {
    const pending = pendingReaders.shift();
    if (pending) {
      pending.resolve(line);
      return;
    }

    bufferedLines.push(line);
  });

  socket.on("error", (error) => {
    failPending(toError(error));
  });

  socket.on("timeout", () => {
    failPending(new Error("Timed out while waiting for Gmail SMTP"));
  });

  socket.on("close", () => {
    failPending(new Error("Gmail SMTP connection closed unexpectedly"));
  });

  async function readLine(): Promise<string> {
    if (bufferedLines.length > 0) {
      return bufferedLines.shift() ?? "";
    }

    if (closedError) {
      throw closedError;
    }

    return new Promise<string>((resolve, reject) => {
      pendingReaders.push({ resolve, reject });
    });
  }

  return {
    async readResponse(): Promise<SmtpResponse> {
      const lines: string[] = [];

      while (true) {
        const line = await readLine();
        lines.push(line);

        if (/^\d{3} /.test(line)) {
          return {
            code: Number(line.slice(0, 3)),
            lines,
            message: lines.join("\n"),
          };
        }
      }
    },
  };
}

interface SmtpResponse {
  code: number;
  lines: string[];
  message: string;
}

function validateSmtpResponse(
  response: SmtpResponse,
  expectedCodes: number[],
  label: string
) {
  if (expectedCodes.includes(response.code)) {
    return;
  }

  throw new Error(`Gmail SMTP ${label} failed: ${response.message}`);
}

function buildSmtpMessage(message: {
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string;
}): string {
  const headers = [
    `From: ${sanitizeHeaderValue(message.from)}`,
    `To: ${sanitizeHeaderValue(message.to)}`,
    `Subject: ${encodeMimeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@nuke.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];

  if (message.replyTo) {
    headers.push(`Reply-To: ${sanitizeHeaderValue(message.replyTo)}`);
  }

  const body = chunkBase64(normalizeLineBreaks(message.text));
  const rawMessage = `${headers.join("\r\n")}\r\n\r\n${body}`;

  return rawMessage
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function chunkBase64(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function encodeMimeHeader(value: string): string {
  const normalized = sanitizeHeaderValue(value);

  if (/^[\x20-\x7E]*$/.test(normalized)) {
    return normalized;
  }

  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r?\n/g, "\r\n");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sanitizeAddress(value: string): string {
  return sanitizeHeaderValue(value).replace(/[<>]/g, "");
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function extractSmtpProviderMessageId(response: SmtpResponse): string {
  const lastLine = response.lines[response.lines.length - 1];
  if (!lastLine) {
    throw new Error("Gmail SMTP accepted the message without a response id");
  }

  return lastLine.replace(/^\d{3}\s*/, "").trim();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("SMTP connection failed");
}

function extractProviderError(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return null;
}

function logEmailEvent(
  event: "accepted" | "failed",
  details: {
    brokerName: string;
    mode: EmailDeliveryMode;
    providerMessageId?: string;
    requestId: string;
    error?: string;
  }
) {
  const safeDetails = {
    brokerName: details.brokerName,
    mode: details.mode,
    providerMessageId: details.providerMessageId,
    requestId: details.requestId,
    error: details.error,
  };

  if (event === "failed") {
    console.error("[nuke][email]", safeDetails);
    return;
  }

  console.info("[nuke][email]", safeDetails);
}

export function logBrokerEmailFailure(
  message: OutboundBrokerEmail,
  error: string
) {
  logEmailEvent("failed", {
    brokerName: message.brokerName,
    mode: getEmailDeliveryMode(),
    requestId: message.requestId,
    error,
  });
}
