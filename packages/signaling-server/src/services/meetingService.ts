import prisma from '../config/prisma';
import { v4 as uuidv4 } from 'uuid';
import { MeetingStatus } from '@prisma/client';

export interface CreateMeetingDTO {
  hostId: string;
  title: string;
}

export class MeetingService {
  static async createMeeting({ hostId, title }: CreateMeetingDTO) {
    // Generate short meeting ID
    console.log('Generating meeting ID...');
    const meetingId = uuidv4().substring(0, 10).toUpperCase();
    console.log('Creating meeting with ID:', meetingId);
    const meeting = await prisma.meeting.create({
      data: {
        meetingId,
        hostId,
        title,
        status: MeetingStatus.SCHEDULED
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return meeting;
  }

  static async getMeetingByMeetingId(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        participants: {
          where: {
            leftAt: null // Only active participants
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    return meeting;
  }

  static async getMeetingById(id: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    return meeting;
  }

  static async updateMeetingStatus(meetingId: string, status: MeetingStatus) {
    const updateData: any = { status };

    if (status === MeetingStatus.ACTIVE) {
      updateData.startedAt = new Date();
    } else if (status === MeetingStatus.ENDED) {
      updateData.endedAt = new Date();
    }

    const meeting = await prisma.meeting.update({
      where: { meetingId },
      data: updateData
    });

    return meeting;
  }

  static async getHostMeetings(hostId: string) {
    const meetings = await prisma.meeting.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { participants: true }
        }
      }
    });

    return meetings;
  }

  static async getActiveMeetings(hostId: string) {
    const meetings = await prisma.meeting.findMany({
      where: {
        hostId,
        status: MeetingStatus.ACTIVE
      },
      orderBy: { startedAt: 'desc' },
      include: {
        participants: {
          where: {
            leftAt: null
          },
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    return meetings;
  }

  static async deleteMeeting(meetingId: string, userId: string) {
    // Check if user is host
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.hostId !== userId) {
      throw new Error('Only the host can delete the meeting');
    }

    await prisma.meeting.delete({
      where: { meetingId }
    });

    return { message: 'Meeting deleted successfully' };
  }
}