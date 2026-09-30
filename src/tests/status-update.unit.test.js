const { normalizeStatus } = require('../utils/utils/status');
const catalogService = require('../modules/jupeb/services/catalog.service');
const universityModel = require('../modules/jupeb/models/university.model');
const UserService = require('../modules/users/services/user.service');
const User = require('../modules/users/models/user.model');
const UserController = require('../modules/users/controllers/user.controller');

describe('Status Normalization Utility', () => {
  it('correctly maps inactive aliases to "inactive"', () => {
    expect(normalizeStatus('inactive')).toBe('inactive');
    expect(normalizeStatus('INACTIVE')).toBe('inactive');
    expect(normalizeStatus('  inactive  ')).toBe('inactive');
    expect(normalizeStatus('deactivated')).toBe('inactive');
    expect(normalizeStatus('Deactivated')).toBe('inactive');
    expect(normalizeStatus('DEACTIVATE')).toBe('inactive');
    expect(normalizeStatus(false)).toBe('inactive');
  });

  it('correctly maps active aliases to "active"', () => {
    expect(normalizeStatus('active')).toBe('active');
    expect(normalizeStatus('ACTIVE')).toBe('active');
    expect(normalizeStatus('  active  ')).toBe('active');
    expect(normalizeStatus('activated')).toBe('active');
    expect(normalizeStatus('Activated')).toBe('active');
    expect(normalizeStatus('ACTIVATE')).toBe('active');
    expect(normalizeStatus(true)).toBe('active');
  });

  it('returns null for unrecognized strings', () => {
    expect(normalizeStatus('invalid_status')).toBeNull();
    expect(normalizeStatus('pending')).toBeNull();
    expect(normalizeStatus('deleted')).toBeNull();
  });

  it('returns undefined for null or undefined', () => {
    expect(normalizeStatus(undefined)).toBeUndefined();
    expect(normalizeStatus(null)).toBeUndefined();
  });
});

describe('CatalogService.patchUniversity status handling', () => {
  const uniId = 'a1111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(catalogService, 'getUniversityById').mockResolvedValue({ id: uniId, name: 'Test Uni' });
  });

  it('passes status: "inactive" to universityModel.updateById when deactivated is sent', async () => {
    const updateSpy = jest.spyOn(universityModel, 'updateById').mockResolvedValue({
      id: uniId,
      name: 'Test Uni',
      status: 'inactive',
    });

    const res = await catalogService.patchUniversity(uniId, { status: 'deactivated' });
    expect(updateSpy).toHaveBeenCalledWith(
      uniId,
      expect.objectContaining({ status: 'inactive' })
    );
    expect(res.status).toBe('inactive');
  });

  it('passes status: "inactive" to universityModel.updateById when inactive is sent', async () => {
    const updateSpy = jest.spyOn(universityModel, 'updateById').mockResolvedValue({
      id: uniId,
      name: 'Test Uni',
      status: 'inactive',
    });

    const res = await catalogService.patchUniversity(uniId, { status: 'inactive' });
    expect(updateSpy).toHaveBeenCalledWith(
      uniId,
      expect.objectContaining({ status: 'inactive' })
    );
    expect(res.status).toBe('inactive');
  });

  it('passes status: "active" to universityModel.updateById when activated is sent', async () => {
    const updateSpy = jest.spyOn(universityModel, 'updateById').mockResolvedValue({
      id: uniId,
      name: 'Test Uni',
      status: 'active',
    });

    const res = await catalogService.patchUniversity(uniId, { status: 'activated' });
    expect(updateSpy).toHaveBeenCalledWith(
      uniId,
      expect.objectContaining({ status: 'active' })
    );
    expect(res.status).toBe('active');
  });

  it('passes status: "active" to universityModel.updateById when active is sent', async () => {
    const updateSpy = jest.spyOn(universityModel, 'updateById').mockResolvedValue({
      id: uniId,
      name: 'Test Uni',
      status: 'active',
    });

    const res = await catalogService.patchUniversity(uniId, { status: 'active' });
    expect(updateSpy).toHaveBeenCalledWith(
      uniId,
      expect.objectContaining({ status: 'active' })
    );
    expect(res.status).toBe('active');
  });

  it('rejects invalid status with 422', async () => {
    await expect(catalogService.patchUniversity(uniId, { status: 'bogus' })).rejects.toMatchObject({
      status: 422,
      message: 'status must be active or inactive',
    });
  });
});

describe('CatalogService.setUniversityStatus normalization', () => {
  const uniId = 'a1111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(catalogService, 'getUniversityById').mockResolvedValue({ id: uniId, name: 'Test Uni' });
  });

  it('accepts "deactivated" and normalizes to "inactive"', async () => {
    const setStatusSpy = jest.spyOn(universityModel, 'setStatus').mockResolvedValue({
      id: uniId,
      status: 'inactive',
    });

    const res = await catalogService.setUniversityStatus(uniId, 'deactivated');
    expect(setStatusSpy).toHaveBeenCalledWith(uniId, 'inactive');
    expect(res.status).toBe('inactive');
  });

  it('accepts "activated" and normalizes to "active"', async () => {
    const setStatusSpy = jest.spyOn(universityModel, 'setStatus').mockResolvedValue({
      id: uniId,
      status: 'active',
    });

    const res = await catalogService.setUniversityStatus(uniId, 'activated');
    expect(setStatusSpy).toHaveBeenCalledWith(uniId, 'active');
    expect(res.status).toBe('active');
  });
});

describe('UserService.updateUser status handling', () => {
  const userId = 'b2222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes "deactivated" to status: "inactive"', async () => {
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      status: 'inactive',
    });

    const res = await UserService.updateUser(userId, { status: 'deactivated' });
    expect(updateSpy).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'inactive' })
    );
    expect(res.status).toBe('inactive');
  });

  it('normalizes "inactive" to status: "inactive"', async () => {
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      status: 'inactive',
    });

    const res = await UserService.updateUser(userId, { status: 'inactive' });
    expect(updateSpy).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'inactive' })
    );
    expect(res.status).toBe('inactive');
  });

  it('normalizes "activated" to status: "active"', async () => {
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      status: 'active',
    });

    const res = await UserService.updateUser(userId, { status: 'activated' });
    expect(updateSpy).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'active' })
    );
    expect(res.status).toBe('active');
  });

  it('normalizes "active" to status: "active"', async () => {
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      status: 'active',
    });

    const res = await UserService.updateUser(userId, { status: 'active' });
    expect(updateSpy).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'active' })
    );
    expect(res.status).toBe('active');
  });

  it('rejects invalid user status with 422', async () => {
    await expect(UserService.updateUser(userId, { status: 'wrong_val' })).rejects.toMatchObject({
      status: 422,
      message: 'status must be active or inactive',
    });
  });
});

describe('UserController status methods', () => {
  const userId = 'b2222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('activateUser sets status to active', async () => {
    const updateSpy = jest.spyOn(UserService, 'updateUser').mockResolvedValue({
      id: userId,
      status: 'active',
    });

    const req = { params: { userId }, user: { user_id: 'actor-1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await UserController.activateUser(req, res);
    expect(updateSpy).toHaveBeenCalledWith(userId, { status: 'active' }, 'actor-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'User activated successfully',
      })
    );
  });

  it('deactivateUser sets status to inactive', async () => {
    const updateSpy = jest.spyOn(UserService, 'updateUser').mockResolvedValue({
      id: userId,
      status: 'inactive',
    });

    const req = { params: { userId }, user: { user_id: 'actor-1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await UserController.deactivateUser(req, res);
    expect(updateSpy).toHaveBeenCalledWith(userId, { status: 'inactive' }, 'actor-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'User deactivated successfully',
      })
    );
  });
});
