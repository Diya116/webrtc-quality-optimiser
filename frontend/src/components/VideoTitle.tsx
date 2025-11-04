import React, { useEffect, useRef } from 'react';
import { MicOff, VideoOff, User } from 'lucide-react';
import {type Participant } from '../types/index';
import './VideoTitle.css';

interface VideoTileProps {
  participant: Participant;
  isLocal?: boolean;
}

const VideoTitle: React.FC<VideoTileProps> = ({ participant, isLocal = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.log(`🎬 VideoTile effect for ${participant.displayName}:`, participant.stream);
    
    if (videoRef.current && participant.stream) {
      console.log(`✅ Attaching stream for ${participant.displayName}`);
      videoRef.current.srcObject = participant.stream;
      // Try to autoplay and log video dimensions when available
      const videoEl = videoRef.current;
      const onLoaded = () => {
        console.log(`📐 Video loadedmetadata for ${participant.displayName}:`, { videoWidth: videoEl.videoWidth, videoHeight: videoEl.videoHeight });
      };
      const onPlaying = () => {
        console.log(`▶️ Playing ${participant.displayName}:`, { videoWidth: videoEl.videoWidth, videoHeight: videoEl.videoHeight });
      };

      videoEl.addEventListener('loadedmetadata', onLoaded);
      videoEl.addEventListener('playing', onPlaying);

      // Try to play (muted to satisfy autoplay policies)
      videoEl.play().catch(e => console.warn('Autoplay attempt failed for', participant.displayName, e));

      return () => {
        videoEl.removeEventListener('loadedmetadata', onLoaded);
        videoEl.removeEventListener('playing', onPlaying);
      };
    }
  }, [participant.stream, participant.displayName]);

  return (
    <div className="video-tile">
      {participant.videoEnabled && participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // mute by default (helps autoplay); provide UI to unmute if needed
          muted={true}
          className="video-element"
        />
      ) : (
        <div className="video-placeholder">
          <div className="avatar">
            <User size={48} />
          </div>
        </div>
      )}

      <div className="video-info">
        <span className="participant-name">
          {participant.displayName} {isLocal && '(You)'}
        </span>
        <div className="media-indicators">
          {!participant.audioEnabled && (
            <div className="indicator muted">
              <MicOff size={16} />
            </div>
          )}
          {!participant.videoEnabled && (
            <div className="indicator video-off">
              <VideoOff size={16} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoTitle;