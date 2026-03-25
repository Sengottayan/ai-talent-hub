const { createRescheduleRequest, approveRescheduleRequest } = require('../controllers/rescheduleController');
const RescheduleRequest = require('../models/RescheduleRequest');
const Interview = require('../models/Interview');
const axios = require('axios');

jest.mock('../models/RescheduleRequest');
jest.mock('../models/Interview');
jest.mock('axios');

describe('rescheduleController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: { id: 'req123' },
      body: {
        interviewId: '123',
        candidateId: '456',
        requestedDate: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Valid'
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('createRescheduleRequest', () => {
    // ... (previous tests remain) ...
    it('should return 400 if fields are missing', async () => {
      req.body = {};
      await createRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'All fields are required.'
      }));
    });

    it('should return 400 if date is in the past', async () => {
      req.body.requestedDate = new Date(Date.now() - 86400000).toISOString();
      await createRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Requested date must be in the future.'
      }));
    });

    it('should return 409 if active request already exists', async () => {
      RescheduleRequest.findOne.mockResolvedValue({ _id: 'ext123', status: 'Pending' });
      await createRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('already have an active reschedule request')
      }));
    });

    it('should return 409 if candidate double-books with another confirmed interview', async () => {
      RescheduleRequest.findOne.mockResolvedValue(null);
      Interview.findOne.mockResolvedValue({ _id: 'collisionIntId', jobRole: 'Other Role' });
      await createRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Collision: You already have another interview')
      }));
    });

    it('should return 409 if global slot is already occupied', async () => {
      RescheduleRequest.findOne.mockResolvedValue(null);
      Interview.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'globalIntId' });

      await createRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Slot Unavailable')
      }));
    });

    it('should return 201 and create request on success', async () => {
      RescheduleRequest.findOne.mockResolvedValue(null);
      Interview.findOne.mockResolvedValue(null);
      RescheduleRequest.create.mockResolvedValue({ _id: 'newReqId', status: 'Pending' });

      await createRescheduleRequest(req, res);

      expect(RescheduleRequest.create).toHaveBeenCalled();
      expect(Interview.findByIdAndUpdate).toHaveBeenCalledWith('123', { status: 'Rescheduled' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });
  });

  describe('approveRescheduleRequest', () => {
    it('should return 404 if request not found', async () => {
      RescheduleRequest.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });
      await approveRescheduleRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should approve and trigger n8n', async () => {
      process.env.N8N_RESCHEDULE_WEBHOOK_URL = 'http://n8n.webhook';
      const mockRequest = {
        _id: 'req123',
        status: 'Pending',
        candidateId: { name: 'Cand', email: 'c@e.com' },
        interviewId: { _id: 'int123', jobRole: 'Dev' },
        save: jest.fn().mockResolvedValue(true)
      };
      RescheduleRequest.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockRequest)
      });
      axios.post.mockResolvedValue({ data: 'success' });

      await approveRescheduleRequest(req, res);

      expect(mockRequest.status).toBe('Processing');
      expect(mockRequest.save).toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });
  });
});
