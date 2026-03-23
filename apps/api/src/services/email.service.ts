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

export function isEmailDeliveryConfigured() {
  return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
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

export async function sendDeviceVerificationEmail(email: string, otp: string, deviceLabel: string) {
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_USER}>`,
    to: email,
    subject: "Histora device approval code",
    text: `A sign-in attempt from ${deviceLabel} needs approval. Your Histora device code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
        <div style="padding: 24px; border-radius: 18px; background: linear-gradient(180deg, #fff9f0 0%, #f4ead8 100%);">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #8a5b2f;">Histora Security</p>
          <h1 style="font-size: 24px; margin: 0 0 12px;">Approve this device</h1>
          <p style="margin: 0 0 16px;">A new device is trying to sign in to your archive.</p>
          <div style="padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid rgba(138, 91, 47, 0.18); margin-bottom: 16px;">
            <strong style="display: block; margin-bottom: 4px;">Device</strong>
            <span>${deviceLabel}</span>
          </div>
          <p style="margin: 0 0 12px;">Use this 5-digit code to approve the sign-in.</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.35em; padding: 16px 20px; border-radius: 12px; background: #fff; width: fit-content;">
            ${otp}
          </div>
          <p style="margin: 16px 0 0;">This code expires in 10 minutes. If this was not you, ignore this email.</p>
        </div>
      </div>
    `
  });
}

export async function sendCollaborationInviteEmail({
  email,
  ownerName,
  ownerUsername,
  storyTitle,
  circle
}: {
  email: string;
  ownerName: string;
  ownerUsername: string;
  storyTitle: string;
  circle: "family" | "friend";
}) {
  const transporter = await getTransporter();
  const appUrl = env.CLIENT_ORIGIN ?? env.APP_BASE_URL ?? null;
  const signInUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/signin` : null;

  await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_USER}>`,
    to: email,
    subject: `${ownerName} invited you to collaborate on Histora`,
    text: [
      `${ownerName} (@${ownerUsername}) invited you to collaborate on "${storyTitle}" as ${circle}.`,
      signInUrl ? `Sign in here to accept the collaboration: ${signInUrl}` : "Sign in to Histora with this email address to accept the collaboration."
    ].join("\n\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
        <div style="padding: 24px; border-radius: 18px; background: linear-gradient(180deg, #eef4ff 0%, #ffffff 100%); border: 1px solid #d9e4ff;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #315efb;">Histora Collaboration</p>
          <h1 style="font-size: 24px; margin: 0 0 12px;">You were invited to collaborate</h1>
          <p style="margin: 0 0 16px;">${ownerName} (@${ownerUsername}) invited you to join the story <strong>${storyTitle}</strong> as ${circle}.</p>
          <p style="margin: 0 0 16px;">Sign in with this email address and Histora will show the collaboration invite immediately.</p>
          ${
            signInUrl
              ? `<a href="${signInUrl}" style="display: inline-block; padding: 14px 18px; border-radius: 999px; background: #315efb; color: #ffffff; text-decoration: none; font-weight: 700;">Open Histora</a>`
              : ""
          }
        </div>
      </div>
    `
  });
}
