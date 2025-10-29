import { Socket } from 'socket.io';
import { Room } from '../Room';
import { ParticipantService } from '../../services/participantService';
import { MeetingService } from '../../services/meetingService';
import { MeetingStatus } from '@prisma/client';

export const handleLeaveMeeting = async (
  socket: Socket,
  rooms: Map<string, Room>
) => {
  try {
    const meetingId = (socket as any).currentMeetingId;
    const user = (socket as any).user;

    if (!meetingId) return;

    const room = rooms.get(meetingId);
    if (!room) return;

    // Remove from room
    const participant = room.removeParticipant(socket.id);
    
    if (participant) {
      // Update database
      await ParticipantService.removeParticipant(meetingId, user.userId);

      // Notify others
      socket.to(meetingId).emit('participant-left', {
        socketId: socket.id,
        userId: participant.userId,
        displayName: participant.displayName
      });

      // If room is empty, mark meeting as ended
      if (room.isEmpty()) {
        await MeetingService.updateMeetingStatus(meetingId, MeetingStatus.ENDED);
        rooms.delete(meetingId);
        console.log(`🔚 Meeting ${meetingId} ended (all participants left)`);
      }

      console.log(`👋 ${participant.displayName} left meeting ${meetingId}`);
    }

    // Leave socket room
    socket.leave(meetingId);
    delete (socket as any).currentMeetingId;
  } catch (error) {
    console.error('Leave meeting error:', error);
  }
};