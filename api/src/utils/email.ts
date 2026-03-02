import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import crypto from 'crypto';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

export const generateEmailVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const sendExampleEmail = async (email: string): Promise<void> => {
  const fromEmail = process.env.FROM_EMAIL_ADDRESS || 'noreply@arrowcloud.dance';

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Example Email - Arrow Cloud',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: '<p>This is an example email sent from Arrow Cloud.</p>',
          Charset: 'UTF-8',
        },
        Text: {
          Data: 'This is an example email sent from Arrow Cloud.',
          Charset: 'UTF-8',
        },
      },
    },
  });

  try {
    await sesClient.send(command);
    console.log(`Example email sent to ${email}`);
  } catch (error) {
    console.error('Error sending example email:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const fromEmail = process.env.FROM_EMAIL_ADDRESS || 'noreply@arrowcloud.dance';

  // In production, you'd want to use your actual domain
  const verificationLink = `${process.env.FRONTEND_URL || 'https://arrowcloud.dance'}/verify-email?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Verify Your Email - Arrow Cloud</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to Arrow Cloud!</h1>
            </div>
            <div class="content">
                <h2>Verify Your Email Address</h2>
                <p>To complete your registration please verify your email address by clicking the button below:</p>
                <div style="text-align: center;">
                    <a href="${verificationLink}" class="button">Verify Email Address</a>
                </div>
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #667eea;">${verificationLink}</p>
                <p><strong>Note:</strong> This verification link will expire in 24 hours.</p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const textContent = `
Welcome to Arrow Cloud!

Verify Your Email Address

To complete your registration please verify your email address by visiting this link:

${verificationLink}

Note: This verification link will expire in 24 hours.

This is an automated message, please do not reply to this email.
  `;

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Verify Your Email - Arrow Cloud',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlContent,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textContent,
          Charset: 'UTF-8',
        },
      },
    },
  });

  try {
    await sesClient.send(command);
    console.log(`Verification email sent to ${email}`);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const fromEmail = process.env.FROM_EMAIL_ADDRESS || 'noreply@arrowcloud.dance';

  // In production, you'd want to use your actual domain
  const resetLink = `${process.env.FRONTEND_URL || 'https://arrowcloud.dance'}/reset-password?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Reset Your Password - Arrow Cloud</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Reset Your Password</h1>
            </div>
            <div class="content">
                <h2>Password Reset Request</h2>
                <p>You have requested to reset your password. Click the button below to create a new password:</p>
                <div style="text-align: center;">
                    <a href="${resetLink}" class="button">Reset Password</a>
                </div>
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
                <p><strong>Note:</strong> This password reset link will expire in 1 hour.</p>
                <p>If you did not request this password reset, please ignore this email.</p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const textContent = `
Reset Your Password

Password Reset Request

You have requested to reset your password. Visit this link to create a new password:

${resetLink}

Note: This password reset link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

This is an automated message, please do not reply to this email.
  `;

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Reset Your Password - Arrow Cloud',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlContent,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textContent,
          Charset: 'UTF-8',
        },
      },
    },
  });

  try {
    await sesClient.send(command);
    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};
