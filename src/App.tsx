import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

let lastVideoTime = -1;

function App() {
  const [enableCamera, setEnableCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker>(null);
  const drawingUtilsRef = useRef<DrawingUtils>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D>(null);

  useEffect(() => {
    console.log(hasGetUserMedia());
    if (canvasRef.current) {
      canvasCtxRef.current = canvasRef.current.getContext('2d')!;
      drawingUtilsRef.current = new DrawingUtils(canvasCtxRef.current);
    }
    const createPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm');
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
      });
    };
    createPoseLandmarker();
  }, []);

  async function predictWebcam() {
    console.log(videoRef.current?.clientWidth, 'videoRef.current?.height');
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

  function enableCam() {
    if (!poseLandmarkerRef.current) {
      alert('Wait! poseLandmaker not loaded yet.');
      return;
    }

    // if (webcamRunning === true) {
    //   webcamRunning = false;
    //   enableWebcamButton.innerText = "ENABLE PREDICTIONS";
    // } else {
    //   webcamRunning = true;
    //   enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    // }

    // Activate the webcam stream.
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1920 }, // 建议宽度
          height: { ideal: 1080 }, // 建议高度
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
    <div className="container flex items-center justify-center h-screen relative">
      {!enableCamera && <button onClick={() => enableCam()}>enable camera</button>}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        width={1280}
        height={720}
        style={{ display: enableCamera ? 'block' : 'none', maxWidth: 'unset', left: 0, top: 0 }}
        className="absolute"
      ></video>
      <canvas
        id="canvas"
        width={1280}
        height={720}
        ref={canvasRef}
        style={{ display: enableCamera ? 'block' : 'none', left: 0, right: 0 }}
        className="absolute"
      ></canvas>
    </div>
  );
}

export default App;
