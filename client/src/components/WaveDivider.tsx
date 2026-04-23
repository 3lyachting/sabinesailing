interface WaveDividerProps {
  fill?: string;
  className?: string;
  flip?: boolean;
}

export default function WaveDivider({ fill = "#FDFCFB", className = "", flip = false }: WaveDividerProps) {
  return (
    <div className={`w-full overflow-hidden leading-none ${className}`} style={{ transform: flip ? "scaleY(-1)" : "none" }}>
      <svg
        viewBox="0 0 1440 80"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="w-full h-12 md:h-16 lg:h-20"
      >
        <path
          d="M0,40 C180,80 360,0 540,40 C720,80 900,0 1080,40 C1260,80 1380,20 1440,40 L1440,80 L0,80 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}
