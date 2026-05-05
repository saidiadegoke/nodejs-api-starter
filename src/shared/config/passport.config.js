/**
 * Passport OAuth Configuration
 *
 * Configures OAuth strategies for social login
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const pool = require('../../db/pool');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

/**
 * Helper function to find or create user from OAuth profile
 */
async function findOrCreateOAuthUser(provider, profile) {
  const email = profile.emails?.[0]?.value;
  const providerId = profile.id;

  // Check if social account already exists
  const socialResult = await pool.query(
    'SELECT user_id FROM social_accounts WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerId]
  );

  if (socialResult.rows.length > 0) {
    // User already linked to this OAuth account
    const userId = socialResult.rows[0].user_id;

    // Update last used timestamp
    await pool.query(
      'UPDATE social_accounts SET last_used_at = NOW() WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerId]
    );

    // Get user data
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return userResult.rows[0];
  }

  // Check if user exists with this email
  let user;
  if (email) {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
    }
  }

  // Create new user if doesn't exist
  if (!user) {
    if (!email) {
      throw new Error('No email found in OAuth profile');
    }

    const userResult = await pool.query(
      `INSERT INTO users (email, email_verified, status)
       VALUES ($1, true, 'active')
       RETURNING *`,
      [email]
    );
    user = userResult.rows[0];

    // Create profile
    const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
    const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
    const profilePhoto = profile.photos?.[0]?.value;

    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, profile_photo_url)
       VALUES ($1, $2, $3, $4)`,
      [user.id, firstName, lastName, profilePhoto]
    );
  }

  // Link social account
  await pool.query(
    `INSERT INTO social_accounts (
      user_id, provider, provider_user_id, provider_email, provider_data, connected_at, last_used_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [user.id, provider, providerId, email, JSON.stringify(profile._json || {})]
  );

  return user;
}

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.API_BASE_URL || 'http://localhost:5010'}/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser('google', profile);
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${process.env.API_BASE_URL || 'http://localhost:5010'}/auth/facebook/callback`,
        profileFields: ['id', 'emails', 'name', 'photos'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser('facebook', profile);
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.API_BASE_URL || 'http://localhost:5010'}/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser('github', profile);
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// Twitter OAuth Strategy
if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
        callbackURL: `${process.env.API_BASE_URL || 'http://localhost:5010'}/auth/twitter/callback`,
        includeEmail: true,
      },
      async (token, tokenSecret, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser('twitter', profile);
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

module.exports = passport;
