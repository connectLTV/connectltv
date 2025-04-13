
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import SearchExamples from "@/components/SearchExamples";

// Array of campus videos to cycle through
const backgroundVideos = [
  "https://assets.lovable.dev/harvard-campus-1.mp4",
  "https://assets.lovable.dev/harvard-campus-2.mp4",
  "https://assets.lovable.dev/harvard-campus-3.mp4",
];

const LandingPage: React.FC = () => {
  const [query, setQuery] = useState("");
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const navigate = useNavigate();

  // Change background video every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % backgroundVideos.length);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = () => {
    if (query.trim()) {
      navigate(`/results?query=${encodeURIComponent(query)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Dynamic video background */}
      <div className="absolute inset-0 w-full h-full z-0">
        <div className="absolute inset-0 bg-black/40 z-10"></div>
        <video
          key={currentVideoIndex}
          autoPlay
          muted
          loop
          className="w-full h-full object-cover"
          playsInline
        >
          <source src={backgroundVideos[currentVideoIndex]} type="video/mp4" />
        </video>
      </div>

      <div className="w-full max-w-3xl text-center relative z-20 px-6">
        <h1 className="text-6xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-red-700 via-red-600 to-red-800 animate-gradient">
          ConnectLTV
        </h1>
        
        <p className="text-lg text-white mb-10 max-w-2xl mx-auto font-medium drop-shadow-lg">
          Welcome to ConnectLTV – your gateway to a dynamic network of Harvard Business School's Launching Tech Venture alumni. Simply type your query, and ConnectLTV will identify the alumni best suited to support you.
        </p>

        <div className="mb-8 w-full max-w-2xl mx-auto backdrop-blur-sm bg-white/20 p-6 rounded-xl shadow-xl">
          <label htmlFor="search-query" className="block text-left text-md font-medium text-white mb-2">
            What guidance or expertise are you looking for?
          </label>
          <div className="relative">
            <Input
              id="search-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Founder, Product Manager, Financial Services, Amazon, etc."
              className="pr-24 h-14 text-base bg-white/90 border-none"
            />
            <Button 
              className="absolute right-1 top-1 bottom-1 bg-red-800 hover:bg-red-900 px-6"
              onClick={handleSearch}
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </div>
        </div>

        <SearchExamples setQuery={setQuery} handleSearch={handleSearch} />
      </div>
    </div>
  );
};

export default LandingPage;
