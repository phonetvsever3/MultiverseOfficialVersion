import { useRef, useState, useEffect } from "react";

interface IntroPlayerProps {
  onDone: () => void;
}

export default function IntroPlayer({ onDone }: IntroPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);

  const finish = () => {
    setFading(true);
    setTimeout(onDone, 500);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch(() => finish());

    const onEnded = () => finish();
    const onError = () => finish();

    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[500] bg-black flex items-center justify-center"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.5s ease" }}
      data-testid="intro-player"
    >
      <video
        ref={videoRef}
        src="/api/intro/video"
        playsInline
        muted={false}
        autoPlay
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />
    </div>
  );
}
