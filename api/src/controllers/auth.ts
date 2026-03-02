import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { verifyPassword, hashPassword, generateSalt } from '../utils/password';
import { generateJwtToken } from '../utils/auth';
import { generateEmailVerificationToken, sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { z } from 'zod';
import { AuthenticatedEvent } from '../utils/types';
import { getUserPreferredLeaderboardIds } from '../services/userPreferredLeaderboards';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { AuthenticatorTransport } from '@simplewebauthn/types';
import { emptyResponse, internalServerErrorResponse, respond } from '../utils/responses';
import { resolveUserPermissions } from '../services/authz';
import { publishDiscordMessage } from '../utils/discordNotify';

const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(true),
});

const RegisterRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  alias: z
    .string()
    .min(3, 'Alias must be at least 3 characters long')
    .max(50, 'Alias must be no more than 50 characters long')
    .regex(/^\S+$/, 'Alias must not contain spaces'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const VerifyEmailRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const RequestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const PasskeyRegistrationStartSchema = z.object({
  name: z.string().min(1, 'Passkey name is required').max(50, 'Name must be no more than 50 characters'),
});

const PasskeyRegistrationCompleteSchema = z.object({
  credential: z.object({
    id: z.string().min(1, 'Credential ID is required'),
    rawId: z.string().min(1, 'Raw ID is required'),
    clientExtensionResults: z.object({}),
    response: z.object({
      attestationObject: z.string().min(1, 'Attestation Object is required'),
      clientDataJSON: z.string().min(1, 'Client Data JSON is required'),
      authenticatorData: z.string().min(1, 'Authenticator Data is required'),
      publicKey: z.string().min(1, 'Public Key is required'),
      publicKeyAlgorithm: z.number(),
      transports: z.array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])),
    }),
    type: z.literal('public-key'),
  }),
});

const PasskeyAuthenticationCompleteSchema = z.object({
  credential: z.object({
    id: z.string().min(1, 'Credential ID is required'),
    rawId: z.string().min(1, 'Raw ID is required'),
    clientExtensionResults: z.object({}),
    response: z.object({
      clientDataJSON: z.string().min(1, 'Client Data JSON is required'),
      authenticatorData: z.string().min(1, 'Authenticator Data is required'),
      signature: z.string().min(1, 'Signature is required'),
    }),
    type: z.literal('public-key'),
  }),
});

export const login = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = LoginRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, {
        error: 'Validation failed',
        issues: validationResult.error?.issues,
      });
    }

    const { email, password, rememberMe } = validationResult.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return respond(401, { error: 'Invalid email or password' });
    }

    // Check if user has a password set
    if (!user.passwordHash || !user.passwordSalt) {
      return respond(401, { error: 'Password not set for this account' });
    }

    // Verify password
    const isValidPassword = verifyPassword(password, user.passwordSalt, user.passwordHash);

    if (!isValidPassword) {
      return respond(401, { error: 'Invalid email or password' });
    }

    // Check if user is banned
    if (user.banned) {
      return respond(403, { error: 'Account has been suspended' });
    }

    // Generate JWT token with appropriate expiration
    const token = await generateJwtToken(user.id, user.email, rememberMe);
    const permissions = await resolveUserPermissions(prisma, user.id);

    // Determine if the user has submitted at least one score (play)
    let userHasSubmittedScore = false;
    try {
      const play = await prisma.play.findFirst({ where: { userId: user.id }, select: { id: true } });
      userHasSubmittedScore = !!play;
    } catch (e) {
      console.warn('Failed to check userHasSubmittedScore during login', e);
    }

    const response = {
      user: {
        id: user.id,
        email: user.email,
        alias: user.alias,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        emailVerifiedAt: user.emailVerifiedAt,
        userHasSubmittedScore,
      },
      token,
      permissions,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Login error:', error);
    return internalServerErrorResponse();
  }
};

export const register = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = RegisterRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: { validation: validationResult.error?.issues } });
    }

    const { email, alias, password } = validationResult.data;

    // Check if email or alias already exists in a single query
    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [{ email }, { alias }],
      },
      select: {
        email: true,
        alias: true,
      },
    });

    // Check for conflicts
    const emailExists = existingUsers.some((user) => user.email === email);
    const aliasExists = existingUsers.some((user) => user.alias === alias);

    if (emailExists) {
      return respond(409, { error: 'Email already registered' });
    }

    if (aliasExists) {
      return respond(409, { error: 'Alias already taken' });
    }

    // Hash password
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    // Generate email verification token
    const emailVerificationToken = generateEmailVerificationToken();
    const emailVerificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        alias,
        passwordHash,
        passwordSalt: salt,
        emailVerificationToken,
        emailVerificationTokenExpiry,
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail(email, emailVerificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Generate JWT token for immediate login
    const token = await generateJwtToken(user.id, user.email);
    const permissions = await resolveUserPermissions(prisma, user.id);
    const response = {
      user: {
        id: user.id,
        email: user.email,
        alias: user.alias,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        emailVerifiedAt: user.emailVerifiedAt,
        userHasSubmittedScore: false, // new users have no plays yet
      },
      token,
      permissions,
    };

    // Notify Discord about new registration (admin channel)
    try {
      const baseUrl = process.env.FRONTEND_URL || 'https://arrowcloud.dance';
      const profileUrl = `${baseUrl}/user/${user.id}`;
      await publishDiscordMessage({
        type: 'user-event',
        embeds: [
          {
            title: 'New user registered',
            description: `[${user.alias}](${profileUrl})`,
            color: 0x57f287, // green
          },
        ],
      });
    } catch (e) {
      console.warn('Failed to publish Discord registration notification', e);
    }

    return respond(201, response);
  } catch (error) {
    console.error('Registration error:', error);
    return internalServerErrorResponse();
  }
};

export const verifyEmail = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = VerifyEmailRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { token } = validationResult.data;

    // Find user with this verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerifiedAt: null,
        emailVerificationTokenExpiry: {
          gt: new Date(), // Token must not be expired
        },
      },
    });

    if (!user) {
      return respond(400, { error: 'Invalid or expired verification token' });
    }

    // Update user to mark email as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationTokenExpiry: null,
      },
    });

    // Generate JWT token for immediate login
    const jwtToken = await generateJwtToken(updatedUser.id, updatedUser.email);
    const permissions = await resolveUserPermissions(prisma, updatedUser.id);
    let userHasSubmittedScore = false;
    try {
      const play = await prisma.play.findFirst({ where: { userId: updatedUser.id }, select: { id: true } });
      userHasSubmittedScore = !!play;
    } catch (e) {
      console.warn('Failed to check userHasSubmittedScore during verifyEmail', e);
    }
    const response = {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        alias: updatedUser.alias,
        emailVerifiedAt: updatedUser.emailVerifiedAt,
        userHasSubmittedScore,
      },
      token: jwtToken,
      permissions,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Email verification error:', error);
    return internalServerErrorResponse();
  }
};

export const resendVerificationEmail = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const email = event.user.email;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists for security
      return emptyResponse();
    }

    if (user.emailVerifiedAt) {
      return respond(400, { error: 'Email is already verified' });
    }

    // Generate new verification token
    const emailVerificationToken = generateEmailVerificationToken();
    const emailVerificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken,
        emailVerificationTokenExpiry,
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail(email, emailVerificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return respond(500, { error: 'Failed to send verification email' });
    }

    return emptyResponse();
  } catch (error) {
    console.error('Resend verification email error:', error);
    return internalServerErrorResponse();
  }
};

const getUserQuery = (prisma: PrismaClient, userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      alias: true,
      profileImageUrl: true,
      timezone: true,
      emailVerifiedAt: true,
      countryId: true,
      country: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
};

const getRivalsQuery = (prisma: PrismaClient, userId: string) => {
  return prisma.userRival.findMany({
    where: { userId },
    select: { rivalUserId: true },
  });
};

export const getUser = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const [user, preferredIds, rivalRows, permissions] = await Promise.all([
      getUserQuery(prisma, event.user.id),
      getUserPreferredLeaderboardIds(prisma, event.user.id),
      getRivalsQuery(prisma, event.user.id),
      resolveUserPermissions(prisma, event.user.id),
    ]);

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    const rivalUserIds = rivalRows.map((r) => r.rivalUserId);

    // Compute plays existence
    let userHasSubmittedScore = false;
    try {
      const play = await prisma.play.findFirst({ where: { userId: user.id }, select: { id: true } });
      userHasSubmittedScore = !!play;
    } catch (e) {
      console.warn('Failed to check userHasSubmittedScore in getUser', e);
    }

    return respond(200, {
      user: {
        ...user,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        preferredLeaderboards: preferredIds,
        rivalUserIds,
        permissions,
        userHasSubmittedScore,
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return internalServerErrorResponse();
  }
};

export const requestPasswordReset = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = RequestPasswordResetSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { email } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // rate limiting - no more than 1 password reset email every 2 minutes
      // if user has a reset token, it was set witih a 1 hour expiry
      // thus if the token expiry is more than 58 minutes in the future
      // that means the user requested a token within the last 2 minutes
      const now = new Date();
      const fiftyEightMinutesFromNow = new Date(now.getTime() + 58 * 60 * 1000);
      if (user.passwordResetTokenExpiry && user.passwordResetTokenExpiry > fiftyEightMinutesFromNow) {
        // User has a recent reset token, silently skip sending email but still return 204
        return emptyResponse();
      }

      // Generate password reset token
      const passwordResetToken = generateEmailVerificationToken(); // Reusing the same token generation function
      const passwordResetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update user with reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken,
          passwordResetTokenExpiry,
        },
      });

      // Send password reset email
      try {
        await sendPasswordResetEmail(email, passwordResetToken);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Continue and still return 204 to not reveal if email exists
      }
    }

    // Always return 204 regardless of whether email exists
    return emptyResponse();
  } catch (error) {
    console.error('Request password reset error:', error);
    return internalServerErrorResponse();
  }
};

export const resetPassword = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = ResetPasswordSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { token, password } = validationResult.data;

    // Find user with this reset token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetTokenExpiry: {
          gt: new Date(), // Token must not be expired
        },
      },
    });

    if (!user) {
      return respond(400, { error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    // Update user with new password and clear reset token
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordSalt: salt,
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
      },
    });

    // Generate JWT token for immediate login
    const jwtToken = await generateJwtToken(updatedUser.id, updatedUser.email);
    let userHasSubmittedScore = false;
    try {
      const play = await prisma.play.findFirst({ where: { userId: updatedUser.id }, select: { id: true } });
      userHasSubmittedScore = !!play;
    } catch (e) {
      console.warn('Failed to check userHasSubmittedScore during resetPassword', e);
    }
    const response = {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        alias: updatedUser.alias,
        profileImageUrl: updatedUser.profileImageUrl ? assetS3UrlToCloudFrontUrl(updatedUser.profileImageUrl) : null,
        emailVerifiedAt: updatedUser.emailVerifiedAt,
        userHasSubmittedScore,
      },
      token: jwtToken,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Reset password error:', error);
    return internalServerErrorResponse();
  }
};

// Environment variables for WebAuthn
const RP_NAME = 'Arrow Cloud';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'arrowcloud.dance';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://arrowcloud.dance';

// Determine RP ID and acceptable origins based on the request's Origin header.
// This allows both the legacy CloudFront domain and the new custom domain to work during the transition.
const getWebAuthnContext = (originHeader?: string) => {
  try {
    if (!originHeader) {
      return {
        rpId: RP_ID,
        allowedOrigins: [ORIGIN, 'http://localhost:5173'],
        allowedRpIds: [RP_ID, 'localhost'],
      } as const;
    }
    const u = new URL(originHeader);
    const host = u.hostname;
    let rpId = RP_ID;
    if (host === 'localhost') rpId = 'localhost';
    else if (host.endsWith('cloudfront.net'))
      rpId = host; // legacy frontend hostname
    else if (host.endsWith('arrowcloud.dance')) rpId = 'arrowcloud.dance';

    const originUrl = `${u.protocol}//${u.host}`;
    const allowedOrigins = Array.from(new Set([originUrl, ORIGIN, 'http://localhost:5173']));
    const allowedRpIds = Array.from(new Set([rpId, RP_ID, 'localhost']));
    return { rpId, allowedOrigins, allowedRpIds } as const;
  } catch {
    return {
      rpId: RP_ID,
      allowedOrigins: [ORIGIN, 'http://localhost:5173'],
      allowedRpIds: [RP_ID, 'localhost'],
    } as const;
  }
};

// todo: Consider running this as a scheduled lambda, cron, etc. It adds latency.
const cleanupExpiredChallenges = async (prisma: PrismaClient) => {
  await prisma.webAuthnChallenge.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
};

export const passkeyRegistrationStart = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    const validationResult = PasskeyRegistrationStartSchema.safeParse(JSON.parse(event.body));
    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { name } = validationResult.data;
    const userId = event.user.id;

    // Clean up expired challenges
    await cleanupExpiredChallenges(prisma);

    // Get existing passkeys for this user
    const existingPasskeys = await prisma.passkey.findMany({
      where: { userId },
    });

    const wa = getWebAuthnContext(event.headers?.origin || event.headers?.Origin);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: wa.rpId,
      userID: new TextEncoder().encode(userId),
      userName: event.user.email,
      userDisplayName: event.user.alias,
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in database (expires in 5 minutes)
    await prisma.webAuthnChallenge.create({
      data: {
        userId,
        challenge: options.challenge,
        type: 'registration',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    return respond(200, { options, passkeyName: name });
  } catch (error) {
    console.error('Passkey registration start error:', error);
    return internalServerErrorResponse();
  }
};

export const passkeyRegistrationComplete = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    const parsedBody = JSON.parse(event.body);
    const validationResult = PasskeyRegistrationCompleteSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { credential: credentialResponse } = validationResult.data;
    const userId = event.user.id;
    const passkeyName = parsedBody.passkeyName || 'Unnamed Passkey';

    // Get and validate stored challenge
    const challengeRecord = await prisma.webAuthnChallenge.findFirst({
      where: {
        userId,
        type: 'registration',
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!challengeRecord) {
      return respond(400, { error: 'No registration in progress' });
    }

    const waReg = getWebAuthnContext(event.headers?.origin || event.headers?.Origin);
    const verification = await verifyRegistrationResponse({
      response: credentialResponse,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: [...waReg.allowedOrigins],
      expectedRPID: [...waReg.allowedRpIds],
    });

    if (!verification.verified || !verification.registrationInfo) {
      return respond(400, { error: 'Passkey registration failed' });
    }

    const registrationInfo = verification.registrationInfo;
    const credential = registrationInfo.credential;

    // Save passkey to database
    await prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id, // Store as base64url (same format as rawId)
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: BigInt(credential.counter),
        transports: credentialResponse.response.transports,
        deviceType: registrationInfo.credentialDeviceType,
        backedUp: registrationInfo.credentialBackedUp,
        name: passkeyName,
      },
    });

    // Clean up challenge
    await prisma.webAuthnChallenge.delete({
      where: { id: challengeRecord.id },
    });

    return respond(200, {
      verified: true,
      message: 'Passkey registered successfully',
    });
  } catch (error) {
    console.error('Passkey registration complete error:', error);
    return internalServerErrorResponse();
  }
};

export const passkeyAuthenticationStart = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    // Clean up expired challenges
    await cleanupExpiredChallenges(prisma);

    const wa = getWebAuthnContext(event.headers?.origin || event.headers?.Origin);
    const options = await generateAuthenticationOptions({
      rpID: wa.rpId,
      userVerification: 'preferred',
    });

    // Store challenge in database (expires in 5 minutes)
    await prisma.webAuthnChallenge.create({
      data: {
        challenge: options.challenge,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });
    return respond(200, { options });
  } catch (error) {
    console.error('Passkey authentication start error:', error);
    return internalServerErrorResponse();
  }
};

export const passkeyAuthenticationComplete = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    const validationResult = PasskeyAuthenticationCompleteSchema.safeParse(JSON.parse(event.body));
    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { credential } = validationResult.data;

    // Get and validate stored challenge
    const challengeRecord = await prisma.webAuthnChallenge.findFirst({
      where: {
        type: 'authentication',
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!challengeRecord) {
      return respond(400, { error: 'No authentication in progress' });
    }

    // Find the passkey by credential ID first
    const passkey = await prisma.passkey.findFirst({
      where: { credentialId: credential.rawId },
      include: { user: true },
    });

    if (!passkey) {
      return respond(401, { error: 'Passkey not found' });
    }

    const user = passkey.user;

    // Check if user is banned
    if (user.banned) {
      return respond(403, { error: 'Account has been suspended' });
    }

    const waAuth = getWebAuthnContext(event.headers?.origin || event.headers?.Origin);
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: [...waAuth.allowedOrigins],
      expectedRPID: [...waAuth.allowedRpIds],
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64'),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransport[], // todo: zod validation for transports on stored passkeys
      },
    });

    if (!verification.verified) {
      return respond(401, { error: 'Passkey authentication failed' });
    }

    // Update passkey counter and last used timestamp
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    // Generate JWT token
    const token = await generateJwtToken(user.id, user.email, true);
    const permissions = await resolveUserPermissions(prisma, user.id);
    let userHasSubmittedScore = false;
    try {
      const play = await prisma.play.findFirst({ where: { userId: user.id }, select: { id: true } });
      userHasSubmittedScore = !!play;
    } catch (e) {
      console.warn('Failed to check userHasSubmittedScore during passkeyAuthenticationComplete', e);
    }
    const response = {
      user: {
        id: user.id,
        email: user.email,
        alias: user.alias,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        emailVerifiedAt: user.emailVerifiedAt,
        userHasSubmittedScore,
      },
      token,
      permissions,
      message: 'Passkey authentication successful',
    };

    // Clean up challenge
    await prisma.webAuthnChallenge.delete({
      where: { id: challengeRecord.id },
    });

    return respond(200, response);
  } catch (error) {
    console.error('Passkey authentication complete error:', error);
    return internalServerErrorResponse();
  }
};

export const getUserPasskeys = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const passkeys = await prisma.passkey.findMany({
      where: { userId: event.user.id },
      select: {
        id: true,
        name: true,
        deviceType: true,
        lastUsedAt: true,
        createdAt: true,
        transports: true,
      },
    });
    return respond(200, { passkeys });
  } catch (error) {
    console.error('Get user passkeys error:', error);
    return internalServerErrorResponse();
  }
};

export const deletePasskey = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const passkeyId = event.routeParameters?.passkeyId;
    if (!passkeyId) {
      return respond(400, { error: 'Passkey ID is required' });
    }

    // Verify the passkey belongs to the authenticated user
    const passkey = await prisma.passkey.findFirst({
      where: {
        id: passkeyId,
        userId: event.user.id,
      },
    });

    if (!passkey) {
      return respond(404, { error: 'Passkey not found' });
    }

    await prisma.passkey.delete({
      where: { id: passkeyId },
    });
    return respond(200, { message: 'Passkey deleted successfully' });
  } catch (error) {
    console.error('Delete passkey error:', error);
    return internalServerErrorResponse();
  }
};
