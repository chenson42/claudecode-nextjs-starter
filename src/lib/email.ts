import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromDefault =
  process.env.RESEND_FROM_EMAIL ?? "Claude Code Starter <noreply@example.com>";

const client = apiKey ? new Resend(apiKey) : null;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput) {
  if (!client) {
    // In dev without a key, log instead of throwing. Production should
    // surface a missing key loudly.
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set in production");
    }
    console.warn("[email] RESEND_API_KEY missing — logging instead of sending");
    console.warn(
      `[email] to=${input.to} subject=${input.subject} htmlLen=${input.html.length} textLen=${input.text?.length ?? 0}`,
    );
    return { id: "dev-noop" };
  }
  const res = await client.emails.send({
    from: input.from ?? fromDefault,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (res.error) throw new Error(res.error.message);
  return { id: res.data?.id ?? "" };
}

export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  return sendEmail({
    to,
    subject: "Reset your password",
    html: `
      <p>Hi,</p>
      <p>Someone requested a password reset for your account.</p>
      <p>Click the link below to set a new password. This link expires in 60 minutes.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
    text: `Click the link below to reset your password. This link expires in 60 minutes.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
  });
}
