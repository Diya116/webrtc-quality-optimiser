import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../config/jwt';
import { Room } from './Room';
import { handleJoinMeeting } from './handlers/joinHandler';
import { handleLeaveMeeting } from './handlers/leaveHandler';
import { handleOffer } from './handlers/offerHandler';
import { handleAnswer } from './handlers/answerHandler';
import { handleIceCandidate } from './handlers/iceHandler';
import {
  handleToggleAudio,
  handleToggleVideo,
  handleToggleScreenShare
} from './handlers/mediaControlHandler';

export class WebSocketManager {
  private io: SocketServer;
  private rooms: Map<string, Room> = new Map();

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const payload = verifyToken(token);
        (socket as any).user = payload;
        
        console.log(`🔐 User authenticated: ${payload.email} (${payload.userId})`);
        next();
      } catch (error: any) {
        console.error('Authentication error:', error);
        next(new Error(`Authentication error: ${error.message}`));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      console.log(`✅ Client connected: ${socket.id} (${user.name})`);

      // Meeting events
      socket.on('join-meeting', (data) => {
        handleJoinMeeting(socket, data, this.rooms);
      });

      socket.on('leave-meeting', () => {
        handleLeaveMeeting(socket, this.rooms);
      });

      // WebRTC signaling events
      socket.on('offer', (data) => {
        handleOffer(socket, data, this.rooms);
      });

      socket.on('answer', (data) => {
        handleAnswer(socket, data, this.rooms);
      });

      socket.on('ice-candidate', (data) => {
        handleIceCandidate(socket, data, this.rooms);
      });

      // Media control events
      socket.on('toggle-audio', (data) => {
        handleToggleAudio(socket, data, this.rooms);
      });

      socket.on('toggle-video', (data) => {
        handleToggleVideo(socket, data, this.rooms);
      });

      socket.on('toggle-screen-share', (data) => {
        handleToggleScreenShare(socket, data, this.rooms);
      });

      // Disconnect event
      socket.on('disconnect', (reason) => {
        console.log(`❌ Client disconnected: ${socket.id} (${user.name}) - Reason: ${reason}`);
        handleLeaveMeeting(socket, this.rooms);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });

    // Server-level error handling
    this.io.on('error', (error) => {
      console.error('Socket.IO server error:', error);
    });
  }

  public getIO(): SocketServer {
    return this.io;
  }

  public getRooms(): Map<string, Room> {
    return this.rooms;
  }

  public getActiveRoomsCount(): number {
    return this.rooms.size;
  }

  public getTotalParticipants(): number {
    let total = 0;
    this.rooms.forEach(room => {
      total += room.getParticipantCount();
    });
    return total;
  }
}