
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import SearchExamples from "@/components/SearchExamples";

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-white to-blue-50">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-text">
          ConnectLTV
        </h1>
        
        <p className="text-lg text-gray-700 mb-10 max-w-2xl mx-auto">
          Welcome to ConnectLTV – your gateway to a dynamic network of Harvard Business School's Launching Tech Venture alumni. Simply type your query, and ConnectLTV will identify the alumni best suited to support you.
        </p>

        <div className="mb-8 w-full max-w-2xl mx-auto">
          <label htmlFor="search-query" className="block text-left text-md font-medium text-gray-700 mb-2">
            What guidance or expertise are you looking for?
          </label>
          <div className="relative">
            <Input
              id="search-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Founder, Product Manager, Financial Services, Amazon, etc."
              className="pr-24 h-14 text-base"
            />
            <Button 
              className="absolute right-1 top-1 bottom-1 bg-accent1 hover:bg-accent1-hover px-6"
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
