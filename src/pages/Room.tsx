import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, Shuffle, SkipForward, SkipBack, Volume2, Loader2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  
  const [isHost, setIsHost] = useState(false);
  const [userName, setUserName] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [playlist, setPlaylist] = useState<Array<{id: string; title: string; artist: string; url: string}>>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isLoading, setIsLoading] = useState(true);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const mockSongs = [
    { id: "1", title: "Chill Vibes", artist: "LoFi Beats", url: "/test.mp3" },
    { id: "2", title: "Midnight Drive", artist: "Synthwave", url: "/test.mp3" },
    { id: "3", title: "Rainy Day Jazz", artist: "Coffee Shop", url: "/test.mp3" },
    { id: "4", title: "Deep Focus", artist: "Study Music", url: "/test.mp3" },
    { id: "5", title: "Night Walk", artist: "Ambient Sounds", url: "/test.mp3" },
  ];

  useEffect(() => {
    setTimeout(() => {
      setUserName(`User${Math.floor(Math.random() * 1000)}`);
      setIsHost(Math.random() > 0.5);
      setUsers([`User${Math.floor(Math.random() * 1000)}`, `User${Math.floor(Math.random() * 1000)}`]);
      setPlaylist(mockSongs);
      setIsLoading(false);
    }, 1000);
  }, [code]);

  useEffect(() => {
    if (audioRef) {
      audioRef.volume = volume;
    }
  }, [volume, audioRef]);

  const handlePlayPause = () => {
    if (audioRef) {
      if (isPlaying) {
        audioRef.pause();
      } else {
        if (currentSongIndex === -1 && playlist.length > 0) {
          setCurrentSongIndex(0);
        }
        audioRef.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkipNext = () => {
    if (playlist.length === 0) return;
    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentSongIndex + 1) % playlist.length;
    }
    setCurrentSongIndex(nextIndex);
    if (audioRef) {
      audioRef.src = playlist[nextIndex].url;
      audioRef.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSkipPrevious = () => {
    if (playlist.length === 0) return;
    let prevIndex;
    if (isShuffle) {
      prevIndex = Math.floor(Math.random() * playlist.length);
    } else {
      prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    }
    setCurrentSongIndex(prevIndex);
    if (audioRef) {
      audioRef.src = playlist[prevIndex].url;
      audioRef.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleShuffleToggle = () => {
    setIsShuffle(!isShuffle);
  };

  const handleAddToPlaylist = () => {
    alert("Add song feature coming soon!");
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-black border-t-transparent animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Room Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-black">Room {code}</h1>
            <div className="flex items-center gap-2">
              {isHost && (
                <span className="bg-black text-white px-3 py-1 text-xs font-medium">Host</span>
              )}
              <Button variant="outline" onClick={handleLeaveRoom} size="sm" className="border-gray-400 text-black hover:bg-gray-100">
                Leave Room
              </Button>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur-md border border-gray-300 p-4">
            <p className="text-gray-600">Users in room: {users.length}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {users.map((user, index) => (
                <span key={index} className="bg-gray-100 px-2 py-1 text-xs border border-gray-300 text-black">{user}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Music Player Card */}
        <Card className="mb-6 bg-white border-gray-300">
          <CardHeader className="pb-4 border-b border-gray-200">
            <CardTitle className="text-xl text-black">Now Playing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {currentSongIndex >= 0 && currentSongIndex < playlist.length ? (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-black">{playlist[currentSongIndex].title}</h2>
                  <p className="text-gray-600">{playlist[currentSongIndex].artist}</p>
                </div>
                
                <div className="flex items-center justify-center space-x-6">
                  <Button variant="ghost" onClick={handleSkipPrevious} size="icon" aria-label="Previous" className="text-black hover:bg-gray-100">
                    <SkipBack className="h-5 w-5" />
                  </Button>
                  
                  <Button 
                    onClick={handlePlayPause} 
                    className="w-14 h-14 bg-black hover:bg-gray-800 flex items-center justify-center"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <Pause className="h-6 w-6 text-white" />
                    ) : (
                      <Play className="h-6 w-6 text-white" />
                    )}
                  </Button>
                  
                  <Button variant="ghost" onClick={handleSkipNext} size="icon" aria-label="Next" className="text-black hover:bg-gray-100">
                    <SkipForward className="h-5 w-5" />
                  </Button>
                </div>
                
                <div className="flex items-center justify-between px-4 text-sm text-gray-500">
                  <span>0:00</span>
                  <span>0:00</span>
                </div>
                
                <div className="flex items-center justify-between px-4">
                  <Button variant="ghost" onClick={handleShuffleToggle} size="icon" 
                    className={`${isShuffle ? "text-black bg-gray-200" : "text-gray-600 hover:bg-gray-100 hover:text-black"}`}>
                    <Shuffle className="h-5 w-5" />
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-gray-600" />
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={volume} 
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-20 accent-black"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No song selected</p>
                <Button onClick={handleAddToPlaylist} className="mt-4 bg-black hover:bg-gray-800 text-white">
                  Add to Playlist
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Playlist Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Playlist */}
          <Card className="lg:col-span-2 bg-white border-gray-300">
            <CardHeader className="pb-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl text-black">Playlist</CardTitle>
                <Button onClick={handleAddToPlaylist} size="sm" variant="outline" className="border-gray-400 text-black hover:bg-gray-100">
                  Add Song
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {playlist.length > 0 ? (
                playlist.map((song, index) => (
                  <div 
                    key={song.id} 
                    className={`flex items-center justify-between px-3 py-2 transition-colors ${
                      index === currentSongIndex ? "bg-gray-200" : "hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-black">{song.title}</div>
                      <div className="text-sm text-gray-600">{song.artist}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {index + 1}/{playlist.length}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-4 text-gray-500">Playlist is empty</p>
              )}
            </CardContent>
          </Card>

          {/* Controls (Host only) */}
          {!isHost ? null : (
            <Card className="bg-white border-gray-300">
              <CardHeader className="pb-4 border-b border-gray-200">
                <CardTitle className="text-xl text-black">Host Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <Button 
                  onClick={() => alert("Transfer host feature coming soon!")} 
                  className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                >
                  Transfer Host
                </Button>
                
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Playback Mode:</p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-black">
                      <input 
                        type="radio" 
                        checked={!isShuffle} 
                        onChange={() => setIsShuffle(false)} 
                        className="h-4 w-4 accent-black"
                      />
                      <span>Sequential</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-black">
                      <input 
                        type="radio" 
                        checked={isShuffle} 
                        onChange={() => setIsShuffle(true)} 
                        className="h-4 w-4 accent-black"
                      />
                      <span>Shuffle</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Audio Element */}
      <audio 
        ref={setAudioRef} 
        onEnded={handleSkipNext}
        preload="metadata"
      />
    </div>
  );
};

export default Room;