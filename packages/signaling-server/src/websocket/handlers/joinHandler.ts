import { Socket } from 'socket.io';
import { Room, ParticipantInfo } from '../Room';
import { ParticipantService } from '../../services/participantService';
import { MeetingService } from '../../services/meetingService';
import { MeetingStatus } from '@prisma/client';

export const handleJoinMeeting = async (
  socket: Socket,
  data: any,
  rooms: Map<string, Room>
) => {
  try {
    const { meetingId, displayName } = data;
    const user = (socket as any).user;

    if (!meetingId || !displayName) {
      socket.emit('error', {
        message: 'Meeting ID and display name are required'
      });
      return;
    }

    // Verify meeting exists
    const meeting = await MeetingService.getMeetingByMeetingId(meetingId);
    
    if (!meeting) {
      socket.emit('error', {
        message: 'Meeting not found'
      });
      return;
    }

    // Get or create room
    let room = rooms.get(meetingId);
    if (!room) {
      room = new Room(meetingId);
      rooms.set(meetingId, room);
    }

    // Check if user already exists in room (by userId)
    const existingParticipant = room.getParticipantByUserId(user.userId);

    if (existingParticipant) {
      console.log(`⚠️ User ${displayName} (${user.userId}) is already in meeting ${meetingId}`);
      
      // Handle reconnection with new socket
      if (existingParticipant.socketId !== socket.id) {
        console.log(`🔄 Reconnecting user with new socket. Old: ${existingParticipant.socketId}, New: ${socket.id}`);
        
        // Remove old socket from room
        room.removeParticipant(existingParticipant.socketId);
        
        // Update with new socket info
        const updatedParticipant: ParticipantInfo = {
          ...existingParticipant,
          socketId: socket.id,
          joinedAt: new Date()
        };
        
        // Add participant with new socket
        room.addParticipant(updatedParticipant);
        
        // Join new socket to room
        socket.join(meetingId);
        (socket as any).currentMeetingId = meetingId;
        
        // Notify others about reconnection
        socket.to(meetingId).emit('participant-reconnected', {
          participant: {
            socketId: updatedParticipant.socketId,
            userId: updatedParticipant.userId,
            displayName: updatedParticipant.displayName,
            isHost: updatedParticipant.isHost,
            audioEnabled: updatedParticipant.audioEnabled,
            videoEnabled: updatedParticipant.videoEnabled,
            screenShareEnabled: updatedParticipant.screenShareEnabled
          }
        });
        
        // Send current state to reconnected user
        const existingParticipants = room.getAllParticipants()
          .filter(p => p.socketId !== socket.id);

        socket.emit('joined-meeting', {
          success: true,
          meetingId,
          participant: {
            socketId: updatedParticipant.socketId,
            userId: updatedParticipant.userId,
            displayName: updatedParticipant.displayName,
            isHost: updatedParticipant.isHost,
            audioEnabled: updatedParticipant.audioEnabled,
            videoEnabled: updatedParticipant.videoEnabled
          },
          participants: existingParticipants.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            displayName: p.displayName,
            isHost: p.isHost,
            audioEnabled: p.audioEnabled,
            videoEnabled: p.videoEnabled,
            screenShareEnabled: p.screenShareEnabled
          }))
        });
        
        console.log(`✅ ${displayName} reconnected to meeting ${meetingId}`);
        return;
      } else {
        // Same socket trying to join again - send current state
        const currentParticipants = room.getAllParticipants()
          .filter(p => p.socketId !== socket.id);

        socket.emit('joined-meeting', {
          success: true,
          meetingId,
          participant: {
            socketId: existingParticipant.socketId,
            userId: existingParticipant.userId,
            displayName: existingParticipant.displayName,
            isHost: existingParticipant.isHost,
            audioEnabled: existingParticipant.audioEnabled,
            videoEnabled: existingParticipant.videoEnabled
          },
          participants: currentParticipants.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            displayName: p.displayName,
            isHost: p.isHost,
            audioEnabled: p.audioEnabled,
            videoEnabled: p.videoEnabled,
            screenShareEnabled: p.screenShareEnabled
          }))
        });
        
        console.log(`ℹ️ ${displayName} already in meeting, sent current state`);
        return;
      }
    }

    // NEW USER JOINING - No existing participant found
    
    // Determine if user should be host
    const isHost = room.getParticipantCount() === 0 || meeting.hostId === user.userId;

    // Update meeting status to active if first participant
    if (room.getParticipantCount() === 0) {
      await MeetingService.updateMeetingStatus(meetingId, MeetingStatus.ACTIVE);
    }

    // Create participant info
    const participant: ParticipantInfo = {
      socketId: socket.id,
      userId: user.userId,
      displayName,
      isHost,
      audioEnabled: true,
      videoEnabled: true,
      screenShareEnabled: false,
      joinedAt: new Date()
    };

    // Add to room FIRST (this prevents race conditions)
    room.addParticipant(participant);

    // Join socket room
    socket.join(meetingId);
    (socket as any).currentMeetingId = meetingId;

    // Add participant to database AFTER room
    // This ensures consistency - if DB fails, we can handle it
    try {
      await ParticipantService.addParticipant({
        meetingId,
        userId: user.userId,
        displayName,
        isHost
      });
    } catch (dbError) {
      console.error('Failed to add participant to database:', dbError);
      // Remove from room if database fails
      room.removeParticipant(socket.id);
      throw new Error('Failed to join meeting - database error');
    }

    // Get existing participants (exclude self)
    const allParticipants = room.getAllParticipants();
    const existingParticipants = allParticipants.filter(p => p.socketId !== socket.id);
    
    console.log(`📊 Total participants in room: ${allParticipants.length}`);
    console.log(`📊 Participants to send to new user: ${existingParticipants.length}`);
    console.log(`📊 New user: ${displayName} (${socket.id})`);

    // Send current state to new user
    socket.emit('joined-meeting', {
      success: true,
      meetingId,
      participant: {
        socketId: participant.socketId,
        userId: participant.userId,
        displayName: participant.displayName,
        isHost: participant.isHost,
        audioEnabled: participant.audioEnabled,
        videoEnabled: participant.videoEnabled
      },
      participants: existingParticipants.map(p => ({
        socketId: p.socketId,
        userId: p.userId,
        displayName: p.displayName,
        isHost: p.isHost,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled,
        screenShareEnabled: p.screenShareEnabled
      }))
    });

    // Notify others about new participant
    socket.to(meetingId).emit('participant-joined', {
      participant: {
        socketId: participant.socketId,
        userId: participant.userId,
        displayName: participant.displayName,
        isHost: participant.isHost,
        audioEnabled: participant.audioEnabled,
        videoEnabled: participant.videoEnabled
      }
    });

    console.log(`✅ ${displayName} joined meeting ${meetingId} (${room.getParticipantCount()} total participants)`);
    
  } catch (error: any) {
    console.error('Join meeting error:', error);
    socket.emit('error', {
      message: error.message || 'Failed to join meeting'
    });
  }
};