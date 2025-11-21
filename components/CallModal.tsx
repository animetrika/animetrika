
import React, { useEffect, useRef, useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, User as UserIcon, 
  SwitchCamera, Signal, SignalHigh, SignalLow, Monitor, 
  Disc, Download, Activity, X 
} from 'lucide-react';
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
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  
  // New Features State
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({
      quality: 'good' as 'good' | 'fair' | 'poor',
      packetLoss: 0,
      jitter: 0,
      fps: 0,
      resolution: ''
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const statsInterval = useRef<any>(null);

  // Identify the other person's ID
  const targetId = session.initiatorId === currentUserId 
      ? session.participants.find(id => id !== currentUserId) 
      : session.initiatorId;

  // Cleanup & Hangup Helper
  const terminateCall = () => {
      const socket = getSocket();
      if (socket && targetId) {
          socket.emit('end_call', { targetId });
      }
      stopRecording();
      onEnd();
  };

  // Check cameras
  useEffect(() => {
      navigator.mediaDevices.enumerateDevices().then(devices => {
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
      });
  }, []);

  // Monitor Call Quality (Enhanced)
  useEffect(() => {
      if(connectionStatus === 'connected' && peerConnection.current) {
          statsInterval.current = setInterval(async () => {
              const pc = peerConnection.current;
              if(!pc) return;
              const rtcStats = await pc.getStats();
              let packetLoss = 0;
              let totalPackets = 0;
              let jitter = 0;
              let fps = 0;
              let width = 0;
              let height = 0;
              
              rtcStats.forEach(report => {
                  if(report.type === 'inbound-rtp' && report.kind === 'video') {
                      packetLoss = report.packetsLost || 0;
                      totalPackets = (report.packetsReceived || 0) + (report.packetsLost || 0);
                      jitter = report.jitter || 0;
                      fps = report.framesPerSecond || 0;
                      width = report.frameWidth || 0;
                      height = report.frameHeight || 0;
                  }
              });

              const lossRate = totalPackets > 0 ? (packetLoss / totalPackets) * 100 : 0;
              let quality: 'good' | 'fair' | 'poor' = 'good';
              
              if(lossRate > 5 || jitter > 0.1) quality = 'poor';
              else if(lossRate > 1 || jitter > 0.05) quality = 'fair';

              setStats({
                  quality,
                  packetLoss: parseFloat(lossRate.toFixed(2)),
                  jitter: parseFloat((jitter * 1000).toFixed(2)), // ms
                  fps,
                  resolution: width ? `${width}x${height}` : 'N/A'
              });

          }, 2000);
      }
      return () => clearInterval(statsInterval.current);
  }, [connectionStatus]);

  // Timer
  useEffect(() => {
    let interval: any;
    if (connectionStatus === 'connected') {
      interval = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Initialize WebRTC
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !targetId) return;

    const initCall = async () => {
        try {
            // 1. Get User Media
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            // Apply initial toggles
            stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
            stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);

            // 2. Create PeerConnection
            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnection.current = pc;

            // Add Tracks to PC
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Handle Remote Stream
            pc.ontrack = (event) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    setConnectionStatus('connected');
                }
            };

            // Handle ICE
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', { targetId, signal: { candidate: event.candidate } });
                }
            };

            // 3. Signaling Logic
            socket.on('signal', async ({ senderId, signal }) => {
                if (senderId !== targetId) return;

                if (signal.offer) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', { targetId, signal: { answer } });
                } else if (signal.answer) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                    setConnectionStatus('connected');
                } else if (signal.candidate) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch(e) {}
                }
            });

            // 4. If Initiator, Create Offer
            if (session.initiatorId === currentUserId) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('signal', { targetId, signal: { offer } });
            }

        } catch (e) {
            console.error("Media Error", e);
            terminateCall();
        }
    };

    initCall();

    return () => {
        if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
        if (peerConnection.current) peerConnection.current.close();
        socket.off('signal');
    };
  }, []);

  // --- Features Logic ---

  // Screen Sharing
  const toggleScreenShare = async () => {
      if (!peerConnection.current) return;
      const senders = peerConnection.current.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');

      if (isScreenSharing) {
          // Stop Sharing: Revert to Camera
          try {
              const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
              const camTrack = camStream.getVideoTracks()[0];
              
              if (videoSender) videoSender.replaceTrack(camTrack);
              if (localVideoRef.current) localVideoRef.current.srcObject = camStream;
              
              // Update local stream ref to point to camera again
              // Note: We should also stop the screen track to clear the sharing indicator
              const screenTrack = localStream.current?.getVideoTracks()[0];
              screenTrack?.stop();
              
              localStream.current = new MediaStream([camTrack, ...localStream.current!.getAudioTracks()]);
              setIsScreenSharing(false);
          } catch (e) { console.error("Failed to revert to camera", e); }
      } else {
          // Start Sharing
          try {
              const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
              const screenTrack = displayStream.getVideoTracks()[0];

              if (videoSender) videoSender.replaceTrack(screenTrack);
              if (localVideoRef.current) localVideoRef.current.srcObject = displayStream;

              // Handle "Stop sharing" from browser UI
              screenTrack.onended = () => {
                  if (isScreenSharing) toggleScreenShare(); // Revert if stopped externally
              };

              localStream.current = new MediaStream([screenTrack, ...localStream.current!.getAudioTracks()]);
              setIsScreenSharing(true);
              setIsVideoEnabled(true); // Force video on
          } catch (e) { console.error("Screen share cancelled", e); }
      }
  };

  // Recording (Records REMOTE stream + Local Audio technically difficult in P2P without mixing, 
  // so we record what the user SEES/HEARS from the remote peer)
  const toggleRecording = () => {
      if (isRecording) {
          stopRecording();
      } else {
          startRecording();
      }
  };

  const startRecording = () => {
      const remoteStream = remoteVideoRef.current?.srcObject as MediaStream;
      if (!remoteStream) return;

      const options = { mimeType: 'video/webm; codecs=vp9' };
      const recorder = new MediaRecorder(remoteStream, options);

      recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
              setRecordedChunks((prev) => [...prev, event.data]);
          }
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
  };

  const stopRecording = () => {
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
          mediaRecorder.current.stop();
          setIsRecording(false);
      }
  };

  const downloadRecording = () => {
      if (recordedChunks.length === 0) return;
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      window.URL.revokeObjectURL(url);
      setRecordedChunks([]); // Clear after download
  };

  // Toggles
  useEffect(() => { localStream.current?.getAudioTracks().forEach(t => t.enabled = !isMuted); }, [isMuted]);
  useEffect(() => { if(!isScreenSharing) localStream.current?.getVideoTracks().forEach(t => t.enabled = isVideoEnabled); }, [isVideoEnabled]);

  const switchCamera = async () => {
      if(!localStream.current || isScreenSharing) return; // Disable if screen sharing
      const currentVideoTrack = localStream.current.getVideoTracks()[0];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if(videoInputs.length < 2) return;

      const currentDeviceId = currentVideoTrack.getSettings().deviceId;
      const currentIndex = videoInputs.findIndex(d => d.deviceId === currentDeviceId);
      const nextDevice = videoInputs[(currentIndex + 1) % videoInputs.length];

      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nextDevice.deviceId } } });
      const newVideoTrack = newStream.getVideoTracks()[0];

      localStream.current.removeTrack(currentVideoTrack);
      localStream.current.addTrack(newVideoTrack);
      currentVideoTrack.stop();
      if(localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      if(peerConnection.current) {
          const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video');
          if(sender) sender.replaceTrack(newVideoTrack);
      }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in p-4">
      <div className="relative w-full h-full md:w-[90vw] md:h-[90vh] bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start bg-white/90 dark:bg-black/90 border-b-2 border-black dark:border-white">
           <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => setShowStats(!showStats)}>
                  {peerAvatar ? (
                      <img src={peerAvatar} className="w-16 h-16 border-2 border-black dark:border-white object-cover grayscale hover:grayscale-0 transition-all" />
                  ) : (
                      <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 flex items-center justify-center border-2 border-black dark:border-white"><UserIcon size={32} className="text-black dark:text-white" /></div>
                  )}
                  {connectionStatus === 'connected' && (
                      <div className={`absolute -bottom-2 -right-2 border-2 border-black dark:border-white p-1 ${stats.quality === 'good' ? 'bg-green-400' : stats.quality === 'fair' ? 'bg-yellow-400' : 'bg-red-400'}`}>
                           {stats.quality === 'good' ? <SignalHigh size={16} className="text-black"/> : stats.quality === 'fair' ? <Signal size={16} className="text-black"/> : <SignalLow size={16} className="text-black"/>}
                      </div>
                  )}
                  
                  {/* Stats Tooltip */}
                  {showStats && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-black border-4 border-black dark:border-white p-4 shadow-manga dark:shadow-manga-dark z-50 text-xs font-mono">
                          <h4 className="font-black uppercase border-b-2 border-black dark:border-white mb-2">Connection Stats</h4>
                          <div className="grid grid-cols-2 gap-2">
                              <div>Loss: <span className={stats.packetLoss > 5 ? 'text-red-500 font-bold' : ''}>{stats.packetLoss}%</span></div>
                              <div>Jitter: {stats.jitter}ms</div>
                              <div>Res: {stats.resolution}</div>
                              <div>FPS: {stats.fps}</div>
                          </div>
                          {stats.quality !== 'good' && (
                              <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900 border border-black dark:border-white italic">
                                  Tip: {stats.packetLoss > 5 ? 'Move closer to router.' : 'Network congestion detected.'}
                              </div>
                          )}
                      </div>
                  )}
              </div>
              
              <div>
                  <h2 className="text-3xl font-comic uppercase tracking-wider text-black dark:text-white">{peerName}</h2>
                  <div className="flex items-center gap-2">
                     <span className="font-mono text-lg font-bold bg-black text-white dark:bg-white dark:text-black px-2">
                        {connectionStatus === 'connected' ? formatTime(duration) : 'CONNECTING...'}
                     </span>
                     {isRecording && (
                         <div className="flex items-center gap-1 animate-pulse text-red-600 font-black uppercase border-2 border-red-600 px-1">
                             <Disc size={12} fill="currentColor"/> REC
                         </div>
                     )}
                  </div>
              </div>
           </div>

           {/* Download Recording Button if exists */}
           {recordedChunks.length > 0 && !isRecording && (
               <button onClick={downloadRecording} className="bg-accent text-white p-2 border-2 border-black hover:scale-110 transition-transform flex gap-2 items-center font-bold">
                   <Download size={20}/> SAVE REC
               </button>
           )}
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden halftone-light dark:halftone-dark">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover md:object-contain grayscale hover:grayscale-0 transition-all duration-500" />
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[repeating-linear-gradient(90deg,transparent,transparent_49px,currentColor_50px)] text-black dark:text-white"></div>

            {/* Local Video (PIP) */}
            <div className="absolute bottom-24 right-6 w-32 h-44 md:w-56 md:h-80 bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden group">
                 <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover mirror grayscale group-hover:grayscale-0 transition-all ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}/>
                 {!isVideoEnabled && <div className="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-800"><VideoOff size={32} className="text-black dark:text-white opacity-50"/></div>}
                 <div className="absolute top-0 left-0 bg-black text-white dark:bg-white dark:text-black px-2 font-bold text-xs">YOU</div>
                 {hasMultipleCameras && isVideoEnabled && !isScreenSharing && (
                    <button onClick={switchCamera} className="absolute bottom-2 right-2 p-2 bg-white dark:bg-black border-2 border-black dark:border-white hover:bg-gray-200"><SwitchCamera size={16} /></button>
                 )}
            </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 w-full p-6 bg-white dark:bg-black border-t-4 border-black dark:border-white flex justify-center gap-4 md:gap-8 z-20">
            <button onClick={() => setIsMuted(!isMuted)} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${!isMuted ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}>{isMuted ? <MicOff /> : <Mic />}</button>
            
            <button onClick={toggleScreenShare} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isScreenSharing ? 'bg-accent text-white' : 'bg-white dark:bg-black text-black dark:text-white'}`}>
                <Monitor />
            </button>

            <button onClick={terminateCall} className="w-16 h-16 md:w-20 md:h-20 border-4 border-black dark:border-white bg-accent text-white flex items-center justify-center shadow-manga dark:shadow-manga-dark hover:scale-105 transition-transform active:translate-y-1"><PhoneOff size={32} strokeWidth={3} /></button>

            <button onClick={toggleRecording} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-white dark:bg-black text-black dark:text-white'}`}>
                {isRecording ? <Disc fill="currentColor"/> : <Disc />}
            </button>

            <button onClick={() => setIsVideoEnabled(!isVideoEnabled)} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isVideoEnabled ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}>{!isVideoEnabled ? <VideoOff /> : <Video />}</button>
        </div>
      </div>
    </div>
  );
};
