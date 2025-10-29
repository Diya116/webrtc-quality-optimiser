import { Socket } from 'socket.io';
import { Room } from '../Room';

export const handleOffer = (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { to, offer } = data;
    const meetingId = (socket as any).currentMeetingId;

    if (!meetingId) {
      socket.emit('error', { message: 'Not in a meeting' });
      return;
    }

    if (!to || !offer) {
      socket.emit('error', { message: 'Invalid offer data' });
      return;
    }

    const room = rooms.get(meetingId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Forward offer to specific peer
    socket.to(to).emit('offer', {
      from: socket.id,
      offer
    });

    console.log(`📤 Offer sent from ${socket.id} to ${to}`);
  } catch (error) {
    console.error('Offer error:', error);
    socket.emit('error', { message: 'Failed to send offer' });
  }
};