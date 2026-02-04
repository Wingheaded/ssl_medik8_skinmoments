import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

const OWNER_EMAIL = "jose.antonio@skinselflove.com.pt";

// Define secrets (set via: firebase functions:secrets:set SMTP_EMAIL)
const smtpEmail = defineSecret("SMTP_EMAIL");
const smtpPassword = defineSecret("SMTP_PASSWORD");

/**
 * deleteAdminUser - Delete a user from Firebase Auth
 * Only callable by the owner/admin
 * 
 * Accepts: { uid: string }
 * Returns: { success: boolean, message: string }
 */
export const deleteAdminUser = onCall(
    { region: "europe-west3" },
    async (request) => {
        // Auth check - only owner can delete users
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be logged in.");
        }

        const callerEmail = request.auth.token.email;

        // Check if caller is admin by checking Firestore
        const callerDoc = await admin.firestore()
            .collection("users")
            .doc(request.auth.uid)
            .get();

        const isOwner = callerEmail === OWNER_EMAIL;
        const isAdmin = callerDoc.exists &&
            ["admin", "owner"].includes(callerDoc.data()?.role);

        if (!isOwner && !isAdmin) {
            throw new HttpsError(
                "permission-denied",
                "Only admins can delete users."
            );
        }

        const { uid } = request.data;

        if (!uid) {
            throw new HttpsError(
                "invalid-argument",
                "Missing required field: uid"
            );
        }

        // Prevent deleting the owner
        try {
            const userToDelete = await admin.auth().getUser(uid);
            if (userToDelete.email === OWNER_EMAIL) {
                throw new HttpsError(
                    "permission-denied",
                    "Cannot delete the owner account."
                );
            }
        } catch (error) {
            if ((error as { code?: string }).code === "auth/user-not-found") {
                // User doesn't exist in Auth, that's fine
                logger.info(`User ${uid} not found in Auth, skipping Auth deletion`);
                return {
                    success: true,
                    message: "User not found in Auth (already deleted or never existed)"
                };
            }
            throw error;
        }

        try {
            await admin.auth().deleteUser(uid);
            logger.info(`Deleted user from Auth: ${uid}`);

            return {
                success: true,
                message: "User deleted from Firebase Auth successfully"
            };
        } catch (error) {
            logger.error("Failed to delete user from Auth", { error, uid });
            throw new HttpsError(
                "internal",
                "Failed to delete user from Firebase Auth."
            );
        }
    }
);


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
