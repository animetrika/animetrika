
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, User as UserIcon, SwitchCamera, Signal, SignalHigh, SignalLow } from 'lucide-react';
import { CallSession } from '../types';
import { getSocket } from '../services/api';

interface CallModalProps {
  session: CallSession;
  onEnd: () => void;
  peerName: string;
  peerAvatar?: string;
  currentUserId: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export const CallModal: React.FC<CallModalProps> = ({ session, onEnd, peerName, peerAvatar, currentUserId }) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.isVideo);
  const [connectionStatus, setConnectionStatus] = useState(session.status);
  const [callQuality, setCallQuality] = useState<'good' | 'fair' | 'poor'>('good');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const statsInterval = useRef<any>(null);

  // Check cameras
  useEffect(() => {
      navigator.mediaDevices.enumerateDevices().then(devices => {
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
      });
  }, []);

  // Monitor Call Quality
  useEffect(() => {
      if(connectionStatus === 'connected' && peerConnection.current) {
          statsInterval.current = setInterval(async () => {
              const pc = peerConnection.current;
              if(!pc) return;
              const stats = await pc.getStats();
              let packetLoss = 0;
              let totalPackets = 0;
              
              stats.forEach(report => {
                  if(report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
                      packetLoss += report.packetsLost || 0;
                      totalPackets += (report.packetsReceived || 0) + (report.packetsLost || 0);
                  }
              });

              if(totalPackets > 0) {
                  const lossRate = packetLoss / totalPackets;
                  if(lossRate > 0.05) setCallQuality('poor');
                  else if(lossRate > 0.01) setCallQuality('fair');
                  else setCallQuality('good');
              }
          }, 2000);
      }
      return () => clearInterval(statsInterval.current);
  }, [connectionStatus]);

  // Timer
  useEffect(() => {
    let interval: any;
    if (connectionStatus === 'connected') {
      interval = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Initialize WebRTC
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const initCall = async () => {
        try {
            // 1. Get User Media
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localStream.current = stream;
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.muted = true; // Mute local feedback
            }

            stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
            stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);

            // 2. Create PeerConnection
            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnection.current = pc;

            // Add Tracks
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Handle Remote Stream
            pc.ontrack = (event) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    setConnectionStatus('connected');
                }
            };

            // Handle ICE Candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice_candidate', {
                        targetId: session.receiverId === currentUserId ? session.callerId : session.receiverId,
                        candidate: event.candidate
                    });
                }
            };

            // 3. Signaling Logic
            const isInitiator = session.callerId === currentUserId;

            if (isInitiator) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('call_offer', {
                    targetId: session.receiverId,
                    offer
                });
            } else if (session.offerSignal) {
                 // We are receiver and already have offer
                 await pc.setRemoteDescription(new RTCSessionDescription(session.offerSignal));
                 const answer = await pc.createAnswer();
                 await pc.setLocalDescription(answer);
                 socket.emit('call_answer', {
                     targetId: session.callerId,
                     answer
                 });
            }

            // Socket Event Listeners
            socket.on('call_offer', async (data) => {
                if (!pc.currentRemoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('call_answer', {
                        targetId: data.callerId,
                        answer
                    });
                }
            });

            socket.on('call_answer', async (data) => {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                setConnectionStatus('connected');
            });

            socket.on('ice_candidate', async (data) => {
                try {
                    if(pc.remoteDescription) {
                        await pc.addIceCandidate(data.candidate);
                    }
                } catch (e) {
                    console.error("Error adding ICE", e);
                }
            });

        } catch (e) {
            console.error("Call initialization failed", e);
            alert("Could not access camera/microphone");
            onEnd();
        }
    };

    initCall();

    return () => {
        // Cleanup
        if(localStream.current) {
            localStream.current.getTracks().forEach(t => t.stop());
        }
        if(peerConnection.current) {
            peerConnection.current.close();
        }
        socket.off('call_offer');
        socket.off('call_answer');
        socket.off('ice_candidate');
    };
  }, []); 

  // Toggle Mute/Video
  useEffect(() => {
      if(localStream.current) {
          localStream.current.getAudioTracks().forEach(t => t.enabled = !isMuted);
      }
  }, [isMuted]);

  useEffect(() => {
      if(localStream.current) {
          localStream.current.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
      }
  }, [isVideoEnabled]);

  const switchCamera = async () => {
      if(!localStream.current) return;
      const currentVideoTrack = localStream.current.getVideoTracks()[0];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      
      if(videoInputs.length < 2) return;

      // Find next camera
      const currentDeviceId = currentVideoTrack.getSettings().deviceId;
      const currentIndex = videoInputs.findIndex(d => d.deviceId === currentDeviceId);
      const nextDevice = videoInputs[(currentIndex + 1) % videoInputs.length];

      const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextDevice.deviceId } },
          audio: false
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace in local stream
      localStream.current.removeTrack(currentVideoTrack);
      localStream.current.addTrack(newVideoTrack);
      currentVideoTrack.stop();
      if(localVideoRef.current) localVideoRef.current.srcObject = localStream.current;

      // Replace in Peer Connection
      if(peerConnection.current) {
          const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video');
          if(sender) sender.replaceTrack(newVideoTrack);
      }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in p-4">
      {/* Manga Action Panel */}
      <div className="relative w-full h-full md:w-[90vw] md:h-[90vh] bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start bg-white/90 dark:bg-black/90 border-b-2 border-black dark:border-white">
           <div className="flex items-center gap-4">
              <div className="relative">
                  {peerAvatar ? (
                      <img src={peerAvatar} alt={peerName} className="w-16 h-16 border-2 border-black dark:border-white object-cover grayscale hover:grayscale-0 transition-all" />
                  ) : (
                      <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 flex items-center justify-center border-2 border-black dark:border-white">
                          <UserIcon size={32} className="text-black dark:text-white" />
                      </div>
                  )}
                  {connectionStatus === 'connected' && (
                      <div className="absolute -bottom-2 -right-2 bg-white dark:bg-black border-2 border-black dark:border-white p-1">
                           {callQuality === 'good' ? <SignalHigh size={16} className="text-black dark:text-white"/> : <SignalLow size={16} className="text-black dark:text-white"/>}
                      </div>
                  )}
              </div>
              <div>
                  <h2 className="text-3xl font-comic uppercase tracking-wider text-black dark:text-white">{peerName}</h2>
                  <div className="flex items-center gap-2">
                     <span className="font-mono text-lg font-bold bg-black text-white dark:bg-white dark:text-black px-2">
                        {connectionStatus === 'connected' ? formatTime(duration) : 'CONNECTING...'}
                     </span>
                  </div>
              </div>
           </div>

           {isMuted && (
               <div className="bg-white dark:bg-black border-2 border-black dark:border-white px-4 py-2 uppercase font-black animate-pulse shadow-manga-sm dark:shadow-manga-sm-dark">
                   MUTED!
               </div>
           )}
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden halftone-light dark:halftone-dark">
            <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline
                className="w-full h-full object-cover md:object-contain grayscale hover:grayscale-0 transition-all duration-500"
            />
            
            {/* Action Lines Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[repeating-linear-gradient(90deg,transparent,transparent_49px,currentColor_50px)] text-black dark:text-white"></div>

            {/* Placeholder if no video */}
            <div className="absolute inset-0 flex items-center justify-center -z-10">
                <div className="flex flex-col items-center gap-4">
                    <h1 className="text-6xl font-comic opacity-20 -rotate-12">VS</h1>
                </div>
            </div>

            {/* Local Video (PIP) */}
            <div className="absolute bottom-24 right-6 w-32 h-44 md:w-56 md:h-80 bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden group">
                 <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline
                    muted 
                    className={`w-full h-full object-cover mirror grayscale group-hover:grayscale-0 transition-all ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}
                />
                {!isVideoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-800">
                         <VideoOff size={32} className="text-black dark:text-white opacity-50"/>
                    </div>
                )}
                <div className="absolute top-0 left-0 bg-black text-white dark:bg-white dark:text-black px-2 font-bold text-xs">YOU</div>
                
                {hasMultipleCameras && isVideoEnabled && (
                    <button 
                        onClick={switchCamera} 
                        className="absolute bottom-2 right-2 p-2 bg-white dark:bg-black border-2 border-black dark:border-white hover:bg-gray-200"
                    >
                        <SwitchCamera size={16} />
                    </button>
                )}
            </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 w-full p-6 bg-white dark:bg-black border-t-4 border-black dark:border-white flex justify-center gap-8 z-20">
            <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`w-16 h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${!isMuted ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}
            >
                {isMuted ? <MicOff /> : <Mic />}
            </button>

            <button 
                onClick={onEnd}
                className="w-20 h-20 border-4 border-black dark:border-white bg-accent text-white flex items-center justify-center shadow-manga dark:shadow-manga-dark hover:scale-105 transition-transform active:translate-y-1"
            >
                <PhoneOff size={32} strokeWidth={3} />
            </button>

            <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                className={`w-16 h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isVideoEnabled ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}
            >
                {!isVideoEnabled ? <VideoOff /> : <Video />}
            </button>
        </div>
      </div>
    </div>
  );
};
