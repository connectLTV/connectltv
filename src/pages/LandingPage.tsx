
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const LandingPage: React.FC = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

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
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="w-full py-4 px-6 md:px-12">
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-harvard-crimson mr-4">ConnectLTV</h1>
          <span className="text-gray-600 text-sm">Harvard Business School</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900">
            Find the perfect alumni connection
          </h1>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Quickly identify the most helpful HBS Launching Tech Ventures alumni for your specific needs
          </p>

          <div className="relative w-full max-w-3xl mx-auto">
            <div className="flex rounded-lg border border-gray-300 overflow-hidden shadow-sm">
              <div className="flex items-center pl-4 text-gray-400">
                <Search size={20} />
              </div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search for alumni expertise, industry, company, role..."
                className="border-0 h-12 text-base flex-grow"
              />
              <Button 
                onClick={handleSearch}
                className="h-12 px-6 rounded-none bg-harvard-crimson hover:bg-harvard-crimson-light text-white"
              >
                Search
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">
              Try searching for "AI startups", "VCs in Boston", or "Product Management experts"
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-sm text-gray-500">
        <p>© 2025 Harvard Business School Launching Tech Ventures Alumni Network</p>
        <p className="mt-1">Connect with 2,500+ alumni spanning 15 years of innovation leadership</p>
      </footer>
    </div>
  );
};

export default LandingPage;
