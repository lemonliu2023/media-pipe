import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import Predict from './Predict';

function App() {
  const [loadingModel, setLoadingModel] = useState(false);
  const poseLandmarkerRef = useRef<PoseLandmarker>(null);

  useEffect(() => {
    setLoadingModel(true);
    const createPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm');
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1, // 设置同时检测的最大姿态数量
      });
    };
    createPoseLandmarker().then(() => {
      setLoadingModel(false);
    });
  }, []);

  return (
    <div className="flex justify-center items-center h-screen overflow-hidden">
      {loadingModel ? <div>模型加载中...</div> : <Predict poseLandmarkerRef={poseLandmarkerRef} />}
    </div>
  );
}

export default App;
