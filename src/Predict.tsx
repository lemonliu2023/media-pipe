import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';

let lastVideoTime = -1;

function Predict({ width, height, poseLandmarkerRef }: { width: number; height: number; poseLandmarkerRef: React.RefObject<PoseLandmarker | null> }) {
  const [enableCamera, setEnableCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingUtilsRef = useRef<DrawingUtils>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D>(null);

  useEffect(() => {
    if (canvasRef.current) {
      console.log(canvasRef.current);
      canvasCtxRef.current = canvasRef.current.getContext('2d')!;
      drawingUtilsRef.current = new DrawingUtils(canvasCtxRef.current);
    }
  }, []);

  async function predictWebcam() {
    if (!canvasRef.current) return;
    // canvasRef.current.style.height = `${videoRef.current?.clientHeight}`;
    // canvasRef.current.style.width = `${videoRef.current?.clientWidth}`;
    // Now let's start detecting the stream.
    const startTimeMs = performance.now();
    if (lastVideoTime !== videoRef.current?.currentTime) {
      lastVideoTime = videoRef.current?.currentTime || -1;
      poseLandmarkerRef.current?.detectForVideo(videoRef.current!, startTimeMs, (result) => {
        canvasCtxRef.current?.save();
        canvasCtxRef.current?.clearRect(0, 0, videoRef.current?.clientWidth || 0, videoRef.current?.clientHeight || 0);
        for (const landmark of result.landmarks) {
          drawingUtilsRef.current?.drawLandmarks(landmark, {
            radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
          });
          drawingUtilsRef.current?.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
        }
        canvasCtxRef.current?.restore();
      });
    }

    // Call this function again to keep predicting when the browser is ready.
    // if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
    // }
  }

  function enableCamHandler() {
    if (!poseLandmarkerRef.current) {
      alert('Wait! poseLandmaker not loaded yet.');
      return;
    }

    // Activate the webcam stream.
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 }, // 建议宽度
          height: { ideal: 720 }, // 建议高度
          facingMode: 'user', // 前置摄像头
        },
      })
      .then((stream) => {
        if (videoRef.current) {
          setEnableCamera(true);
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', predictWebcam);
        }
      });
  }
  return (
    <div className="relative flex justify-center items-center" style={{ width: 1280, height: 720 }}>
      {!enableCamera && <button onClick={() => enableCamHandler()}>enable camera</button>}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        width={width}
        height={height}
        style={{ display: enableCamera ? 'block' : 'none', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        className="absolute"
      ></video>
      <canvas
        id="canvas"
        width={width}
        height={height}
        ref={canvasRef}
        style={{ display: enableCamera ? 'block' : 'none', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' /* 居中 */ }}
        className="absolute"
      ></canvas>
    </div>
  );
}

export default Predict;
