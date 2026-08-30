import React from "react";

const UploadTip: React.FC = () => {
  return (
    <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
      <p className="font-bold text-black uppercase">🎧 Tip for your own music:</p>
      <p>You can add any MP3 link from GitHub, or upload your local test.mp3 file directly using the "Add Track" button.</p>
    </div>
  );
};

export default UploadTip;