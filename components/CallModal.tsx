
import React, { useEffect, useRef, useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, User as UserIcon, 
  SwitchCamera, Signal, SignalHigh, SignalLow, Monitor, 
  Disc, Download, Activity, X, Phone 
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
  const [callStatus, setCallStatus] = useState<'ringing' | 'connected' | 'ended'>(session.status);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.isVideo);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const iceCandidateBuffer = useRef<RTCIceCandidate[]>([]);

  const isInitiator = session.initiatorId === currentUserId;
  const targetId = isInitiator 
      ? session.participants.find(id => id !== currentUserId) 
      : session.initiatorId;

  // Sound Logic
  const playRingtone = () => {
      if (audioContextRef.current) return;
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      const now = ctx.currentTime;
      for (let i = 0; i < 30; i++) {
          const t = now + i * 2;
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.linearRampToValueAtTime(0, t + 1);
      }
      osc.start();
      oscillatorRef.current = osc;
  };

  const stopRingtone = () => {
      if (oscillatorRef.current) { try { oscillatorRef.current.stop(); } catch(e) {} oscillatorRef.current = null; }
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
  };

  useEffect(() => {
      if (callStatus === 'ringing' && !isInitiator) playRingtone();
      else stopRingtone();
      return () => stopRingtone();
  }, [callStatus, isInitiator]);

  const stopRecording = () => {
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
          try { mediaRecorder.current.stop(); } catch(e) {}
      }
      setIsRecording(false);
  };

  const terminateCall = () => {
      const socket = getSocket();
      if (socket && targetId) socket.emit('end_call', { targetId });
      stopRecording();
      onEnd();
  };

  const handleAccept = () => {
      setCallStatus('connected');
  };

  const handleReject = () => {
      terminateCall();
  };

  useEffect(() => {
      navigator.mediaDevices.enumerateDevices().then(devices => {
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
      });
  }, []);

  // WebRTC Core Logic
  useEffect(() => {
    if (callStatus !== 'connected' && !isInitiator) return;

    const socket = getSocket();
    if (!socket || !targetId) return;

    const initCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
            stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnection.current = pc;

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    // Force status to connected if track received
                    setCallStatus('connected'); 
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', { targetId, signal: { candidate: event.candidate } });
                }
            };

            // Handle buffered candidates when remote description is set
            const processBufferedCandidates = async () => {
                while (iceCandidateBuffer.current.length > 0) {
                    const candidate = iceCandidateBuffer.current.shift();
                    if (candidate) await pc.addIceCandidate(candidate);
                }
            };

            socket.on('signal', async ({ senderId, signal }) => {
                if (senderId !== targetId) return;

                if (signal.offer) {
                    // Only the CALLEE receives an offer in this flow
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
                    await processBufferedCandidates();
                    
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', { targetId, signal: { answer } });
                    
                    // If we just accepted and processed offer, we are connected
                    setCallStatus('connected');
                } 
                else if (signal.answer) {
                    // Only the CALLER receives an answer
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                    await processBufferedCandidates();
                    setCallStatus('connected'); // Now both sides are connected
                } 
                else if (signal.candidate) {
                    const candidate = new RTCIceCandidate(signal.candidate);
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(candidate);
                    } else {
                        iceCandidateBuffer.current.push(candidate);
                    }
                }
            });

            if (isInitiator) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('signal', { targetId, signal: { offer } });
            } else if (session.offerSignal) {
                // We accepted an incoming call that already had an offer attached
                await pc.setRemoteDescription(new RTCSessionDescription(session.offerSignal));
                await processBufferedCandidates();
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('signal', { targetId, signal: { answer } });
            }

        } catch (e) {
            console.error("Media/WebRTC Error", e);
            terminateCall();
        }
    };

    initCall();

    return () => {
        if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
        if (peerConnection.current) peerConnection.current.close();
        socket.off('signal');
    };
  }, [callStatus, isInitiator]); 

  // Stats
  useEffect(() => {
      if(callStatus === 'connected' && peerConnection.current) {
          statsInterval.current = setInterval(async () => {
              const pc = peerConnection.current;
              if(!pc) return;
              const rtcStats = await pc.getStats();
              let packetLoss = 0, totalPackets = 0, jitter = 0, fps = 0, width = 0, height = 0;
              
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

              setStats({ quality, packetLoss: parseFloat(lossRate.toFixed(2)), jitter: parseFloat((jitter * 1000).toFixed(2)), fps, resolution: width ? `${width}x${height}` : 'N/A' });
          }, 2000);
      }
      return () => clearInterval(statsInterval.current);
  }, [callStatus]);

  useEffect(() => {
    let interval: any;
    if (callStatus === 'connected') interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const toggleRecording = () => { if (isRecording) { stopRecording(); } else startRecording(); };
  const startRecording = () => {
      const stream = remoteVideoRef.current?.srcObject as MediaStream;
      if (!stream) return;
      try {
          const rec = new MediaRecorder(stream);
          rec.ondataavailable = e => { if (e.data.size > 0) setRecordedChunks(p => [...p, e.data]); };
          rec.start();
          mediaRecorder.current = rec;
          setIsRecording(true);
      } catch(e) {}
  };
  const downloadRecording = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a); a.style.display = 'none'; a.href = url; a.download = `rec-${Date.now()}.webm`; a.click();
      window.URL.revokeObjectURL(url); setRecordedChunks([]); 
  };

  // Screen Sharing
  const toggleScreenShare = async () => {
      if (!peerConnection.current) return;
      const senders = peerConnection.current.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (isScreenSharing) {
          try {
              const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
              const camTrack = camStream.getVideoTracks()[0];
              if (videoSender) videoSender.replaceTrack(camTrack);
              if (localVideoRef.current) localVideoRef.current.srcObject = camStream;
              localStream.current = new MediaStream([camTrack, ...localStream.current!.getAudioTracks()]);
              setIsScreenSharing(false);
          } catch (e) {}
      } else {
          try {
              const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
              const screenTrack = displayStream.getVideoTracks()[0];
              if (videoSender) videoSender.replaceTrack(screenTrack);
              if (localVideoRef.current) localVideoRef.current.srcObject = displayStream;
              screenTrack.onended = () => { if (isScreenSharing) toggleScreenShare(); };
              localStream.current = new MediaStream([screenTrack, ...localStream.current!.getAudioTracks()]);
              setIsScreenSharing(true); setIsVideoEnabled(true); 
          } catch (e) {}
      }
  };

  // Toggles & Switch Cam
  useEffect(() => { localStream.current?.getAudioTracks().forEach(t => t.enabled = !isMuted); }, [isMuted]);
  useEffect(() => { if(!isScreenSharing) localStream.current?.getVideoTracks().forEach(t => t.enabled = isVideoEnabled); }, [isVideoEnabled]);
  const switchCamera = async () => {
      if(!localStream.current || isScreenSharing) return;
      const currentVideoTrack = localStream.current.getVideoTracks()[0];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if(videoInputs.length < 2) return;
      const currentDeviceId = currentVideoTrack.getSettings().deviceId;
      const nextDevice = videoInputs[(videoInputs.findIndex(d => d.deviceId === currentDeviceId) + 1) % videoInputs.length];
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nextDevice.deviceId } } });
      const newVideoTrack = newStream.getVideoTracks()[0];
      localStream.current.removeTrack(currentVideoTrack);
      localStream.current.addTrack(newVideoTrack);
      currentVideoTrack.stop();
      if(localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      if(peerConnection.current) { const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video'); if(sender) sender.replaceTrack(newVideoTrack); }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (callStatus === 'ringing' && !isInitiator) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-black border-4 border-black dark:border-white p-8 flex flex-col items-center shadow-manga animate-bounce-slow max-w-md w-full">
                  {peerAvatar ? (
                      <img src={peerAvatar} className="w-32 h-32 rounded-full border-4 border-black dark:border-white mb-6 animate-pulse object-cover"/>
                  ) : (
                      <div className="w-32 h-32 rounded-full border-4 border-black dark:border-white mb-6 flex items-center justify-center bg-gray-200 dark:bg-gray-800 animate-pulse"><UserIcon size={64} className="text-black dark:text-white"/></div>
                  )}
                  <h2 className="text-4xl font-comic uppercase mb-2 text-center text-black dark:text-white">{peerName}</h2>
                  <p className="font-mono mb-8 animate-pulse text-black dark:text-white uppercase">Incoming Call...</p>
                  <div className="flex gap-12">
                      <button onClick={handleReject} className="w-20 h-20 bg-red-500 border-4 border-black dark:border-white rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform active:scale-95 shadow-manga-sm"><PhoneOff size={32}/></button>
                      <button onClick={handleAccept} className="w-20 h-20 bg-green-500 border-4 border-black dark:border-white rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform active:scale-95 shadow-manga-sm animate-pulse"><Phone size={32}/></button>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in p-4">
      <div className="relative w-full h-full md:w-[90vw] md:h-[90vh] bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden flex flex-col">
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start bg-white/90 dark:bg-black/90 border-b-2 border-black dark:border-white">
           <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => setShowStats(!showStats)}>
                  <img src={peerAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${peerName}`} className="w-16 h-16 border-2 border-black dark:border-white object-cover grayscale hover:grayscale-0 transition-all" />
                  {callStatus === 'connected' && (<div className={`absolute -bottom-2 -right-2 border-2 border-black dark:border-white p-1 ${stats.quality === 'good' ? 'bg-green-400' : stats.quality === 'fair' ? 'bg-yellow-400' : 'bg-red-400'}`}>{stats.quality === 'good' ? <SignalHigh size={16} className="text-black"/> : stats.quality === 'fair' ? <Signal size={16} className="text-black"/> : <SignalLow size={16} className="text-black"/>}</div>)}
                  {showStats && (<div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-black border-4 border-black dark:border-white p-4 shadow-manga dark:shadow-manga-dark z-50 text-xs font-mono"><h4 className="font-black uppercase border-b-2 border-black dark:border-white mb-2 text-black dark:text-white">Stats</h4><div className="grid grid-cols-2 gap-2 text-black dark:text-white"><div>Loss: {stats.packetLoss}%</div><div>Jitter: {stats.jitter}ms</div><div>Res: {stats.resolution}</div><div>FPS: {stats.fps}</div></div></div>)}
              </div>
              <div><h2 className="text-3xl font-comic uppercase tracking-wider text-black dark:text-white">{peerName}</h2><div className="flex items-center gap-2"><span className="font-mono text-lg font-bold bg-black text-white dark:bg-white dark:text-black px-2">{callStatus === 'connected' ? formatTime(duration) : 'DIALING...'}</span>{isRecording && (<div className="flex items-center gap-1 animate-pulse text-red-600 font-black uppercase border-2 border-red-600 px-1 bg-white"><Disc size={12} fill="currentColor"/> REC</div>)}</div></div>
           </div>
           {recordedChunks.length > 0 && !isRecording && (<button onClick={downloadRecording} className="bg-accent text-white p-2 border-2 border-black hover:scale-110 transition-transform flex gap-2 items-center font-bold"><Download size={20}/> SAVE</button>)}
        </div>
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden halftone-light dark:halftone-dark">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover md:object-contain grayscale hover:grayscale-0 transition-all duration-500" />
            <div className="absolute bottom-24 right-6 w-32 h-44 md:w-56 md:h-80 bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark overflow-hidden group">
                 <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover mirror grayscale group-hover:grayscale-0 transition-all ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}/>
                 {!isVideoEnabled && <div className="absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-800"><VideoOff size={32} className="text-black dark:text-white opacity-50"/></div>}
                 <div className="absolute top-0 left-0 bg-black text-white dark:bg-white dark:text-black px-2 font-bold text-xs">YOU</div>
                 {hasMultipleCameras && isVideoEnabled && !isScreenSharing && (<button onClick={switchCamera} className="absolute bottom-2 right-2 p-2 bg-white dark:bg-black border-2 border-black dark:border-white hover:bg-gray-200"><SwitchCamera size={16} className="text-black dark:text-white"/></button>)}
            </div>
        </div>
        <div className="absolute bottom-0 w-full p-6 bg-white dark:bg-black border-t-4 border-black dark:border-white flex justify-center gap-4 md:gap-8 z-20">
            <button onClick={() => setIsMuted(!isMuted)} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${!isMuted ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}>{isMuted ? <MicOff /> : <Mic />}</button>
            <button onClick={toggleScreenShare} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isScreenSharing ? 'bg-accent text-white' : 'bg-white dark:bg-black text-black dark:text-white'}`}><Monitor /></button>
            <button onClick={terminateCall} className="w-16 h-16 md:w-20 md:h-20 border-4 border-black dark:border-white bg-accent text-white flex items-center justify-center shadow-manga dark:shadow-manga-dark hover:scale-105 transition-transform active:translate-y-1"><PhoneOff size={32} strokeWidth={3} /></button>
            <button onClick={toggleRecording} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-white dark:bg-black text-black dark:text-white'}`}>{isRecording ? <Disc fill="currentColor"/> : <Disc />}</button>
            <button onClick={() => setIsVideoEnabled(!isVideoEnabled)} className={`w-14 h-14 md:w-16 md:h-16 border-4 border-black dark:border-white flex items-center justify-center transition-transform active:translate-y-1 shadow-manga-sm dark:shadow-manga-sm-dark ${isVideoEnabled ? 'bg-white dark:bg-black text-black dark:text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}>{!isVideoEnabled ? <VideoOff /> : <Video />}</button>
        </div>
      </div>
    </div>
  );
};
