import { Socket } from 'socket.io';
import { Room } from '../Room';

export const handleAnswer = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { to, answer } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    if (!to || !answer) {
      socket.emit('error', { message: 'Invalid answer data' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Forward answer to specific peer
    socket.to(to).emit('answer', {
      from: socket.id,
      answer
    });

    console.log(`📤 Answer sent from ${socket.id} to ${to}`);
  } catch (error) {
    console.error('Answer error:', error);
    socket.emit('error', { message: 'Failed to send answer' });
  }
};