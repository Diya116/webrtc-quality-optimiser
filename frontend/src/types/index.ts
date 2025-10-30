export interface User {
  id: string;
  email: string;
  name: string;
  token: string;
}

export interface Meeting {
  id: string;
  meetingId: string;
  title: string;
  hostId: string;
  status: 'scheduled' | 'active' | 'ended';
  createdAt: string;
}

export interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  stream?: MediaStream|null;
}

export interface JoinMeetingData {
  meetingId: string;
  displayName: string;
}

export interface MediaControlData {
  enabled: boolean;
}