export interface ParticipantInfo {
  socketId: string;
  userId: string;
  displayName: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  joinedAt: Date;
}

export class Room {
  private meetingId: string;
  private participants: Map<string, ParticipantInfo> = new Map();
   
  constructor(meetingId: string) {
    this.meetingId = meetingId;
  }

  addParticipant(participant: ParticipantInfo): void {
    // Check if participant already exists
    if (this.participants.has(participant.socketId)) {
      console.log(`⚠️ Participant ${participant.displayName} (${participant.socketId}) already in room ${this.meetingId}`);
      return;
    }
    
    this.participants.set(participant.socketId, participant);
    console.log(`✅ Participant ${participant.displayName} (${participant.socketId}) added to room ${this.meetingId}`);
    console.log(`📊 Total participants in room: ${this.participants.size}`);
  }

  removeParticipant(socketId: string): ParticipantInfo | undefined {
    const participant = this.participants.get(socketId);
    this.participants.delete(socketId);
    
    if (participant) {
      console.log(
        `👋 Participant ${participant.displayName} left room ${this.meetingId}`
      );
    }
    
    return participant;
  }

  getParticipant(socketId: string): ParticipantInfo | undefined {
    return this.participants.get(socketId);
  }

  getParticipantByUserId(userId: string): ParticipantInfo | undefined {
    return Array.from(this.participants.values()).find(p => p.userId === userId);
  }

  getAllParticipants(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  updateParticipantMedia(
    socketId: string,
    media: Partial<Pick<ParticipantInfo, 'audioEnabled' | 'videoEnabled' | 'screenShareEnabled'>>
  ): ParticipantInfo | undefined {
    const participant = this.participants.get(socketId);
    if (participant) {
      Object.assign(participant, media);
      return participant;
    }
    return undefined;
  }

  isEmpty(): boolean {
    return this.participants.size === 0;
  }

  getMeetingId(): string {
    return this.meetingId;
  }
}