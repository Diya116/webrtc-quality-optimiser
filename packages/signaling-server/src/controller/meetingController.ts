import { Request, Response } from 'express';
import { MeetingService } from '../services/meetingService';

export class MeetingController {
  static async createMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { title } = req.body;

      if (!title) {
        res.status(400).json({
          success: false,
          error: 'Meeting title is required'
        });
        return;
      }

      const meeting = await MeetingService.createMeeting({
        hostId: userId,
        title
      });

      res.status(201).json({
        success: true,
        message: 'Meeting created successfully',
        data: { meeting }
      });
    } catch (error) {
      console.error('Create meeting error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async getMeeting(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId } = req.params;

      const meeting = await MeetingService.getMeetingByMeetingId(meetingId);

      res.json({
        success: true,
        data: { meeting }
      });
    } catch (error: any) {
      console.error('Get meeting error:', error);

      if (error.message === 'Meeting not found') {
        res.status(404).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async getMyMeetings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      const meetings = await MeetingService.getHostMeetings(userId);

      res.json({
        success: true,
        data: { meetings }
      });
    } catch (error) {
      console.error('Get my meetings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async getActiveMeetings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      const meetings = await MeetingService.getActiveMeetings(userId);

      res.json({
        success: true,
        data: { meetings }
      });
    } catch (error) {
      console.error('Get active meetings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async deleteMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { meetingId } = req.params;

      const result = await MeetingService.deleteMeeting(meetingId, userId);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      console.error('Delete meeting error:', error);

      if (error.message === 'Meeting not found') {
        res.status(404).json({
          success: false,
          error: error.message
        });
        return;
      }

      if (error.message === 'Only the host can delete the meeting') {
        res.status(403).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}