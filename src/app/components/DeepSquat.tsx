'use client';
import { Button } from '@/components/ui/button';
import { Landmark, NormalizedLandmark, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { throttle } from 'lodash-es';
import { Toaster } from '@/components/ui/sonner';

interface HistoryItemType {
  kneeAngle: number;
  hipY: number;
  kneeY: number;
  backTilt: number;
  timestamp: number;
}

const history: HistoryItemType[] = [];
const WINDOW_SIZE = 30; // 窗口大小

// 节流函数，避免重复点击
const throttleToast = throttle(toast, 1000);

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
  const squatStateRef = useRef<'standing' | 'squatting' | 'returning'>('standing');
  const rewardSoundRef = useRef<HTMLAudioElement | undefined>(typeof Audio !== 'undefined' ? new Audio(`${location.href}/silent_1s.mp3`) : undefined);
  useEffect(() => {
    if (canvasRef.current) {
      canvasCtxRef.current = canvasRef.current.getContext('2d');
      if (!canvasCtxRef.current) {
        console.error('Failed to get canvas context');
      }
    }
  }, []);
  const resizeCanvas = useCallback(
    function () {
      if (!videoRef.current || !canvasRef.current) return;
      const videoRatio = videoRef.current.videoWidth / videoRef.current.videoHeight;
      const displayRatio = width / height;
      if (!videoRatio || !displayRatio) return;

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
    },
    [width, height]
  );
  useEffect(resizeCanvas, [resizeCanvas]);
  function enableCamHandler() {
    getCameraStream()
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadedmetadata', function () {
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current?.videoWidth || 0;
              canvasRef.current.height = videoRef.current?.videoHeight || 0;
              resizeCanvas();
            }
          });
        }
        setEnableCamera(true);
        startPoseDetection();
        const audio = rewardSoundRef.current;
        audio?.play().then(() => {
          audio.pause(); // 立即暂停，解锁播放权限
          audio.currentTime = 0; // 回到开头
          rewardSoundRef.current = new Audio(`${location.href}/mario-coin.wav`);
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

  function detectSquat(landmarks: NormalizedLandmark[]) {
    // 关键点索引（MediaPipe Pose）
    const leftShoulder = landmarks[11]; // 左肩
    const rightShoulder = landmarks[12]; // 右肩
    const leftHip = landmarks[23]; // 左髋
    const leftKnee = landmarks[25]; // 左膝
    const leftAnkle = landmarks[27]; // 左踝
    const rightHip = landmarks[24]; // 右髋
    const rightKnee = landmarks[26]; // 右膝
    const rightAnkle = landmarks[28]; // 右踝

    // 确保关键点可见
    if (
      !isLandmarkVisible(leftShoulder) ||
      !isLandmarkVisible(rightShoulder) ||
      !isLandmarkVisible(leftHip) ||
      !isLandmarkVisible(leftKnee) ||
      !isLandmarkVisible(leftAnkle) ||
      !isLandmarkVisible(rightHip) ||
      !isLandmarkVisible(rightKnee) ||
      !isLandmarkVisible(rightAnkle)
    ) {
      throttleToast('请确保身体在摄像头前可见');
      return;
    }

    // 计算膝盖角度
    function calculateAngle(a: Landmark, b: Landmark, c: Landmark) {
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

    // 髋部和膝盖高度
    const averageHipY = (leftHip.y + rightHip.y) / 2;
    const averageKneeY = (leftKnee.y + rightKnee.y) / 2;

    // 计算背部角度（肩部-髋部相对于垂直线的角度）
    const averageShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const averageShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const averageHipX = (leftHip.x + rightHip.x) / 2;
    const backAngle = Math.atan2(averageHipY - averageShoulderY, averageHipX - averageShoulderX) * (180 / Math.PI);
    const backTilt = Math.abs(backAngle - 90); // 相对于垂直线的偏离角度

    // 存储当前帧数据
    history.push({
      kneeAngle: averageKneeAngle,
      hipY: averageHipY,
      kneeY: averageKneeY,
      backTilt: backTilt,
      timestamp: performance.now()
    });

    // 保持窗口大小
    if (history.length > WINDOW_SIZE) {
      history.shift();
    }

    // 分析时间窗口内的数据
    if (history.length < WINDOW_SIZE) {
      // feedbackElement.style.display = 'none';
      throttleToast('数据填充中，请稍等...');
      return; // 等待窗口填满
    }

    // 计算窗口内的统计数据
    const kneeAngles = history.map(h => h.kneeAngle);
    const hipYs = history.map(h => h.hipY);
    const kneeYs = history.map(h => h.kneeY);
    const backTilts = history.map(h => h.backTilt);

    const avgKneeAngle = kneeAngles.reduce((sum, val) => sum + val, 0) / kneeAngles.length;
    const avgHipY = hipYs.reduce((sum, val) => sum + val, 0) / hipYs.length;
    const avgKneeY = kneeYs.reduce((sum, val) => sum + val, 0) / kneeYs.length;
    const avgBackTilt = backTilts.reduce((sum, val) => sum + val, 0) / backTilts.length;

    // 深蹲状态判断
    const isSquatting = avgKneeAngle < 100 && avgHipY > avgKneeY * 0.9;
    const isStanding = avgKneeAngle > 150 && avgHipY < avgKneeY * 0.7;

    // 姿势反馈
    let feedbackMessage = '';
    if (avgKneeAngle < 100) {
      // 在下蹲尝试中
      if (avgHipY < avgKneeY * 0.9) {
        feedbackMessage = '请蹲得更低';
      } else if (avgBackTilt > 20) {
        feedbackMessage = '请保持背部直立';
      }
    }

    // 更新反馈显示
    if (feedbackMessage) {
      // feedbackElement.textContent = feedbackMessage;
      // feedbackElement.style.display = 'block';
      throttleToast(feedbackMessage);
    } else {
      // feedbackElement.style.display = 'none';
    }

    const rewardSound = rewardSoundRef.current;
    const squatState = squatStateRef.current;

    // 状态机
    if (squatState === 'standing' && isSquatting) {
      squatStateRef.current = 'squatting';
    } else if (squatState === 'squatting' && isStanding) {
      squatStateRef.current = 'returning';
    } else if (squatState === 'returning' && isStanding) {
      squatStateRef.current = 'standing';
      setSquatCount((pre) => pre + 1);
      rewardSound?.play().catch((err) => console.error('音效播放失败:', err));
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
          className="fixed top-[20px] left-[20px] text-[#fff] p-[10px] rounded-[10px]"
          onClick={() => {
            rewardSoundRef.current?.play().catch((err) => console.error('音效播放失败:', err));
          }}
        >
          深蹲次数: {squatCount}
        </div>
      </div>
      <div style={{ display: enableCamera ? 'none' : 'block' }}>
        <Button onClick={() => enableCamHandler()}>打开摄像头</Button>
      </div>
      <Toaster visibleToasts={1} />
    </>
  );
}

export default DeepSquat;
