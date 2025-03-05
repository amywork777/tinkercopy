import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { users } from '../schema';

// Configure passport to use Google Strategy
export const configureGoogleAuth = () => {
  // Set up passport serialization for user sessions
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      // Find user by ID in database
      const foundUser = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, foundUser[0] || null);
    } catch (error) {
      done(error, null);
    }
  });

  // Configure Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: `${process.env.SERVER_URL || 'http://localhost:3000'}/api/auth/callback/google`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.googleId, profile.id))
            .limit(1);

          if (existingUser.length > 0) {
            // User exists, return user
            return done(null, existingUser[0]);
          }

          // User doesn't exist, create new user
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
          const name = profile.displayName || '';
          const picture = profile.photos && profile.photos[0] ? profile.photos[0].value : '';

          const [newUser] = await db
            .insert(users)
            .values({
              googleId: profile.id,
              email,
              name,
              image: picture,
            })
            .returning();

          return done(null, newUser);
        } catch (error) {
          console.error('Error during authentication:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
};

// Middleware to check if user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // User is not authenticated, send 401 Unauthorized
  res.status(401).json({ error: 'Not authenticated' });
};

// Export routes for authentication
export const authRoutes = {
  // Google login route
  login: (req: Request, res: Response) => {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
    })(req, res);
  },

  // Google callback route
  callback: (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('google', {
      failureRedirect: '/login',
      successRedirect: '/',
    })(req, res, next);
  },

  // Logout route
  logout: (req: Request, res: Response) => {
    req.logout(() => {
      res.status(200).json({ success: true });
    });
  },

  // Get the current session user
  session: (req: Request, res: Response) => {
    if (req.user) {
      const { password, googleId, ...user } = req.user as any;
      res.json({ user });
    } else {
      res.json({ user: null });
    }
  },
}; 