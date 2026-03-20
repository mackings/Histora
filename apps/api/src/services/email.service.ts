import nodemailer from "nodemailer";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter() {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new AppError("SMTP is not configured on the server.", 500, "SMTP_NOT_CONFIGURED");
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      })
    );
  }

  return transporterPromise;
}

export async function sendVerificationOtpEmail(email: string, otp: string) {
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_USER}>`,
    to: email,
    subject: "Histora verification code",
    text: `Your Histora verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
        <h1 style="font-size: 24px; margin-bottom: 12px;">Verify your email</h1>
        <p style="margin: 0 0 16px;">Use this 5-digit code to verify your Histora account.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.35em; padding: 16px 20px; border-radius: 12px; background: #f3f4f6; width: fit-content;">
          ${otp}
        </div>
        <p style="margin: 16px 0 0;">This code expires in 10 minutes.</p>
      </div>
    `
  });
}
