import { Socket } from 'socket.io';
import { Room } from '../Room';

export const handleToggleAudio = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { enabled } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Update participant media state
    const participant = room.updateParticipantMedia(socket.id, {
      audioEnabled: enabled
    });

    if (participant) {
      // Notify others
      socket.to(meetingId).emit('participant-media-changed', {
        socketId: socket.id,
        userId: participant.userId,
        audioEnabled: enabled
      });

      console.log(`🎤 ${participant.displayName} ${enabled ? 'unmuted' : 'muted'} audio`);
    }
  } catch (error) {
    console.error('Toggle audio error:', error);
    socket.emit('error', { message: 'Failed to toggle audio' });
  }
};

export const handleToggleVideo = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { enabled } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Update participant media state
    const participant = room.updateParticipantMedia(socket.id, {
      videoEnabled: enabled
    });

    if (participant) {
      // Notify others
      socket.to(meetingId).emit('participant-media-changed', {
        socketId: socket.id,
        userId: participant.userId,
        videoEnabled: enabled
      });

      console.log(`📹 ${participant.displayName} ${enabled ? 'enabled' : 'disabled'} video`);
    }
  } catch (error) {
    console.error('Toggle video error:', error);
    socket.emit('error', { message: 'Failed to toggle video' });
  }
};

export const handleToggleScreenShare = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { enabled } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Update participant media state
    const participant = room.updateParticipantMedia(socket.id, {
      screenShareEnabled: enabled
    });

    if (participant) {
      // Notify others
      socket.to(meetingId).emit('participant-media-changed', {
        socketId: socket.id,
        userId: participant.userId,
        screenShareEnabled: enabled
      });

      console.log(`🖥️ ${participant.displayName} ${enabled ? 'started' : 'stopped'} screen share`);
    }
  } catch (error) {
    console.error('Toggle screen share error:', error);
    socket.emit('error', { message: 'Failed to toggle screen share' });
  }
};