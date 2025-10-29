import prisma from '../config/prisma';

export interface JoinMeetingDTO {
  meetingId: string;
  userId: string;
  displayName: string;
  isHost: boolean;
}

export class ParticipantService {
  static async addParticipant({ meetingId, userId, displayName, isHost }: JoinMeetingDTO) {
    // Get meeting
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // Check if already a participant
    const existingParticipant = await prisma.participant.findFirst({
      where: {
        meetingId: meeting.id,
        userId,
        leftAt: null
      }
    });

    if (existingParticipant) {
      return existingParticipant;
    }

    // Add participant
    const participant = await prisma.participant.create({
      data: {
        meetingId: meeting.id,
        userId,
        displayName,
        isHost
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
    });

    return participant;
  }

  static async removeParticipant(meetingId: string, userId: string) {
    // Get meeting
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // Update participant left time
    const participant = await prisma.participant.updateMany({
      where: {
        meetingId: meeting.id,
        userId,
        leftAt: null
      },
      data: {
        leftAt: new Date()
      }
    });

    return participant;
  }

  static async getActiveParticipants(meetingId: string) {
    // Get meeting
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const participants = await prisma.participant.findMany({
      where: {
        meetingId: meeting.id,
        leftAt: null
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
    });

    return participants;
  }

  static async getMeetingHistory(meetingId: string) {
    // Get meeting
    const meeting = await prisma.meeting.findUnique({
      where: { meetingId }
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const participants = await prisma.participant.findMany({
      where: {
        meetingId: meeting.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        joinedAt: 'asc'
      }
    });

    return participants;
  }
}