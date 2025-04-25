'use client';
import { Button } from '@/components/ui/button';
import { Landmark, NormalizedLandmark, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { throttle } from 'lodash-es';
import { Toaster } from '@/components/ui/sonner';
import Chart from 'chart.js/auto';
import 'chartjs-plugin-annotation';

interface HistoryItemType {
  kneeAngle: number;
  leftKneeAngle: number;
  rightKneeAngle: number;
  hipY: number;
  kneeY: number;
  backTilt: number;
  timestamp: number;
}

const history: HistoryItemType[] = [];
const WINDOW_SIZE = 8; // 窗口大小，约 0.15-0.2 秒

let toastMessage = '';

// 节流函数
const throttleToast = throttle((message: string) => {
  if (toastMessage === message) return;
  toastMessage = message;
  toast(message);
}, 1000);

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
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [squatCount, setSquatCount] = useState(0);
  const squatStateRef = useRef<'standing' | 'squatting' | 'returning'>('standing');
  const rewardSoundRef = useRef<HTMLAudioElement | undefined>(typeof Audio !== 'undefined' ? new Audio(`${location.href}/silent_1s.mp3`) : undefined);

  // 初始化 canvas 上下文
  useEffect(() => {
    if (canvasRef.current) {
      canvasCtxRef.current = canvasRef.current.getContext('2d');
      if (!canvasCtxRef.current) {
        console.error('Failed to get canvas context');
      }
    }
  }, []);

  // 初始化角度曲线图
  useEffect(() => {
    if (chartCanvasRef.current) {
      chartRef.current = new Chart(chartCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: '平均膝盖角度',
              data: [],
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              fill: false,
              tension: 0.1,
            },
            {
              label: '左膝角度',
              data: [],
              borderColor: 'rgba(255, 99, 132, 1)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              fill: false,
              tension: 0.1,
            },
            {
              label: '右膝角度',
              data: [],
              borderColor: 'rgba(54, 162, 235, 1)',
              backgroundColor: 'rgba(54, 162, 235, 0.2)',
              fill: false,
              tension: 0.1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              display: true,
              title: { display: true, text: '时间 (秒)', color: 'white' },
              ticks: { color: 'white' },
            },
            y: {
              display: true,
              title: { display: true, text: '角度 (度)', color: 'white' },
              ticks: { color: 'white' },
              suggestedMin: 0,
              suggestedMax: 180,
            },
          },
          plugins: {
            legend: { labels: { color: 'white' } },
            annotation: {
              annotations: {
                squatThreshold: {
                  type: 'line',
                  yMin: 125,
                  yMax: 125,
                  borderColor: 'rgba(255, 0, 0, 0.5)',
                  borderWidth: 2,
                  label: { content: '下蹲阈值', display: true, position: 'start' },
                },
                standThreshold: {
                  type: 'line',
                  yMin: 135,
                  yMax: 135,
                  borderColor: 'rgba(0, 255, 0, 0.5)',
                  borderWidth: 2,
                  label: { content: '站立阈值', display: true, position: 'start' },
                },
              },
            },
          },
        },
      });
    }
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  // 更新曲线图
  const updateChart = useCallback((leftKneeAngle: number, rightKneeAngle: number, averageKneeAngle: number, timestamp: number) => {
    if (!chartRef.current) return;
    const timeInSeconds = (timestamp / 1000).toFixed(2);
    chartRef.current.data.labels!.push(timeInSeconds);
    chartRef.current.data.datasets[0].data.push(averageKneeAngle);
    chartRef.current.data.datasets[1].data.push(leftKneeAngle);
    chartRef.current.data.datasets[2].data.push(rightKneeAngle);

    // 保持 10 秒数据
    if (chartRef.current.data.labels!.length > 300) {
      chartRef.current.data.labels!.shift();
      chartRef.current.data.datasets.forEach((dataset) => dataset.data.shift());
    }

    chartRef.current.update();
  }, []);

  // 调整 canvas 尺寸
  const resizeCanvas = useCallback(() => {
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
  }, [width, height]);

  useEffect(() => {
    resizeCanvas();
  }, [resizeCanvas]);

  // 打开摄像头
  const enableCamHandler = useCallback(() => {
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
        throttleToast('请确保全身可见，站立时保持膝盖伸直');
        const audio = rewardSoundRef.current;
        audio?.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          rewardSoundRef.current = new Audio(`${location.href}/mario-coin.wav`);
        });
      })
      .catch((err) => {
        console.error('Camera error:', err);
        throttleToast('无法打开摄像头，请检查权限');
      });
  }, [resizeCanvas]);

  // 开始姿势检测
  const startPoseDetection = useCallback(async () => {
    async function processFrame() {
      if (!videoRef.current) return;
      if (videoRef.current.readyState >= 2) {
        const results = await poseLandmarkerRef.current?.detectForVideo(videoRef.current, performance.now());
        if (results) {
          onResults(results);
        }
      }
      requestAnimationFrame(processFrame);
    }
    processFrame();
  }, []);

  // 处理姿势检测结果
  const onResults = useCallback((results: PoseLandmarkerResult) => {
    const canvasCtx = canvasCtxRef.current;
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasCtx || !videoElement || !canvasElement) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (results.landmarks && results.landmarks.length > 0) {
      drawLandmarks(results.landmarks[0]);
      detectSquat(results.landmarks[0]);
    } else {
      // throttleToast('请确保身体在摄像头前可见');
    }
  }, []);

  // 绘制姿势关键点和连接线
  const drawLandmarks = useCallback((landmarks: NormalizedLandmark[]) => {
    const canvasCtx = canvasCtxRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasCtx || !canvasElement) return;

    canvasCtx.fillStyle = 'red';
    canvasCtx.strokeStyle = 'green';
    canvasCtx.lineWidth = 2;

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

    for (const landmark of landmarks) {
      if (isLandmarkVisible(landmark)) {
        canvasCtx.beginPath();
        canvasCtx.arc((1 - landmark.x) * canvasElement.width, landmark.y * canvasElement.height, 5, 0, 2 * Math.PI);
        canvasCtx.fill();
      }
    }
  }, []);

  // 判断关键点是否可见
  const isLandmarkVisible = useCallback((landmark: NormalizedLandmark) => {
    if (landmark.visibility < 0.5) return false;
    return landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1;
  }, []);

  // 检测深蹲动作
  const detectSquat = useCallback((landmarks: NormalizedLandmark[]) => {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];

    const calculateAngle = (a: Landmark, b: Landmark, c: Landmark) => {
      const vectorBA = { x: a.x - b.x, y: a.y - b.y };
      const vectorBC = { x: c.x - b.x, y: c.y - b.y };
      const dotProduct = vectorBA.x * vectorBC.x + vectorBA.y * vectorBC.y;
      const magnitudeBA = Math.sqrt(vectorBA.x ** 2 + vectorBA.y ** 2);
      const magnitudeBC = Math.sqrt(vectorBC.x ** 2 + vectorBC.y ** 2);
      const cosTheta = dotProduct / (magnitudeBA * magnitudeBC);
      return Math.acos(Math.min(Math.max(cosTheta, -1), 1)) * (180 / Math.PI);
    };

    let averageKneeAngle = 0;
    let leftKneeAngle = NaN;
    let rightKneeAngle = NaN;

    const leftVisible = isLandmarkVisible(leftHip) && isLandmarkVisible(leftKnee) && isLandmarkVisible(leftAnkle);
    const rightVisible = isLandmarkVisible(rightHip) && isLandmarkVisible(rightKnee) && isLandmarkVisible(rightAnkle);

    if (leftVisible) {
      leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    }
    if (rightVisible) {
      rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    }

    // 选择更小的角度（更接近下蹲）
    if (leftVisible && rightVisible) {
      averageKneeAngle = Math.min(leftKneeAngle, rightKneeAngle);
    } else if (leftVisible) {
      averageKneeAngle = leftKneeAngle;
    } else if (rightVisible) {
      averageKneeAngle = rightKneeAngle;
    } else {
      // throttleToast('请确保身体在摄像头前可见');
      return;
    }

    const averageHipY = (leftVisible ? leftHip.y : 0 + (rightVisible ? rightHip.y : 0)) / (leftVisible && rightVisible ? 2 : 1);
    const averageKneeY = (leftVisible ? leftKnee.y : 0 + (rightVisible ? rightKnee.y : 0)) / (leftVisible && rightVisible ? 2 : 1);

    const shoulderVisible = isLandmarkVisible(leftShoulder) && isLandmarkVisible(rightShoulder);
    let backTilt = 0;
    if (shoulderVisible && (leftVisible || rightVisible)) {
      const averageShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const averageShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const averageHipX = (leftVisible ? leftHip.x : 0 + (rightVisible ? rightHip.x : 0)) / (leftVisible && rightVisible ? 2 : 1);
      const backAngle = Math.atan2(averageHipY - averageShoulderY, averageHipX - averageShoulderX) * (180 / Math.PI);
      backTilt = Math.abs(backAngle - 90);
    }

    // 调试输出关键点坐标
    console.log({
      leftHip: leftVisible ? { x: leftHip.x.toFixed(2), y: leftHip.y.toFixed(2) } : 'invisible',
      leftKnee: leftVisible ? { x: leftKnee.x.toFixed(2), y: leftKnee.y.toFixed(2) } : 'invisible',
      leftAnkle: leftVisible ? { x: leftAnkle.x.toFixed(2), y: leftAnkle.y.toFixed(2) } : 'invisible',
      rightHip: rightVisible ? { x: rightHip.x.toFixed(2), y: rightHip.y.toFixed(2) } : 'invisible',
      rightKnee: rightVisible ? { x: rightKnee.x.toFixed(2), y: rightKnee.y.toFixed(2) } : 'invisible',
      rightAnkle: rightVisible ? { x: rightAnkle.x.toFixed(2), y: rightAnkle.y.toFixed(2) } : 'invisible',
      leftKneeAngle: leftKneeAngle.toFixed(2),
      rightKneeAngle: rightKneeAngle.toFixed(2),
      averageKneeAngle: averageKneeAngle.toFixed(2),
      hipY: averageHipY.toFixed(2),
      kneeY: averageKneeY.toFixed(2),
      backTilt: backTilt.toFixed(2),
      squatState: squatStateRef.current,
    });

    updateChart(leftKneeAngle, rightKneeAngle, averageKneeAngle, performance.now());

    history.push({
      kneeAngle: averageKneeAngle,
      leftKneeAngle,
      rightKneeAngle,
      hipY: averageHipY,
      kneeY: averageKneeY,
      backTilt,
      timestamp: performance.now()
    });

    // 保持窗口大小
    if (history.length > WINDOW_SIZE) {
      history.shift();
    }

    if (history.length < WINDOW_SIZE) {
      throttleToast('请开始深蹲');
      return;
    }

    if (history.length >= WINDOW_SIZE) {
      const fps = history.length / ((history[history.length - 1].timestamp - history[0].timestamp) / 1000);
      console.log(`FPS: ${fps.toFixed(2)}`);
    }

    const kneeAngles = history.map((h) => h.kneeAngle);
    const hipYs = history.map((h) => h.hipY);
    const kneeYs = history.map((h) => h.kneeY);
    const backTilts = history.map((h) => h.backTilt);

    const avgKneeAngle = kneeAngles.reduce((sum, val) => sum + val, 0) / kneeAngles.length;
    const avgHipY = hipYs.reduce((sum, val) => sum + val, 0) / hipYs.length;
    const avgKneeY = kneeYs.reduce((sum, val) => sum + val, 0) / kneeYs.length;
    const avgBackTilt = backTilts.reduce((sum, val) => sum + val, 0) / backTilts.length;

    console.log({
      avgKneeAngle: avgKneeAngle.toFixed(2),
      avgHipY: avgHipY.toFixed(2),
      avgKneeY: avgKneeY.toFixed(2),
      avgBackTilt: avgBackTilt.toFixed(2),
      squatState: squatStateRef.current,
    });

    // 检测动作速度
    const angleRange = Math.max(...kneeAngles) - Math.min(...kneeAngles);
    const timeSpan = (history[history.length - 1].timestamp - history[0].timestamp) / 1000;
    if (angleRange > 30 && timeSpan < 0.2) {
      throttleToast('动作太快，请缓慢深蹲');
    }

    const isSquatting = avgKneeAngle < 125 && avgHipY > avgKneeY * 0.75;
    const isStanding = avgKneeAngle > 135 && avgHipY < avgKneeY * 0.8;

    let feedbackMessage = '';
    if (avgKneeAngle < 135) {
      if (avgHipY < avgKneeY * 0.75) {
        feedbackMessage = '请蹲得更低';
      } else if (avgBackTilt > 20) {
        feedbackMessage = '请保持背部直立';
      }
    } else {
      feedbackMessage = '请开始深蹲';
    }

    if (feedbackMessage) {
      throttleToast(feedbackMessage);
    }

    const rewardSound = rewardSoundRef.current;
    const squatState = squatStateRef.current;

    if (squatState === 'standing' && isSquatting) {
      squatStateRef.current = 'squatting';
    } else if (squatState === 'squatting' && isStanding) {
      squatStateRef.current = 'returning';
    } else if (squatState === 'returning' && isStanding) {
      squatStateRef.current = 'standing';
      setSquatCount((prevCount) => prevCount + 1);
      rewardSound?.play().catch((err) => console.error('音效播放失败:', err));
    }
  }, []);

  return (
    <>
      <div className="relative bg-[#000]" style={{ width, height, display: enableCamera ? 'block' : 'none' }}>
        <div id="render-wrapper" className="flex justify-center items-center">
          <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
          <canvas ref={canvasRef} width={width} height={height} />
        </div>
        <div
          id="counter"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          className="fixed top-[20px] left-[20px] text-[#fff] p-[10px] rounded-[10px]"
          onClick={() => {
            rewardSoundRef.current?.play().catch((err) => console.error('音效播放失败:', err));
          }}
        >
          深蹲次数: {squatCount}
        </div>
        <div
          id="chart-container"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '350px',
            height: '200px',
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '10px',
            borderRadius: '5px',
          }}
        >
          <canvas ref={chartCanvasRef} />
        </div>
      </div>
      <div style={{ display: enableCamera ? 'none' : 'block' }}>
        <Button onClick={enableCamHandler}>打开摄像头</Button>
      </div>
      <Toaster visibleToasts={1} />
    </>
  );
}

export default DeepSquat;
