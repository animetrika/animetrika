
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, User } from 'lucide-react';
import { CallSession } from '../types';
import { getSocket } from '../services/api';

interface CallModalProps {
  session: CallSession;
  onEnd: () => void;
  peerName: string;
  currentUserId: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export const CallModal: React.FC<CallModalProps> = ({ session, onEnd, peerName, currentUserId }) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.isVideo);
  const [connectionStatus, setConnectionStatus] = useState(session.status);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);

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

            // Apply initial mute/video settings
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
            // Are we the Caller?
            const isInitiator = session.callerId === currentUserId;

            if (isInitiator) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('call_offer', {
                    targetId: session.receiverId,
                    offer
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
  }, []); // Run once on mount

  // Toggle Mute/Video during call
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full h-full md:w-4/5 md:h-4/5 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start">
           <div>
              <h2 className="text-xl font-bold text-white">{peerName}</h2>
              <p className={`text-sm font-mono ${connectionStatus === 'connected' ? 'text-emerald-400' : 'text-yellow-400 animate-pulse'}`}>
                 {connectionStatus === 'connected' ? formatTime(duration) : 'Connecting (P2P)...'}
              </p>
           </div>
           {isMuted && (
               <div className="bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                   MUTED
               </div>
           )}
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-slate-950 flex items-center justify-center">
            {/* Remote Video (Main) */}
            <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline
                className="w-full h-full object-cover"
            />
            {/* Placeholder if no video */}
            <div className="absolute inset-0 flex items-center justify-center -z-10">
                <User size={64} className="text-slate-800" />
            </div>

            {/* Local Video (PIP) */}
            <div className="absolute bottom-24 right-4 w-32 h-48 bg-black rounded-lg border-2 border-slate-700 overflow-hidden shadow-lg transition-opacity duration-300">
                 <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline
                    muted 
                    className={`w-full h-full object-cover ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}
                />
                {!isVideoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                         <VideoOff size={24} className="text-slate-500"/>
                    </div>
                )}
            </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 w-full p-6 bg-gradient-to-t from-black/90 to-transparent flex justify-center gap-6">
            <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`p-4 rounded-full transition-all ${!isMuted ? 'bg-slate-700/50 hover:bg-slate-700 text-white' : 'bg-white text-black'}`}
            >
                {isMuted ? <MicOff /> : <Mic />}
            </button>

            <button 
                onClick={onEnd}
                className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 scale-110"
            >
                <PhoneOff />
            </button>

            <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                className={`p-4 rounded-full transition-all ${isVideoEnabled ? 'bg-slate-700/50 hover:bg-slate-700 text-white' : 'bg-white text-black'}`}
            >
                {!isVideoEnabled ? <VideoOff /> : <Video />}
            </button>
        </div>
      </div>
    </div>
  );
};
