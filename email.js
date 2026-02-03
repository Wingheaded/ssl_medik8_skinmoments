/**
 * email.js - Email helper for calling Cloud Function
 * Usage: import { sendNotificationEmail } from './email.js';
 */

import { functions, httpsCallable } from './firebase-config.js';

/**
 * Send an email notification via Cloud Function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string[]} [options.bcc] - BCC recipients (optional)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body content
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendNotificationEmail({ to, bcc, subject, html }) {
    try {
        const sendEmail = httpsCallable(functions, 'sendEmail');
        const result = await sendEmail({ to, bcc, subject, html });
        console.log('Email sent:', result.data);
        return result.data;
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, message: error.message || 'Failed to send email' };
    }
}

/**
 * Send a booking confirmation email
 * @param {string} pharmacyEmail - Pharmacy contact email
 * @param {Object} booking - Booking details
 */
export async function sendBookingConfirmation(pharmacyEmail, booking) {
    const { clientName, date, time, serviceName } = booking;

    const html = `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a; margin-bottom: 24px;">Nova Marcação Confirmada</h1>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0 0 12px;"><strong>Cliente:</strong> ${clientName}</p>
                <p style="margin: 0 0 12px;"><strong>Data:</strong> ${date}</p>
                <p style="margin: 0 0 12px;"><strong>Hora:</strong> ${time}</p>
                <p style="margin: 0;"><strong>Serviço:</strong> ${serviceName || 'Skin Moment'}</p>
            </div>
            <p style="color: #666; font-size: 14px;">Este email foi enviado automaticamente pelo sistema Medik8 Skin Moments.</p>
        </div>
    `;

    return sendNotificationEmail({
        to: pharmacyEmail,
        subject: `Nova Marcação: ${clientName} - ${date} às ${time}`,
        html
    });
}
