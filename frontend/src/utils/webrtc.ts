// webrtc.ts - WebRTC utility functions

const configuration: RTCConfiguration = {
  iceServers: [
    // For localhost testing, just use Google's STUN server
    // STUN helps discover public IP but not required for localhost
    { urls: 'stun:stun.l.google.com:19302' },
  ],
  // No TURN servers needed for localhost - direct peer-to-peer works fine
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
const peerConnections = new Map<string, RTCPeerConnection>();
// Per-peer negotiation state to handle offer/answer collisions (perfect negotiation)
const makingOffer = new Map<string, boolean>();
const politePeer = new Map<string, boolean>();

// Get local media stream
export const getLocalStream = async (
  video: boolean = true,
  audio: boolean = true
): Promise<MediaStream> => {
  try {
    console.log('📹 Requesting media stream:', { video, audio });
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: video
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 },
          }
        : false,
      audio: audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
    });

    console.log('✅ Got media stream:', {
      id: stream.id,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      tracks: stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        label: t.label,
      })),
    });

    localStream = stream;

    // Listen for track ended events
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        console.warn(`⚠️ Track ended: ${track.kind}`);
        window.dispatchEvent(new Event('webrtc-local-stream-stopped'));
      });
    });

    return stream;
  } catch (error: any) {
    console.error('❌ Error getting local stream:', error);
    throw new Error(
      `Failed to access camera/microphone: ${error.message || 'Permission denied'}`
    );
  }
};

// Stop local stream
export const stopLocalStream = () => {
  console.log('⏹️ Stopping local stream...');
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`Stopped ${track.kind} track`);
    });
    localStream = null;
  }
};

// Toggle audio track
export const toggleAudio = (enabled: boolean) => {
  console.log('🎤 Toggling audio to:', enabled);
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
      console.log(`Audio track enabled: ${track.enabled}`);
    });
  }
};

// Toggle video track
export const toggleVideo = (enabled: boolean) => {
  console.log('📹 Toggling video to:', enabled);
  if (localStream) {
    console.log('Current video tracks:', localStream.getVideoTracks().map(t => ({
      id: t.id,
      enabled: t.enabled,
    })));
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
      console.log(`Video track enabled: ${track.enabled}`);
    });
  }
};

// Create peer connection
const createPeerConnection = (
  peerId: string,
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null
): RTCPeerConnection => {
  console.log('🔗 Creating peer connection for:', peerId);

  const peerConnection = new RTCPeerConnection(configuration);

  // Add local stream tracks to peer connection
  if (localMediaStream) {
    console.log('➕ Adding local tracks to peer connection:', peerId);
    localMediaStream.getTracks().forEach((track) => {
      console.log(`Adding ${track.kind} track to peer ${peerId}`);
      peerConnection.addTrack(track, localMediaStream);
    });
  } else {
    console.warn('⚠️ No local stream to add to peer connection');
  }

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('🧊 Sending ICE candidate to:', peerId, 'type:', event.candidate.type);
      socket.emit('ice-candidate', {
        to: peerId,
        candidate: event.candidate,
      });
    }
  };

  // Handle connection state changes
  peerConnection.onconnectionstatechange = async () => {
    console.log(`🔄 Connection state with ${peerId}:`, peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'failed') {
      console.error('❌ RTCPeerConnection FAILED with peer:', peerId);
      console.error('⚠️ This usually means: DTLS handshake failed, incompatible codecs, or certificate issues');
      console.error('Debug info:', {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState,
        localDescription: peerConnection.localDescription?.type,
        remoteDescription: peerConnection.remoteDescription?.type,
        iceGatheringState: peerConnection.iceGatheringState
      });
      console.error('💡 Try: 1) Check browser console for DTLS errors, 2) Verify both peers use same browser, 3) Check SDP for codec compatibility');
      
      // Attempt ICE restart to recover
      console.warn('🔄 Attempting ICE restart to recover connection...');
      try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', {
          to: peerId,
          offer: offer,
        });
        console.log('✅ ICE restart offer sent to:', peerId);
      } catch (err) {
        console.error('❌ ICE restart failed:', err);
      }
    } else if (peerConnection.connectionState === 'disconnected') {
      console.warn('⚠️ Disconnected from peer:', peerId);
    } else if (peerConnection.connectionState === 'connected') {
      console.log('✅ Successfully connected to peer:', peerId);
    }
  };

  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log(`❄️ ICE connection state with ${peerId}:`, peerConnection.iceConnectionState);
    
    if (peerConnection.iceConnectionState === 'connected') {
      console.log(`✅ ICE successfully connected to ${peerId}`);
    } else if (peerConnection.iceConnectionState === 'failed') {
      console.error(`❌ ICE connection failed with ${peerId} - connection cannot be established`);
      console.log(`💡 Tip: For localhost, check if both peers are using the same network. For remote, you may need TURN servers.`);
    } else if (peerConnection.iceConnectionState === 'disconnected') {
      console.warn(`⚠️ ICE disconnected from ${peerId} - attempting reconnection...`);
    }
  };

  // Handle ICE candidate errors (these are often non-fatal)
  peerConnection.addEventListener('icecandidateerror', (event: any) => {
    // Error 701 is common for IPv6/network interface issues and usually non-fatal
    if (event.errorCode === 701) {
      console.warn(`⚠️ ICE candidate warning (non-fatal) for ${peerId}:`, {
        errorCode: event.errorCode,
        errorText: event.errorText,
        url: event.url
      });
      return;
    }
    
    // Log other errors as errors
    console.error(`❌ ICE candidate error for ${peerId}:`, {
      errorCode: event.errorCode,
      errorText: event.errorText,
      url: event.url,
      address: event.address,
      port: event.port
    });
  });

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('📺 Received remote track from:', peerId, {
      kind: event.track.kind,
      enabled: event.track.enabled,
      readyState: event.track.readyState,
      muted: event.track.muted,
      label: event.track.label,
      streams: event.streams.length,
      streamId: event.streams[0]?.id,
    });

    // Log track settings if available
    if (event.track.getSettings) {
      console.log('📺 Track settings:', event.track.getSettings());
    }

    if (event.streams && event.streams[0]) {
      const stream = event.streams[0];
      console.log('✅ Setting remote stream for peer:', peerId, {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted,
        })),
      });
      onRemoteStream(peerId, event.streams[0]);
      
      // Verify stream is working after a short delay
      setTimeout(() => {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('🔍 Video track status after 2s:', {
            enabled: videoTrack.enabled,
            readyState: videoTrack.readyState,
            muted: videoTrack.muted,
            settings: videoTrack.getSettings()
          });
        }
      }, 2000);
    }
  };

  peerConnections.set(peerId, peerConnection);
  return peerConnection;
};

// Handle new peer (create offer)
export const handleNewPeer = async (
  peerId: string,
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null = null
) => {
  try {
    console.log('👤 Handling new peer (creating offer):', peerId);
    // Determine polite role deterministically (use socket ids)
    try {
      const myId = socket.id as string;
      politePeer.set(peerId, peerId > myId);
    } catch (e) {
      politePeer.set(peerId, false);
    }

    const peerConnection = createPeerConnection(
      peerId,
      socket,
      onRemoteStream,
      localMediaStream
    );

    // Create and send offer (mark makingOffer to handle glare)
    makingOffer.set(peerId, true);
    console.log('📤 Creating offer for:', peerId);
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peerConnection.setLocalDescription(offer);
    console.log('✅ Local description set, sending offer to:', peerId);
    console.log('📄 Offer SDP (first 500 chars):', offer.sdp?.substring(0, 500));

    socket.emit('offer', {
      to: peerId,
      offer: offer,
    });
    makingOffer.set(peerId, false);
  } catch (error) {
    console.error('❌ Error handling new peer:', error);
  }
};

// Handle incoming offer (create answer)
export const handleOffer = async (
  data: { from: string; offer: RTCSessionDescriptionInit },
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null = null
) => {
  try {
    const peerId = data.from;
    console.log('📥 Handling offer from:', peerId);

    const making = makingOffer.get(peerId) || false;
    const polite = politePeer.get(peerId) || false;

    // If both are making an offer (glare) and we're impolite, ignore the incoming offer
    if (making && !polite) {
      console.warn('⚠️ Offer collision detected from', peerId, '- ignoring (impolite)');
      return;
    }

    let peerConnection = peerConnections.get(peerId);

    if (!peerConnection) {
      console.log('Creating new peer connection for:', peerId);
      peerConnection = createPeerConnection(
        peerId,
        socket,
        onRemoteStream,
        localMediaStream
      );
    }

    console.log('🤝 Setting remote description (offer)');
    console.log('📄 Received offer SDP (first 500 chars):', data.offer.sdp?.substring(0, 500));
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    console.log('📤 Creating answer for:', peerId);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log('📄 Answer SDP (first 500 chars):', answer.sdp?.substring(0, 500));

    console.log('✅ Sending answer to:', peerId);
    socket.emit('answer', {
      to: peerId,
      answer: answer,
    });
  } catch (error) {
    console.error('❌ Error handling offer:', error);
  }
};

// Handle incoming answer
export const handleAnswer = async (data: {
  from: string;
  answer: RTCSessionDescriptionInit;
}) => {
  try {
    console.log('📥 Handling answer from:', data.from);

    const peerConnection = peerConnections.get(data.from);

    if (!peerConnection) {
      console.error('❌ No peer connection found for:', data.from);
      return;
    }

    console.log('📡 Current signaling state:', peerConnection.signalingState);

    // ✅ Prevent applying duplicate or out-of-order answers
    if (peerConnection.signalingState !== 'have-local-offer') {
      console.warn(
        `⚠️ Skipping answer from ${data.from} — current state is "${peerConnection.signalingState}"`
      );
      return;
    }

    console.log('🤝 Setting remote description (answer) from:', data.from);
    console.log('📄 Answer SDP preview:', data.answer.sdp?.substring(0, 300) + '...');
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );

    console.log('✅ Answer processed successfully for:', data.from);
    
    // Log negotiated codecs after setting answer
    setTimeout(async () => {
      const stats = await peerConnection!.getStats();
      let foundCodec = false;
      stats.forEach(report => {
        if (report.type === 'codec') {
          foundCodec = true;
          console.log(`🎬 Negotiated codec with ${data.from}:`, {
            mimeType: report.mimeType,
            payloadType: report.payloadType,
            clockRate: report.clockRate,
            sdpFmtpLine: report.sdpFmtpLine
          });
        }
      });
      if (!foundCodec) {
        console.warn(`⚠️ No codecs found in stats for ${data.from} - possible codec negotiation failure`);
      }
    }, 1000);
  } catch (error) {
    console.error('❌ Error handling answer:', error);
  }
};


// Handle ICE candidate
export const handleIceCandidate = async (data: {
  from: string;
  candidate: RTCIceCandidateInit;
}) => {
  try {
    console.log('🧊 Handling ICE candidate from:', data.from);

    const peerConnection = peerConnections.get(data.from);

    if (!peerConnection) {
      console.error('❌ No peer connection found for:', data.from);
      return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    console.log('✅ ICE candidate added for:', data.from);
  } catch (error) {
    console.error('❌ Error handling ICE candidate:', error);
  }
};

// Start screen share
export const startScreenShare = async (): Promise<MediaStream | null> => {
  try {
    console.log('🖥️ Starting screen share...');
    
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' } as any,
      audio: false,
    });

    screenStream = stream;

    // Handle stream ended
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('🖥️ Screen share stopped');
      stopScreenShare();
    });

    // Replace video track in all peer connections
    const videoTrack = stream.getVideoTracks()[0];
    peerConnections.forEach((peerConnection, peerId) => {
      const senders = peerConnection.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');
      if (videoSender) {
        console.log('🔄 Replacing video track for peer:', peerId);
        videoSender.replaceTrack(videoTrack);
      }
    });

    console.log('✅ Screen share started');
    return stream;
  } catch (error: any) {
    console.error('❌ Error starting screen share:', error);
    return null;
  }
};

// Stop screen share
export const stopScreenShare = async () => {
  console.log('⏹️ Stopping screen share...');
  
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  // Restore camera video track
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      peerConnections.forEach((peerConnection, peerId) => {
        const senders = peerConnection.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          console.log('🔄 Restoring camera track for peer:', peerId);
          videoSender.replaceTrack(videoTrack);
        }
      });
    }
  }

  console.log('✅ Screen share stopped');
};

// Close all peer connections
export const closeAllConnections = () => {
  console.log('🔌 Closing all peer connections...');
  
  peerConnections.forEach((peerConnection, peerId) => {
    console.log('Closing connection with:', peerId);
    peerConnection.close();
  });
  
  peerConnections.clear();
  console.log('✅ All connections closed');
};

// Get peer connection (for debugging)
export const getPeerConnection = (peerId: string): RTCPeerConnection | undefined => {
  return peerConnections.get(peerId);
};

// Get all peer connections (for debugging)
export const getAllPeerConnections = (): Map<string, RTCPeerConnection> => {
  return peerConnections;
};

// Get detailed diagnostics for a peer
export const getPeerDiagnostics = async (peerId: string) => {
  const pc = peerConnections.get(peerId);
  if (!pc) {
    console.warn('No peer connection for', peerId);
    return null;
  }

  const stats = await pc.getStats(null);
  const receivers = pc.getReceivers();
  const senders = pc.getSenders();
  
  const inboundRtp: any[] = [];
  const outboundRtp: any[] = [];
  const codecs: any[] = [];
  const transports: any[] = [];
  const iceCandidates: any[] = [];
  
  stats.forEach(stat => {
    if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
      inboundRtp.push(stat);
    }
    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
      outboundRtp.push(stat);
    }
    if (stat.type === 'codec') {
      codecs.push({
        mimeType: stat.mimeType,
        payloadType: stat.payloadType,
        clockRate: stat.clockRate,
        sdpFmtpLine: stat.sdpFmtpLine
      });
    }
    if (stat.type === 'transport') {
      transports.push({
        dtlsState: stat.dtlsState,
        iceState: stat.iceState,
        selectedCandidatePairId: stat.selectedCandidatePairId
      });
    }
    if (stat.type === 'local-candidate' || stat.type === 'remote-candidate') {
      iceCandidates.push({
        type: stat.type,
        candidateType: stat.candidateType,
        protocol: stat.protocol,
        address: stat.address,
        port: stat.port
      });
    }
  });

  const diagnostics = {
    peerId,
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    signalingState: pc.signalingState,
    iceGatheringState: pc.iceGatheringState,
    receivers: receivers.map(r => ({
      trackId: r.track?.id,
      kind: r.track?.kind,
      enabled: r.track?.enabled,
      readyState: r.track?.readyState,
      label: r.track?.label,
      muted: r.track?.muted,
    })),
    senders: senders.map(s => ({
      trackId: s.track?.id,
      kind: s.track?.kind,
      enabled: s.track?.enabled,
      readyState: s.track?.readyState,
    })),
    inboundRtp,
    outboundRtp,
    codecs,
    transports,
    iceCandidates,
  };

  console.log('🔍 Peer diagnostics for', peerId, diagnostics);
  
  // Check for specific issues
  if (pc.connectionState === 'failed') {
    console.error('❌❌❌ CONNECTION FAILED DIAGNOSIS ❌❌❌');
    console.error('ICE State:', pc.iceConnectionState);
    console.error('Signaling State:', pc.signalingState);
    
    const transport = transports[0];
    if (transport) {
      console.error('DTLS State:', transport.dtlsState);
      if (transport.dtlsState === 'failed') {
        console.error('🚨 DTLS HANDSHAKE FAILED - This is the root cause!');
        console.error('Possible reasons:');
        console.error('1. Certificate validation failed');
        console.error('2. Clock skew between peers');
        console.error('3. Network filtering DTLS packets');
        console.error('4. Browser incompatibility');
      }
    }
    
    if (codecs.length === 0) {
      console.error('🚨 NO CODECS NEGOTIATED - Codec mismatch!');
      console.error('Both peers must support at least one common codec');
    }
    
    if (inboundRtp.length === 0) {
      console.error('🚨 NO INBOUND RTP - Not receiving any video data');
    }
  }
  
  return diagnostics;
};