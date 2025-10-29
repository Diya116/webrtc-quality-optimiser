import { Socket } from 'socket.io';
import { Room } from '../Room';

export const handleIceCandidate = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { to, candidate } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    if (!to || !candidate) {
      socket.emit('error', { message: 'Invalid ICE candidate data' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Forward ICE candidate to specific peer
    socket.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate
    });

    console.log(` ICE candidate sent from ${socket.id} to ${to}`);
  } catch (error) {
    console.error('ICE candidate error:', error);
    socket.emit('error', { message: 'Failed to send ICE candidate' });
  }
};