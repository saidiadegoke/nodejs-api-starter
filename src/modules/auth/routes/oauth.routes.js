/**
 * OAuth Routes
 *
 * Defines OAuth authentication endpoints for social login
 */

const express = require('express');
const router = express.Router();
const passport = require('../../../shared/config/passport.config');
const OAuthController = require('../controllers/oauth.controller');

// Google OAuth
router.get('/google', passport.authenticate('google', { session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/auth/oauth/failure'
  }),
  OAuthController.handleOAuthCallback
);

// Facebook OAuth
router.get('/facebook', passport.authenticate('facebook', { session: false }));
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: '/auth/oauth/failure'
  }),
  OAuthController.handleOAuthCallback
);

// GitHub OAuth
router.get('/github', passport.authenticate('github', { session: false, scope: ['user:email'] }));
router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: '/auth/oauth/failure'
  }),
  OAuthController.handleOAuthCallback
);

// Twitter OAuth
router.get('/twitter', passport.authenticate('twitter', { session: false }));
router.get(
  '/twitter/callback',
  passport.authenticate('twitter', {
    session: false,
    failureRedirect: '/auth/oauth/failure'
  }),
  OAuthController.handleOAuthCallback
);

// OAuth failure handler
router.get('/oauth/failure', OAuthController.handleOAuthFailure);

module.exports = router;
