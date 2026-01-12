/**
 * Test Cleanup Helper
 * Provides utilities for cleaning up test data created via API
 */

const axios = require('axios');

/**
 * Delete user account via API
 * @param {string} userId - User ID to delete
 * @param {string} token - Auth token for the user
 * @param {string} baseUrl - API base URL
 */
const deleteUser = async (userId, token, baseUrl) => {
  try {
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    await client.delete('/users/me');
    return { success: true, userId };
  } catch (error) {
    return { 
      success: false, 
      userId, 
      error: error.response?.data?.message || error.message 
    };
  }
};

/**
 * Delete user via admin endpoint (if available)
 * @param {string} userId - User ID to delete
 * @param {string} adminToken - Admin auth token
 * @param {string} baseUrl - API base URL
 */
const adminDeleteUser = async (userId, adminToken, baseUrl) => {
  try {
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    await client.delete(`/admin/users/${userId}`);
    return { success: true, userId };
  } catch (error) {
    return { 
      success: false, 
      userId, 
      error: error.response?.data?.message || error.message 
    };
  }
};

/**
 * Delete address via API
 * @param {string} addressId - Address ID to delete
 * @param {string} token - Auth token for the user
 * @param {string} baseUrl - API base URL
 */
const deleteAddress = async (addressId, token, baseUrl) => {
  try {
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    await client.delete(`/users/me/addresses/${addressId}`);
    return { success: true, addressId };
  } catch (error) {
    return { 
      success: false, 
      addressId, 
      error: error.response?.data?.message || error.message 
    };
  }
};

/**
 * Logout and invalidate session
 * @param {string} token - Auth token to invalidate
 * @param {string} baseUrl - API base URL
 */
const logout = async (token, baseUrl) => {
  try {
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    await client.post('/auth/logout');
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
};

/**
 * Delete site via API
 * @param {string} siteId - Site ID to delete
 * @param {string} token - Auth token for the user
 * @param {string} baseUrl - API base URL
 */
const deleteSite = async (siteId, token, baseUrl) => {
  try {
    const client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    await client.delete(`/sites/${siteId}`);
    return { success: true, siteId };
  } catch (error) {
    return { 
      success: false, 
      siteId, 
      error: error.response?.data?.message || error.message 
    };
  }
};

/**
 * Clean up all resources in parallel
 * @param {Object} resources - Object containing arrays of resources to clean
 * @param {string} baseUrl - API base URL
 */
const cleanupAll = async (resources, baseUrl) => {
  const results = {
    users: [],
    addresses: [],
    sessions: [],
    sites: [],
    pages: []
  };

  // Cleanup pages first (they depend on sites)
  if (resources.pages && resources.pages.length > 0) {
    // Pages are deleted when sites are deleted, so we can skip individual deletion
    results.pages = resources.pages.map(page => ({ 
      status: 'fulfilled', 
      value: { success: true, page_id: page.page_id, note: 'Will be deleted with site' } 
    }));
  }

  // Cleanup sites (this will cascade delete pages)
  if (resources.sites && resources.sites.length > 0) {
    const sitePromises = resources.sites.map(site =>
      deleteSite(site.site_id, site.token, baseUrl)
    );
    results.sites = await Promise.allSettled(sitePromises);
  }

  // Cleanup addresses
  if (resources.addresses && resources.addresses.length > 0) {
    const addressPromises = resources.addresses.map(addr =>
      deleteAddress(addr.address_id, addr.token, baseUrl)
    );
    results.addresses = await Promise.allSettled(addressPromises);
  }

  // Logout sessions
  if (resources.sessions && resources.sessions.length > 0) {
    const sessionPromises = resources.sessions.map(session =>
      logout(session.token, baseUrl)
    );
    results.sessions = await Promise.allSettled(sessionPromises);
  }

  // Cleanup users last
  if (resources.users && resources.users.length > 0) {
    const userPromises = resources.users.map(user =>
      deleteUser(user.user_id, user.token, baseUrl)
    );
    results.users = await Promise.allSettled(userPromises);
  }

  return results;
};

/**
 * Log cleanup results
 * @param {Object} results - Cleanup results from cleanupAll
 */
const logCleanupResults = (results) => {
  console.log('\n📊 Cleanup Summary:');
  
  if (results.sites && results.sites.length > 0) {
    const siteSuccess = results.sites.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`  Sites: ${siteSuccess}/${results.sites.length} deleted`);
  }

  if (results.pages && results.pages.length > 0) {
    const pageSuccess = results.pages.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`  Pages: ${pageSuccess}/${results.pages.length} deleted`);
  }

  if (results.addresses && results.addresses.length > 0) {
    const addressSuccess = results.addresses.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`  Addresses: ${addressSuccess}/${results.addresses.length} deleted`);
  }

  if (results.sessions && results.sessions.length > 0) {
    const sessionSuccess = results.sessions.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`  Sessions: ${sessionSuccess}/${results.sessions.length} logged out`);
  }

  if (results.users && results.users.length > 0) {
    const userSuccess = results.users.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`  Users: ${userSuccess}/${results.users.length} deleted`);
  }

  // Log failures
  const allResults = [
    ...(results.sites || []),
    ...(results.pages || []),
    ...(results.addresses || []),
    ...(results.sessions || []),
    ...(results.users || [])
  ];

  const failures = allResults.filter(r => 
    r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
  );

  if (failures.length > 0) {
    console.log('\n⚠ Cleanup Warnings:');
    failures.forEach((failure, index) => {
      const error = failure.status === 'rejected' 
        ? failure.reason 
        : failure.value.error;
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  console.log('');
};

module.exports = {
  deleteUser,
  adminDeleteUser,
  deleteAddress,
  deleteSite,
  logout,
  cleanupAll,
  logCleanupResults
};


