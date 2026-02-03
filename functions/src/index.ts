import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";

// Define secrets (set via: firebase functions:secrets:set SMTP_EMAIL)
const smtpEmail = defineSecret("SMTP_EMAIL");
const smtpPassword = defineSecret("SMTP_PASSWORD");


/**
 * sendEmail - Callable Cloud Function for sending emails via SMTP
 *
 * Accepts: { to, bcc, subject, html }
 * Returns: { success: boolean, message: string }
 */
export const sendEmail = onCall(
    { secrets: [smtpEmail, smtpPassword], region: "europe-west3", maxInstances: 10 },
    async (request) => {
        // Auth check (optional: remove if you want public access)
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }

        const { to, bcc, subject, html } = request.data;

        // Validate required fields
        if (!to || !subject || !html) {
            throw new HttpsError(
                "invalid-argument",
                "Missing required fields: to, subject, html"
            );
        }

        // Check secrets are available
        const email = smtpEmail.value();
        const password = smtpPassword.value();

        if (!email || !password) {
            logger.error("SMTP credentials not configured");
            throw new HttpsError(
                "failed-precondition",
                "Email service not configured. Contact administrator."
            );
        }

        try {
            // Create transporter
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: email,
                    pass: password,
                },
            });

            // Configure email options
            const mailOptions = {
                from: `"Medik8 Skin Moments" <${email}>`,
                to,
                bcc: bcc || undefined,
                subject,
                html,
            };

            // Send email
            const info = await transporter.sendMail(mailOptions);

            logger.info("Email sent successfully", {
                messageId: info.messageId,
                to,
                bccCount: bcc?.length || 0,
            });

            return {
                success: true,
                message: "Email sent successfully",
                messageId: info.messageId,
            };
        } catch (error) {
            logger.error("Failed to send email", { error });
            throw new HttpsError(
                "internal",
                "Failed to send email. Please try again later."
            );
        }
    }
);
