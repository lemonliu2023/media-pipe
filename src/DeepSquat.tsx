import { NormalizedLandmark, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';

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

function DeepSquat({ width, height, poseLandmarkerRef }: { width: number; height: number; poseLandmarkerRef: React.RefObject<PoseLandmarker | null> }) {
  const [enableCamera, setEnableCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [squatCount, setSquatCount] = useState(0);
  const squatStateRef = useRef<'standing' | 'squatting'>('standing');
  const rewardSoundRef = useRef<HTMLAudioElement>(new Audio(`${location.href}/mario-coin.wav`));
  useEffect(() => {
    if (canvasRef.current) {
      canvasCtxRef.current = canvasRef.current.getContext('2d');
      if (!canvasCtxRef.current) {
        console.error('Failed to get canvas context');
      }
    }
  }, []);
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const videoRatio = videoRef.current.videoWidth / videoRef.current.videoHeight;
    const displayRatio = width / height;

    let renderWidth, renderHeight;
    if (videoRatio > displayRatio) {
      renderWidth = width;
      renderHeight = width / videoRatio;
    } else {
      renderHeight = height;
      renderWidth = height * videoRatio;
    }

    canvasRef.current.style.width = `${renderWidth}px`;
    canvasRef.current.style.height = `${renderHeight}px`;
  }, [width, height]);
  function enableCamHandler() {
    getCameraStream()
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadedmetadata', function () {
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current?.videoWidth || 0;
              canvasRef.current.height = videoRef.current?.videoHeight || 0;
            }
          });
        }
        setEnableCamera(true);
        startPoseDetection();
        const audio = rewardSoundRef.current;
        audio.play().then(() => {
            audio.pause(); // 立即暂停，解锁播放权限
            audio.currentTime = 0; // 回到开头
            // 后续你可以通过状态变化来控制播放
          });
      })
      .catch((err) => {
        console.error(err);
      });
  }
  // 开始姿势检测
  async function startPoseDetection() {
    async function processFrame() {
      if (!videoRef.current) return;
      if (videoRef.current.readyState >= 2) {
        const results = await poseLandmarkerRef.current?.detectForVideo(videoRef.current, performance.now());
        onResults(results!);
      }
      requestAnimationFrame(processFrame);
    }
    processFrame();
  }
  // 处理姿势检测结果
  function onResults(results: PoseLandmarkerResult) {
    const canvasCtx = canvasCtxRef.current;
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasCtx || !videoElement || !canvasElement) return;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // 绘制镜像翻转的视频帧
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // 绘制姿势关键点并检测深蹲
    if (results.landmarks && results.landmarks.length > 0) {
      drawLandmarks(results.landmarks[0]);
      detectSquat(results.landmarks[0]);
    }
  }

  // 绘制姿势关键点和连接线，包含 visibility 判断和镜像处理
  function drawLandmarks(landmarks: NormalizedLandmark[]) {
    const canvasCtx = canvasCtxRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasCtx || !canvasElement) return;
    canvasCtx.fillStyle = 'red';
    canvasCtx.strokeStyle = 'green';
    canvasCtx.lineWidth = 2;

    // 绘制连接线
    const connections = PoseLandmarker.POSE_CONNECTIONS;
    for (const connection of connections) {
      const start = landmarks[connection.start];
      const end = landmarks[connection.end];
      if (isLandmarkVisible(start) && isLandmarkVisible(end)) {
        canvasCtx.beginPath();
        canvasCtx.moveTo((1 - start.x) * canvasElement.width, start.y * canvasElement.height);
        canvasCtx.lineTo((1 - end.x) * canvasElement.width, end.y * canvasElement.height);
        canvasCtx.stroke();
      }
    }

    // 绘制关键点
    for (const landmark of landmarks) {
      if (isLandmarkVisible(landmark)) {
        canvasCtx.beginPath();
        canvasCtx.arc((1 - landmark.x) * canvasElement.width, landmark.y * canvasElement.height, 5, 0, 2 * Math.PI);
        canvasCtx.fill();
      }
    }
  }

  // 判断关键点是否可见（在屏幕内且 visibility 足够高）
  function isLandmarkVisible(landmark: NormalizedLandmark) {
    if (landmark.visibility < 0.5) return false;
    return landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1;
  }

  // 检测深蹲动作
  function detectSquat(landmarks: NormalizedLandmark[]) {
    // 关键点索引（MediaPipe Pose）
    const leftHip = landmarks[23]; // 左髋
    const leftKnee = landmarks[25]; // 左膝
    const leftAnkle = landmarks[27]; // 左踝
    const rightHip = landmarks[24]; // 右髋
    const rightKnee = landmarks[26]; // 右膝
    const rightAnkle = landmarks[28]; // 右踝

    // 确保关键点可见
    if (
      !isLandmarkVisible(leftHip) ||
      !isLandmarkVisible(leftKnee) ||
      !isLandmarkVisible(leftAnkle) ||
      !isLandmarkVisible(rightHip) ||
      !isLandmarkVisible(rightKnee) ||
      !isLandmarkVisible(rightAnkle)
    ) {
      return;
    }

    // 计算膝盖角度（使用左右平均）
    function calculateAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) {
      const vectorBA = { x: a.x - b.x, y: a.y - b.y };
      const vectorBC = { x: c.x - b.x, y: c.y - b.y };
      const dotProduct = vectorBA.x * vectorBC.x + vectorBA.y * vectorBC.y;
      const magnitudeBA = Math.sqrt(vectorBA.x ** 2 + vectorBA.y ** 2);
      const magnitudeBC = Math.sqrt(vectorBC.x ** 2 + vectorBC.y ** 2);
      const cosTheta = dotProduct / (magnitudeBA * magnitudeBC);
      return Math.acos(Math.min(Math.max(cosTheta, -1), 1)) * (180 / Math.PI);
    }

    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 髋部高度（使用左右平均）
    const averageHipY = (leftHip.y + rightHip.y) / 2;
    const averageKneeY = (leftKnee.y + rightKnee.y) / 2;

    // 深蹲判断
    const isSquatting = averageKneeAngle < 100 && averageHipY > averageKneeY * 0.9;

    const squatState = squatStateRef.current;
    const rewardSound = rewardSoundRef.current;

    // 状态机
    if (squatState === 'standing' && isSquatting) {
      squatStateRef.current = 'squatting';
    } else if (squatState === 'squatting' && !isSquatting) {
      squatStateRef.current = 'standing';
      setSquatCount((pre) => pre + 1);
      rewardSound.play().catch((err) => console.error('音效播放失败:', err));
    }
  }

  return (
    <>
      <div className="relative bg-[#000]" style={{ width, height, display: enableCamera ? 'block' : 'none' }}>
        <div id="render-wrapper" className="flex justify-center items-center">
          <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }}></video>
          <canvas ref={canvasRef} width={width} height={height}></canvas>
        </div>
        <div
          id="counter"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
          className="fixed top-[20px] left-[20px] text-[#fff] text-2xl p-[10px] rounded-[10px]"
          onClick={() => {
            rewardSoundRef.current.play().catch((err) => console.error('音效播放失败:', err));
          }}
        >
          深蹲次数: {squatCount}
        </div>
      </div>
      <div style={{ display: enableCamera ? 'none' : 'block' }}>
        <button onClick={() => enableCamHandler()}>打开摄像头</button>
      </div>
    </>
  );
}

export default DeepSquat;
