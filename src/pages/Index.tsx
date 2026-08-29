import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-900 to-blue-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center space-y-8 max-w-md">
        <h1 className="text-4xl font-bold tracking-tight">
          Jam Together
        </h1>
        <p className="text-lg text-blue-200">
          Create a room and listen to music in perfect sync with your partner
        </p>
        <div className="flex flex-col space-y-4 w-full">
          <Link
            to="/create-room"
            className="w-full flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-sm font-medium rounded-lg transition-colors"
          >
            Create Room
          </Link>
          <Link
            to="/join-room"
            className="w-full flex items-center justify-center px-8 py-3 border border-blue-600 hover:bg-blue-600 text-sm font-medium rounded-lg transition-colors"
          >
            Join Room
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Index;