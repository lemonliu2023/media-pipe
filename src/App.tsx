import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import DeepSquat from './DeepSquat';

function App() {
  const [loadingModel, setLoadingModel] = useState(false);
  const poseLandmarkerRef = useRef<PoseLandmarker>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
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
          modelAssetPath: `${window.location.href}/pose_landmarker_lite.task`,
          delegate: 'GPU',
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

export default App;
