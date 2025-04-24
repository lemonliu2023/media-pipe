'use client';
import { useEffect, useRef, useState } from 'react';
import DeepSquat from './components/DeepSquat';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export default function Home() {
  const [loadingModel, setLoadingModel] = useState(true);
  const poseLandmarkerRef = useRef<PoseLandmarker>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize(); // 初始化大小
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    setLoadingModel(true);
    const createPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(`${window.location.href}/wasm`);
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${window.location.href}/pose_landmarker_full.task`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1, // 设置同时检测的最大姿态数量
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    };
    createPoseLandmarker().then(() => {
      setLoadingModel(false);
    });
  }, []);

  return (
    <div className="flex justify-center items-center h-screen overflow-hidden">
      {loadingModel ? <div>模型加载中...</div> : <DeepSquat width={size.width} height={size.height} poseLandmarkerRef={poseLandmarkerRef} />}
    </div>
  );
}
