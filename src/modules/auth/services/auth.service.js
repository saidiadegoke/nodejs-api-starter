const AuthModel = require('../models/auth.model');
const CountryModel = require('../../../shared/models/country.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { jwtSecret, jwtExpiresIn } = require('../../../config/env.config');

class AuthService {
  /**
   * Format phone number with country code
   */
  static async formatPhoneNumber(phone, country_id) {
    if (!phone) return null;
    
    // If phone already has + prefix, return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Get country phone code
    let phoneCode = '+234'; // Default to Nigeria
    
    if (country_id) {
      const country = await CountryModel.getById(country_id);
      if (country && country.phone_code) {
        phoneCode = country.phone_code;
      }
    }
    
    // Remove leading zeros from phone number
    const cleanPhone = phone.replace(/^0+/, '');
    
    return `${phoneCode}${cleanPhone}`;
  }

  /**
   * Register new user
   */
  static async register(userData) {
    // Validate required fields
    const { email, phone, password, first_name, last_name, role, country_id, referral_code } = userData;

    if (!email && !phone) {
      throw new Error('Either email or phone is required');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Role is required; user creation flow must provide it
    const validRoles = [
      'super_admin',
      'admin',
      'agent',
      'user',
      'registrar',
      'program_director',
      'institution_admin',
    ];
    if (!role || !validRoles.includes(role)) {
      throw new Error(
        'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)'
      );
    }

    // Format phone number with country code
    const formattedPhone = await this.formatPhoneNumber(phone, country_id);

    // Check if user already exists
    if (email || formattedPhone) {
      const existing = await AuthModel.findByIdentifier(email || formattedPhone);
      if (existing) {
        throw new Error('User with this email or phone already exists');
      }
    }

    // Create user with formatted phone
    const user = await AuthModel.createUser({
      ...userData,
      phone: formattedPhone
    });

    // Get user roles
    const roles = await AuthModel.getUserRoles(user.id);
    const roleNames = roles.map(r => r.name);

    // Generate tokens for automatic login after signup
    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);

    // Create session
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await AuthModel.createSession(user.id, refreshTokenHash, {
      source: 'registration',
      user_agent: 'web'
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        user_id: user.id,
        email: user.email,
        phone: user.phone,
        first_name,
        last_name,
        role: roleNames[0] || role || null,
        roles: roleNames,
        profile_photo: null,
        rating: null,
        verified: false,
        verification_required: true,
        created_at: user.created_at
      }
    };
  }

  /**
   * Login user
   */
  static async login(identifier, password, deviceInfo = {}) {
    // Find user
    const user = await AuthModel.findByIdentifier(identifier);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Check if password_hash exists
    if (!user.password_hash) {
      throw new Error('Invalid credentials');
    }
    
    // Verify password
    const isValidPassword = await AuthModel.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }
    
    // Get user roles
    const roles = await AuthModel.getUserRoles(user.id);
    const roleNames = roles.map(r => r.name);
    
    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);
    
    // Create session
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const session = await AuthModel.createSession(user.id, refreshTokenHash, deviceInfo);
    
    // Update last login
    const pool = require('../../../db/pool');
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email,
        role: roleNames[0] || null,
        roles: roleNames,
        profile_photo: user.profile_photo_url || null,
        rating: null,
        verified: user.email_verified && user.phone_verified,
        created_at: user.created_at
      }
    };
  }

  /**
   * Role names only for JWT `roles` claim — never embed permission rows or other objects.
   */
  static rolesClaimForToken(roles) {
    if (!Array.isArray(roles)) return [];
    const names = roles
      .map((r) => {
        if (typeof r === 'string' && r.length > 0) return r;
        if (r && typeof r === 'object' && typeof r.name === 'string' && r.name.length > 0) return r.name;
        return null;
      })
      .filter(Boolean);
    return [...new Set(names)];
  }

  /**
   * Generate access token (minimal claims: user_id, role name strings, type).
   * Permissions are resolved server-side (e.g. GET /users/me/permissions, RBAC middleware).
   */
  static generateAccessToken(userId, roles = []) {
    return jwt.sign(
      {
        user_id: userId,
        roles: this.rolesClaimForToken(roles),
        type: 'access'
      },
      jwtSecret,
      { expiresIn: jwtExpiresIn }
    );
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(userId) {
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || jwtSecret;
    const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    
    return jwt.sign(
      { 
        user_id: userId,
        type: 'refresh',
        session_id: uuidv4()
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES }
    );
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken) {
    try {
      const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || jwtSecret;
      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Get user roles for new access token
      const roles = await AuthModel.getUserRoles(payload.user_id);
      const roleNames = roles.map(r => r.name);
      
      // Generate new access token
      const accessToken = this.generateAccessToken(payload.user_id, roleNames);
      
      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user
   */
  static async logout(userId, sessionId) {
    if (sessionId) {
      await AuthModel.revokeSession(sessionId);
    }
    return true;
  }
}

module.exports = AuthService;

