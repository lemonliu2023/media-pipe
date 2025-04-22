import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useRef, useState } from 'react';

let lastVideoTime = -1;

function Predict({ poseLandmarkerRef }: { poseLandmarkerRef: React.RefObject<PoseLandmarker | null> }) {
  const [enableCamera, setEnableCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingUtilsRef = useRef<DrawingUtils>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D>(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });
  function predictWebcam() {
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

    window.requestAnimationFrame(predictWebcam);
  }

  function getCameraStream(): Promise<MediaStream> {
    return new Promise((res, rej) => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: 'user', // 前置摄像头，'environment' 为后置
              width: { ideal: 1280 }, // 理想分辨率
              height: { ideal: 720 },
            },
            audio: false,
          })
          .then((stream) => res(stream));
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
      } else if (navigator.getUserMedia) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        navigator.getUserMedia(
          { video: true, audio: false },
          (stream: MediaStream) => res(stream),
          (err: Error) => rej(err.message)
        );
      } else {
        rej('Your browser does not support getUserMedia API');
      }
    });
  }

  async function enableCamHandler() {
    // Activate the webcam stream.
    try {
      const stream = await getCameraStream();
      if (videoRef.current) {
        setEnableCamera(true);
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', () => {
          const { videoWidth, videoHeight } = videoRef.current!;
          setSize({
            width: videoWidth,
            height: videoHeight,
          });
          setTimeout(() => {
            canvasCtxRef.current = canvasRef.current!.getContext('2d');
            drawingUtilsRef.current = new DrawingUtils(canvasCtxRef.current!);
            predictWebcam();
          });
        });
      }
    } catch (error) {
      alert(error);
    }
  }
  return (
    <div className="relative flex justify-center items-center" style={{ width: size.width, height: size.height }}>
      {!enableCamera && <button onClick={() => enableCamHandler()}>enable camera</button>}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        width={size.width}
        height={size.height}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) scaleX(-1)', // 添加scaleX(-1)实现镜像
        }}
        className="absolute"
      ></video>
      <canvas
        id="canvas"
        width={size.width}
        height={size.height}
        ref={canvasRef}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) scaleX(-1)', // 同时镜像canvas
        }}
        className="absolute"
      ></canvas>
    </div>
  );
}

export default Predict;
